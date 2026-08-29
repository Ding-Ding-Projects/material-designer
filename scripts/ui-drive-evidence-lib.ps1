[CmdletBinding()]
param()

$script:UIJsonUnsafeKeys = @('__proto__', 'prototype', 'constructor')

function Assert-UIPathHasNoReparsePoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [switch]$AllowMissingLeaf
    )

    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    if ([string]::IsNullOrWhiteSpace($root)) { throw 'Evidence path has no filesystem root.' }
    $current = $root
    $separators = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $parts = $full.Substring($root.Length).Split($separators, [StringSplitOptions]::RemoveEmptyEntries)
    for ($index = 0; $index -lt $parts.Count; $index++) {
        $current = [IO.Path]::Combine($current, $parts[$index])
        if (-not (Test-Path -LiteralPath $current)) {
            if ($AllowMissingLeaf -and $index -eq ($parts.Count - 1)) { break }
            throw 'Evidence path contains a missing component.'
        }
        $item = Get-Item -LiteralPath $current -Force
        $hasLinkType = $null -ne $item.PSObject.Properties['LinkType'] -and -not [string]::IsNullOrWhiteSpace([string]$item.LinkType)
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $hasLinkType) {
            throw 'Evidence path contains a symlink, junction, or reparse component.'
        }
    }
    return $full
}

function Resolve-UIEvidencePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$EvidenceRoot,
        [Parameter(Mandatory = $true)] [string]$Path,
        [switch]$AllowMissingLeaf
    )

    $rootFull = Assert-UIPathHasNoReparsePoint -Path $EvidenceRoot
    if (-not (Test-Path -LiteralPath $rootFull -PathType Container)) { throw 'Canonical evidence root is missing.' }
    $candidate = if ([IO.Path]::IsPathRooted($Path)) { [IO.Path]::GetFullPath($Path) } else { [IO.Path]::GetFullPath((Join-Path $rootFull $Path)) }
    $prefix = $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence path escapes the canonical evidence root.' }
    [void](Assert-UIPathHasNoReparsePoint -Path $candidate -AllowMissingLeaf:$AllowMissingLeaf)
    return $candidate
}

function Skip-UIJsonWhitespace {
    param([hashtable]$State)
    while ($State.Index -lt $State.Text.Length -and [char]::IsWhiteSpace($State.Text[$State.Index])) { $State.Index++ }
}

function Read-UIJsonStringToken {
    param([hashtable]$State)
    if ($State.Text[$State.Index] -ne '"') { throw 'Strict JSON admission expected a string.' }
    $State.Index++
    $builder = [Text.StringBuilder]::new()
    while ($State.Index -lt $State.Text.Length) {
        $character = $State.Text[$State.Index++]
        if ($character -eq '"') {
            if ($builder.Length -gt $State.MaxStringLength) { throw 'Strict JSON admission rejected an oversized string.' }
            return $builder.ToString()
        }
        if ([int][char]$character -lt 32) { throw 'Strict JSON admission rejected an unescaped control character.' }
        if ($character -ne '\') {
            [void]$builder.Append($character)
            if ($builder.Length -gt $State.MaxStringLength) { throw 'Strict JSON admission rejected an oversized string.' }
            continue
        }
        if ($State.Index -ge $State.Text.Length) { throw 'Strict JSON admission found an incomplete escape.' }
        $escape = $State.Text[$State.Index++]
        switch ($escape) {
            '"' { [void]$builder.Append('"') }
            '\' { [void]$builder.Append('\') }
            '/' { [void]$builder.Append('/') }
            'b' { [void]$builder.Append([char]8) }
            'f' { [void]$builder.Append([char]12) }
            'n' { [void]$builder.Append([char]10) }
            'r' { [void]$builder.Append([char]13) }
            't' { [void]$builder.Append([char]9) }
            'u' {
                if (($State.Index + 4) -gt $State.Text.Length) { throw 'Strict JSON admission found an incomplete Unicode escape.' }
                $hex = $State.Text.Substring($State.Index, 4)
                if ($hex -notmatch '^[0-9a-fA-F]{4}$') { throw 'Strict JSON admission rejected an invalid Unicode escape.' }
                [void]$builder.Append([char][Convert]::ToInt32($hex, 16))
                $State.Index += 4
            }
            default { throw 'Strict JSON admission rejected an invalid escape.' }
        }
        if ($builder.Length -gt $State.MaxStringLength) { throw 'Strict JSON admission rejected an oversized string.' }
    }
    throw 'Strict JSON admission found an unterminated string.'
}

function Read-UIJsonValueToken {
    param([hashtable]$State, [int]$Depth)
    if ($Depth -gt $State.MaxDepth) { throw 'Strict JSON admission rejected excessive nesting depth.' }
    Skip-UIJsonWhitespace $State
    if ($State.Index -ge $State.Text.Length) { throw 'Strict JSON admission found an incomplete value.' }
    $character = $State.Text[$State.Index]
    if ($character -eq '{') {
        $State.Index++
        $keys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        $propertyCount = 0
        Skip-UIJsonWhitespace $State
        if ($State.Index -lt $State.Text.Length -and $State.Text[$State.Index] -eq '}') { $State.Index++; return }
        while ($true) {
            Skip-UIJsonWhitespace $State
            if ($State.Index -ge $State.Text.Length -or $State.Text[$State.Index] -ne '"') { throw 'Strict JSON admission expected an object key.' }
            $key = Read-UIJsonStringToken $State
            if (-not $keys.Add($key)) { throw 'Strict JSON admission rejected a duplicate object key.' }
            if ($script:UIJsonUnsafeKeys -contains $key.ToLowerInvariant()) { throw 'Strict JSON admission rejected an unsafe object key.' }
            $propertyCount++
            if ($propertyCount -gt $State.MaxObjectProperties) { throw 'Strict JSON admission rejected excessive object properties.' }
            Skip-UIJsonWhitespace $State
            if ($State.Index -ge $State.Text.Length -or $State.Text[$State.Index] -ne ':') { throw 'Strict JSON admission expected a colon.' }
            $State.Index++
            Read-UIJsonValueToken $State ($Depth + 1)
            Skip-UIJsonWhitespace $State
            if ($State.Index -ge $State.Text.Length) { throw 'Strict JSON admission found an incomplete object.' }
            if ($State.Text[$State.Index] -eq '}') { $State.Index++; return }
            if ($State.Text[$State.Index] -ne ',') { throw 'Strict JSON admission expected an object comma.' }
            $State.Index++
        }
    }
    if ($character -eq '[') {
        $State.Index++
        $itemCount = 0
        Skip-UIJsonWhitespace $State
        if ($State.Index -lt $State.Text.Length -and $State.Text[$State.Index] -eq ']') { $State.Index++; return }
        while ($true) {
            $itemCount++
            if ($itemCount -gt $State.MaxArrayLength) { throw 'Strict JSON admission rejected an oversized array.' }
            Read-UIJsonValueToken $State ($Depth + 1)
            Skip-UIJsonWhitespace $State
            if ($State.Index -ge $State.Text.Length) { throw 'Strict JSON admission found an incomplete array.' }
            if ($State.Text[$State.Index] -eq ']') { $State.Index++; return }
            if ($State.Text[$State.Index] -ne ',') { throw 'Strict JSON admission expected an array comma.' }
            $State.Index++
        }
    }
    if ($character -eq '"') { [void](Read-UIJsonStringToken $State); return }
    foreach ($literal in @('true', 'false', 'null')) {
        if (($State.Index + $literal.Length) -le $State.Text.Length -and $State.Text.Substring($State.Index, $literal.Length) -ceq $literal) {
            $State.Index += $literal.Length
            return
        }
    }
    $numberPattern = [regex]::new('-?(?:0|[1-9][0-9]*)(?:[.][0-9]+)?(?:[eE][+-]?[0-9]+)?')
    $number = $numberPattern.Match($State.Text, $State.Index)
    if (-not $number.Success -or $number.Index -ne $State.Index) { throw 'Strict JSON admission rejected an invalid value.' }
    $State.Index += $number.Length
}

function Read-UIStrictJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [int]$MaxBytes = 4194304,
        [int]$MaxDepth = 32,
        [int]$MaxStringLength = 4096,
        [int]$MaxArrayLength = 10000,
        [int]$MaxObjectProperties = 256,
        [switch]$SkipReparseCheck
    )

    $full = if ($SkipReparseCheck) { [IO.Path]::GetFullPath($Path) } else { Assert-UIPathHasNoReparsePoint -Path $Path }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw 'Strict JSON admission input is missing.' }
    $bytes = [IO.File]::ReadAllBytes($full)
    if ($bytes.Length -gt $MaxBytes) { throw 'Strict JSON admission rejected an oversized byte payload.' }
    $offset = if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) { 3 } else { 0 }
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    $text = $encoding.GetString($bytes, $offset, $bytes.Length - $offset)
    $state = @{
        Text = $text
        Index = 0
        MaxDepth = $MaxDepth
        MaxStringLength = $MaxStringLength
        MaxArrayLength = $MaxArrayLength
        MaxObjectProperties = $MaxObjectProperties
    }
    Read-UIJsonValueToken $state 1
    Skip-UIJsonWhitespace $state
    if ($state.Index -ne $state.Text.Length) { throw 'Strict JSON admission rejected trailing content.' }
    try { return ($text | ConvertFrom-Json) } catch { throw 'Strict JSON object conversion failed after admission.' }
}

function Get-UICanonicalJson {
    param($Value)
    return ($Value | ConvertTo-Json -Depth 100 -Compress)
}

function Resolve-UISchemaReference {
    param($RootSchema, [string]$Reference)
    if (-not $Reference.StartsWith('#/')) { throw 'Only local JSON Schema references are permitted.' }
    $current = $RootSchema
    foreach ($segment in $Reference.Substring(2).Split('/')) {
        $name = $segment.Replace('~1', '/').Replace('~0', '~')
        $property = $current.PSObject.Properties[$name]
        if ($null -eq $property) { throw 'JSON Schema reference cannot be resolved.' }
        $current = $property.Value
    }
    return $current
}

function Test-UIJsonType {
    param($Instance, [string]$Type)
    switch ($Type) {
        'null' { return $null -eq $Instance }
        'object' { return $null -ne $Instance -and $Instance -is [pscustomobject] }
        'array' { return $null -ne $Instance -and $Instance -is [Array] }
        'string' { return $Instance -is [string] }
        'boolean' { return $Instance -is [bool] }
        'integer' { return $Instance -is [sbyte] -or $Instance -is [byte] -or $Instance -is [int16] -or $Instance -is [uint16] -or $Instance -is [int32] -or $Instance -is [uint32] -or $Instance -is [int64] -or $Instance -is [uint64] }
        'number' { return (Test-UIJsonType $Instance 'integer') -or $Instance -is [single] -or $Instance -is [double] -or $Instance -is [decimal] }
        default { throw 'JSON Schema uses an unsupported type.' }
    }
}

function Test-UIJsonSchemaNode {
    param($Instance, $Schema, $RootSchema, [string]$Path, [Collections.Generic.List[string]]$Errors)
    if ($Schema -is [bool]) {
        if (-not $Schema) { $Errors.Add("$Path is rejected by a false schema.") }
        return
    }
    if ($null -eq $Schema) { $Errors.Add("$Path has an invalid null schema."); return }
    if ($null -ne $Schema.PSObject.Properties['$ref']) {
        $resolved = Resolve-UISchemaReference $RootSchema ([string]$Schema.'$ref')
        Test-UIJsonSchemaNode $Instance $resolved $RootSchema $Path $Errors
        return
    }
    if ($null -ne $Schema.PSObject.Properties['type']) {
        $types = @($Schema.type)
        $matchedType = $false
        foreach ($type in $types) { if (Test-UIJsonType $Instance ([string]$type)) { $matchedType = $true; break } }
        if (-not $matchedType) { $Errors.Add("$Path has the wrong JSON type."); return }
    }
    if ($null -ne $Schema.PSObject.Properties['const']) {
        if ((Get-UICanonicalJson $Instance) -cne (Get-UICanonicalJson $Schema.const)) { $Errors.Add("$Path does not match const.") }
    }
    if ($null -ne $Schema.PSObject.Properties['enum']) {
        $match = $false
        foreach ($candidate in @($Schema.enum)) { if ((Get-UICanonicalJson $Instance) -ceq (Get-UICanonicalJson $candidate)) { $match = $true; break } }
        if (-not $match) { $Errors.Add("$Path is outside enum.") }
    }
    if ($Instance -is [string]) {
        if ($null -ne $Schema.PSObject.Properties['minLength'] -and $Instance.Length -lt [int]$Schema.minLength) { $Errors.Add("$Path is shorter than minLength.") }
        if ($null -ne $Schema.PSObject.Properties['maxLength'] -and $Instance.Length -gt [int]$Schema.maxLength) { $Errors.Add("$Path is longer than maxLength.") }
        if ($null -ne $Schema.PSObject.Properties['pattern'] -and $Instance -notmatch [string]$Schema.pattern) { $Errors.Add("$Path does not match pattern.") }
    }
    if (Test-UIJsonType $Instance 'number') {
        if ($null -ne $Schema.PSObject.Properties['minimum'] -and [decimal]$Instance -lt [decimal]$Schema.minimum) { $Errors.Add("$Path is below minimum.") }
        if ($null -ne $Schema.PSObject.Properties['maximum'] -and [decimal]$Instance -gt [decimal]$Schema.maximum) { $Errors.Add("$Path is above maximum.") }
    }
    if ($Instance -is [Array]) {
        $items = @($Instance)
        if ($null -ne $Schema.PSObject.Properties['minItems'] -and $items.Count -lt [int]$Schema.minItems) { $Errors.Add("$Path has fewer than minItems.") }
        if ($null -ne $Schema.PSObject.Properties['maxItems'] -and $items.Count -gt [int]$Schema.maxItems) { $Errors.Add("$Path has more than maxItems.") }
        if ($Schema.uniqueItems -eq $true) {
            $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
            foreach ($item in $items) { if (-not $seen.Add((Get-UICanonicalJson $item))) { $Errors.Add("$Path violates uniqueItems."); break } }
        }
        if ($null -ne $Schema.PSObject.Properties['items']) {
            for ($index = 0; $index -lt $items.Count; $index++) { Test-UIJsonSchemaNode $items[$index] $Schema.items $RootSchema "$Path[$index]" $Errors }
        }
    }
    if ($Instance -is [pscustomobject]) {
        $properties = @($Instance.PSObject.Properties)
        if ($null -ne $Schema.PSObject.Properties['minProperties'] -and $properties.Count -lt [int]$Schema.minProperties) { $Errors.Add("$Path has fewer than minProperties.") }
        if ($null -ne $Schema.PSObject.Properties['maxProperties'] -and $properties.Count -gt [int]$Schema.maxProperties) { $Errors.Add("$Path has more than maxProperties.") }
        foreach ($required in @($Schema.required)) { if ($null -eq $Instance.PSObject.Properties[[string]$required]) { $Errors.Add("$Path is missing a required property.") } }
        $defined = @{}
        if ($null -ne $Schema.PSObject.Properties['properties']) {
            foreach ($schemaProperty in @($Schema.properties.PSObject.Properties)) {
                $defined[$schemaProperty.Name] = $true
                $instanceProperty = $Instance.PSObject.Properties[$schemaProperty.Name]
                if ($null -ne $instanceProperty) { Test-UIJsonSchemaNode $instanceProperty.Value $schemaProperty.Value $RootSchema "$Path.$($schemaProperty.Name)" $Errors }
            }
        }
        if ($Schema.additionalProperties -eq $false) {
            foreach ($property in $properties) { if (-not $defined.ContainsKey($property.Name)) { $Errors.Add("$Path contains an unknown property.") } }
        }
    }
    if ($null -ne $Schema.PSObject.Properties['allOf']) {
        foreach ($subschema in @($Schema.allOf)) { Test-UIJsonSchemaNode $Instance $subschema $RootSchema $Path $Errors }
    }
    if ($null -ne $Schema.PSObject.Properties['anyOf']) {
        $matched = $false
        foreach ($subschema in @($Schema.anyOf)) {
            $branch = [Collections.Generic.List[string]]::new()
            Test-UIJsonSchemaNode $Instance $subschema $RootSchema $Path $branch
            if ($branch.Count -eq 0) { $matched = $true; break }
        }
        if (-not $matched) { $Errors.Add("$Path does not match anyOf.") }
    }
    if ($null -ne $Schema.PSObject.Properties['oneOf']) {
        $matches = 0
        foreach ($subschema in @($Schema.oneOf)) {
            $branch = [Collections.Generic.List[string]]::new()
            Test-UIJsonSchemaNode $Instance $subschema $RootSchema $Path $branch
            if ($branch.Count -eq 0) { $matches++ }
        }
        if ($matches -ne 1) { $Errors.Add("$Path does not match exactly one oneOf branch.") }
    }
    if ($null -ne $Schema.PSObject.Properties['not']) {
        $branch = [Collections.Generic.List[string]]::new()
        Test-UIJsonSchemaNode $Instance $Schema.not $RootSchema $Path $branch
        if ($branch.Count -eq 0) { $Errors.Add("$Path matches a forbidden schema.") }
    }
}

function Assert-UIJsonSchema {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] $Instance,
        [Parameter(Mandatory = $true)] [string]$SchemaPath
    )

    $schema = Read-UIStrictJson -Path $SchemaPath -MaxBytes 1048576 -MaxDepth 64 -MaxStringLength 8192 -MaxArrayLength 20000 -MaxObjectProperties 512
    if ($schema.'$schema' -ne 'https://json-schema.org/draft/2020-12/schema') { throw 'JSON Schema is not draft 2020-12.' }
    $errors = [Collections.Generic.List[string]]::new()
    Test-UIJsonSchemaNode $Instance $schema $schema '$' $errors
    if ($errors.Count -gt 0) { throw "Draft 2020-12 JSON Schema validation failed with $($errors.Count) finding(s)." }
}

function Read-UIValidatedJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] [string]$SchemaPath,
        [int]$MaxBytes = 4194304,
        [int]$MaxDepth = 32,
        [int]$MaxStringLength = 4096,
        [int]$MaxArrayLength = 10000,
        [int]$MaxObjectProperties = 256
    )
    $data = Read-UIStrictJson -Path $Path -MaxBytes $MaxBytes -MaxDepth $MaxDepth -MaxStringLength $MaxStringLength -MaxArrayLength $MaxArrayLength -MaxObjectProperties $MaxObjectProperties
    Assert-UIJsonSchema -Instance $data -SchemaPath $SchemaPath
    return $data
}

function Get-UIFileSha256 {
    param([Parameter(Mandatory = $true)] [string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-UIGitCommit {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [string]$RepositoryRoot,
        [Parameter(Mandatory = $true)] [string]$Commit,
        [switch]$RequireAncestorOfHead
    )
    if ($Commit -notmatch '^[0-9a-f]{40}$') { throw 'Commit identity is not a full lowercase Git object id.' }
    & git -C $RepositoryRoot cat-file -e "$Commit`^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Commit identity does not resolve to a commit in this repository.' }
    if ($RequireAncestorOfHead) {
        & git -C $RepositoryRoot merge-base --is-ancestor $Commit HEAD 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Intended source commit is not an ancestor of the current repository HEAD.' }
    }
}

function Test-UIExactSequence {
    param([object[]]$Actual, [object[]]$Expected)
    if ($Actual.Count -ne $Expected.Count) { return $false }
    for ($index = 0; $index -lt $Actual.Count; $index++) { if ([string]$Actual[$index] -cne [string]$Expected[$index]) { return $false } }
    return $true
}

function Invoke-UISharingRetry {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [scriptblock]$Operation,
        [int]$Attempts = 10,
        [int]$DelayMs = 40,
        [ref]$RetryCount
    )
    if ($null -ne $RetryCount) { $RetryCount.Value = 0 }
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try { return (& $Operation) } catch [IO.IOException] {
            $win32 = $_.Exception.HResult -band 0xffff
            if ($win32 -notin @(5, 32, 33) -or $attempt -eq $Attempts) { throw }
            if ($null -ne $RetryCount) { $RetryCount.Value++ }
            Start-Sleep -Milliseconds ($DelayMs * $attempt)
        }
    }
}
