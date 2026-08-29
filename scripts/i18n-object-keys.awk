# Extract top-level quoted object/interface keys from TypeScript source.
#
# This is deliberately a small lexical scanner rather than a line-oriented
# grep. Locale dictionaries contain compact one-line properties and multiline
# values, and values can contain braces, quotes, and comment-looking text.
# Only properties in the exported Dict interface or exported locale object are
# emitted. Records are tab-separated: K (key), S (top-level spread), and D
# (duplicate key).

BEGIN {
  depth = 0
  started = 0
  done = 0
  quote = ""
  escaped = 0
  block_comment = 0
  kind = (kind == "" ? "locale" : kind)
}

function is_key_char(c) {
  return c ~ /^[a-zA-Z0-9._-]$/
}

function starts_target(line) {
  if (kind == "dict")
    return line ~ /^[[:space:]]*export[[:space:]]+interface[[:space:]]+Dict[[:space:]]*\{/
  return line ~ /^[[:space:]]*export[[:space:]]+const[[:space:]]+[a-zA-Z0-9_]+[[:space:]]*:[[:space:]]*Dict[[:space:]]*=[[:space:]]*\{/
}

{
  line = $0
  line_comment = 0
  start_index = 0

  if (!started && !done && starts_target(line)) {
    # Declarations are intentionally anchored, so a commented or detached
    # object cannot become the source of truth.
    start_index = index(line, "{")
  }

  for (i = 1; i <= length(line); i++) {
    c = substr(line, i, 1)

    if (line_comment)
      break

    if (block_comment) {
      if (c == "*" && substr(line, i + 1, 1) == "/") {
        block_comment = 0
        i++
      }
      continue
    }

    if (quote != "") {
      if (escaped) {
        escaped = 0
        continue
      }
      if (c == "\\") {
        escaped = 1
        continue
      }
      if (c == quote)
        quote = ""
      continue
    }

    if (c == "/" && substr(line, i + 1, 1) == "/") {
      line_comment = 1
      continue
    }
    if (c == "/" && substr(line, i + 1, 1) == "*") {
      block_comment = 1
      i++
      continue
    }

    if (!started) {
      if (start_index > 0 && i >= start_index) {
        started = 1
        # Let the opening brace below establish depth 1. This also permits
        # compact properties that begin on the declaration line.
        depth = 0
      } else {
        continue
      }
    }
    if (done)
      continue

    if (c == "{") {
      depth++
      continue
    }
    if (c == "}") {
      depth--
      if (depth == 0) {
        done = 1
        started = 0
      }
      continue
    }

    if (depth != 1)
      continue

    if (substr(line, i, 3) == "...") {
      j = i + 3
      spread = ""
      while (j <= length(line) && is_key_char(substr(line, j, 1))) {
        spread = spread substr(line, j, 1)
        j++
      }
      if (spread != "") {
        print "S\t" spread
        i = j - 1
      }
      continue
    }

    if (c != "'" && c != "\"")
      continue

    # Parse this quoted token. If it is followed by a colon, it is a
    # dictionary property; otherwise it is a value string.
    key_quote = c
    j = i + 1
    key = ""
    key_escaped = 0
    while (j <= length(line)) {
      d = substr(line, j, 1)
      if (key_escaped) {
        key = key d
        key_escaped = 0
        j++
        continue
      }
      if (d == "\\") {
        key_escaped = 1
        key = key d
        j++
        continue
      }
      if (d == key_quote)
        break
      key = key d
      j++
    }
    if (j <= length(line) && key ~ /^[a-z][a-zA-Z0-9._-]*$/) {
      after = substr(line, j + 1)
      if (after ~ /^[[:space:]]*:/) {
        print "K\t" key
        if (seen[key]++)
          print "D\t" key
        i = j
        continue
      }
    }
    quote = key_quote
  }
}
