#!/usr/bin/env python3
"""Validate the explicit feature and commit lineage inventory."""
from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

FEATURE_IDS = ["language-modes","dialog-emoji-toggle","school-mode","narration","scheduled-settings","dim-sum-surprise","regex-builders","notification-centre","appearance-editors","tabbed-navigation","offline-documentation","command-palette","destructive-confirmation","local-history","changelog-viewer","external-editor","exports","bulk-actions","accessibility-responsive-sizing","personal-vocabulary-upload","toy-locks-authentication","unlock-ladder","shared-link-embed","adhd-modes","browser-download-surfaces","app-logo-customization","file-converter","ollama-suite-manager","status-hub","front-screen-provenance"]
PRESERVATION_BRANCHES = ["preservation/advanced-regex-snapshot-20260828","preservation/appearance-deep-20260828","preservation/appearance-export-schema-20260828","preservation/appearance-schema-20260828","preservation/appearance-source-20260828","preservation/authenticator-lockout-20260828","preservation/browser-downloads-confirmations-20260828","preservation/build-updater-20260828","preservation/documentation-evidence-20260828","preservation/documentation-site-parity-20260828","preservation/emergency-index-20260828","preservation/file-converter-snapshot-20260828","preservation/front-provenance-20260828","preservation/logo-customization-20260828","preservation/ollama-suite-20260828","preservation/personal-vocabulary-snapshot-20260828","preservation/release-integrity-20260828","preservation/shared-ui-primitives-20260828","preservation/tabs-history-20260828","preservation/toy-lock-integration-20260828","preservation/toy-lock-source-snapshot-20260828","preservation/universal-settings-snapshot-20260828"]
SURFACES = {"windows-desktop-application", "documentation-site"}
STATUSES = {"implemented", "partial", "absent", "unreachable"}
SHA = re.compile(r"^[0-9a-f]{40}$")
FEATURE_FIELDS = {"id","lineageCommits","behavior","paths","apisOrStorage","desktopImplementation","siteImplementation","materialDesign3","localization","persistence","tests","negativeProof","interactions","captures","state"}
SURFACE_FIELDS = {"surfaceId","featureId","lineageCommits","behavior","paths","apisOrStorage","desktopOrSiteImplementation","materialDesign3","localization","persistence","tests","negativeProof","interactions","captures","state"}
FEATURE_LINEAGE_FIELDS = {"sha", "source"}
LINEAGE_SOURCES = {
    "root-main": "origin/main",
    "preservation-feature-history": "origin/preservation/appearance-source-20260828",
    "tabs-history": "origin/preservation/tabs-history-20260828",
    "authenticator-history": "origin/preservation/authenticator-lockout-20260828",
    "documentation-history": "origin/preservation/documentation-evidence-20260828",
    "logo-history": "origin/preservation/logo-customization-20260828",
    "ollama-history": "origin/preservation/ollama-suite-20260828",
    "front-history": "origin/preservation/front-provenance-20260828",
}
EXPECTED_FEATURE_LINEAGE = {
    "language-modes": [("17b00d19f81216cee8df0f8564830021f5721749", "preservation-feature-history"), ("5ab199b15f1e407f4b9045ca1095894e69346282", "preservation-feature-history")],
    "narration": [("92ed8c6c43f9194ff6907c8ec9d1085868c10c80", "preservation-feature-history")],
    "dim-sum-surprise": [("a454a7bef99fd4082f00d03c3ce5be0f965dcdad", "preservation-feature-history")],
    "regex-builders": [("8e052bec3e83b19e3bfa648913b2cd814eb42666", "preservation-feature-history"), ("df66c2400e12d29b0d092e89a74dfc87fa10266e", "preservation-feature-history")],
    "notification-centre": [("5b63b57230b97742ef2c4b78fcf44be9f7010fac", "preservation-feature-history")],
    "appearance-editors": [("2468f4666ccce79b912da7991ad914a023ed8d13", "preservation-feature-history"), ("a5b058986fe6ec4b8662573fd5d8cf4ffe73f899", "preservation-feature-history"), ("fd9649d926bc99f61287111bcebed7f17b7b55d7", "preservation-feature-history")],
    "tabbed-navigation": [("cfe1d7b2112e7957cecf0528aeeb2867fa5227c4", "tabs-history")],
    "offline-documentation": [("656c1bd7d024f1936ff050a97c7ccb2b1f377193", "documentation-history")],
    "command-palette": [("8e052bec3e83b19e3bfa648913b2cd814eb42666", "preservation-feature-history"), ("df66c2400e12d29b0d092e89a74dfc87fa10266e", "preservation-feature-history")],
    "destructive-confirmation": [("9cb4e6c7997ddfcbfc643a7feb4185c5d1f9b629", "preservation-feature-history"), ("ecaad9747111a8ef58545dbcd0c21fca5f333636", "preservation-feature-history")],
    "local-history": [("b21fe83904d907e893e3409b666daa659fb27057", "tabs-history"), ("3e87be7cab496313030e7eb0d7a3c1c1fca7b627", "authenticator-history")],
    "changelog-viewer": [("bc8782b4cae2609f41e708f9ca1f0e877e02af88", "preservation-feature-history")],
    "external-editor": [("2b1365e2419fddddac6243398c96ed76b4bc886e", "preservation-feature-history")],
    "exports": [("5837dc318488fda5501b0a387411c785e4eeb48c", "preservation-feature-history")],
    "bulk-actions": [("6e90fbd215063cf42cd53aea38c28527a0febf76", "preservation-feature-history")],
    "accessibility-responsive-sizing": [("f56d3e81551ae98c9dfda8d9c26b63e96c7dc151", "preservation-feature-history"), ("52bc5c56f76579ba3bb4f4a9b82ffe7177febd1c", "preservation-feature-history")],
    "toy-locks-authentication": [("fa3c66fa8564947659829cda4a71fc8a77c0fdc0", "preservation-feature-history"), ("8d0cc2724a42a32b638cc33e2e41c151c6566788", "preservation-feature-history")],
    "unlock-ladder": [("161cbab524ac956fbcb75a0b07a2aa669b2dea57", "authenticator-history"), ("0c71f1550cb503151d80405237b42e706f6f3d6b", "authenticator-history")],
    "app-logo-customization": [("aaef710c36e34333507a079f1885863878b440cf", "logo-history"), ("9a269b5482c12ec09871e1259823ca4f2e96e74b", "logo-history"), ("39bdf7b3a8fd8b3adcee2a6e3d2063bf74e03af9", "logo-history")],
    "ollama-suite-manager": [("41ef150026a0303057171bd7776d9ec69fff89a7", "ollama-history"), ("d0c39b2f52bd8f382f675087a84c53f48a515913", "ollama-history")],
    "front-screen-provenance": [("a8a2e1da617c8d49492d4f56cfdd2b53cfb173d3", "front-history"), ("799e184b1ced32b0b6bf7cd8cc94394fb6f060fd", "front-history")],
}
IMPLEMENTATION_FIELDS = {"status", "paths"}
TOP_FIELDS = {"schemaVersion","inventoryId","target","canonicalFeatureIds","lineageSources","lineageCommits","mainCustomFeatures","linkedWorktreeCommits","preservationBranches","surfaces","counts"}
TARGET_FIELDS = {"sourceRepository","sourceUrl","pinnedImport","targetCommit","expectedCommitCount","membershipOrder"}
LINEAGE_FIELDS = {"order","sha","subject"}
LINKED_FIELDS = {"branch","sha","subject","subjectMode"}
PRESERVATION_FIELDS = {"branch","sha","subject"}
COUNT_FIELDS = {"upstreamCommits","mainCustomFeatures","linkedWorktreeCommits","preservationBranches","surfaces","surfacesPerFeature"}

class ValidationError(Exception):
    pass

def require(condition: bool, message: str) -> None:
    if not condition: raise ValidationError(message)

def nonempty_text(value: object, label: str) -> None:
    require(isinstance(value, str) and bool(value.strip()), f"{label} must be non-empty text")

def string_list(value: object, label: str, *, nonempty: bool = False) -> None:
    require(isinstance(value, list), f"{label} must be an array")
    require(not nonempty or bool(value), f"{label} must not be empty")
    require(all(isinstance(item, str) for item in value), f"{label} must contain only strings")

def sha_list(value: object, label: str) -> None:
    require(isinstance(value, list), f"{label} must be an array")
    require(all(isinstance(item, str) and SHA.fullmatch(item) for item in value), f"{label} has a malformed SHA")
    require(len(value) == len(set(value)), f"{label} contains duplicate SHAs")

def feature_lineage_list(value: object, label: str, feature_id: str, repo_root: Path) -> None:
    require(isinstance(value, list), f"{label} must be an array")
    seen = set()
    expected = EXPECTED_FEATURE_LINEAGE.get(feature_id, [])
    for index, item in enumerate(value):
        require(isinstance(item, dict) and set(item) == FEATURE_LINEAGE_FIELDS, f"{label}[{index}] must declare exactly sha and source")
        require(isinstance(item["sha"], str) and SHA.fullmatch(item["sha"]), f"{label}[{index}].sha is malformed")
        require(item["sha"] not in seen, f"{label} contains duplicate SHAs"); seen.add(item["sha"])
        require(item["source"] in LINEAGE_SOURCES, f"{label}[{index}].source is unknown")
        try: git_ref(repo_root, f"{item['sha']}^{{commit}}", f"{label}[{index}].sha")
        except ValidationError: raise ValidationError(f"{label}[{index}].sha is not a commit object")
    require([(item["sha"], item["source"]) for item in value] == expected, f"{label} pair mapping drifted")
    for index, item in enumerate(value):
        source_ref = LINEAGE_SOURCES[item["source"]]
        require(subprocess.run(["git", "-C", str(repo_root), "merge-base", "--is-ancestor", item["sha"], source_ref], capture_output=True).returncode == 0, f"{label}[{index}].sha is not an ancestor of {item['source']}")

def path_list(value: object, label: str, repo_root: Path) -> None:
    string_list(value, label)
    root = repo_root.resolve()
    for raw in value:
        require("\\" not in raw, f"{label} contains a non-canonical path: {raw}")
        relative = PurePosixPath(raw)
        require(not relative.is_absolute() and ".." not in relative.parts, f"{label} escapes the source boundary: {raw}")
        lexical = root / Path(*relative.parts)
        for parent in [root, *lexical.parents]:
            if parent == root.parent: break
            if parent.is_symlink() or getattr(parent, "is_junction", lambda: False)():
                raise ValidationError(f"{label} references a symlink or reparse point: {raw}")
        if lexical.is_symlink() or getattr(lexical, "is_junction", lambda: False)():
            raise ValidationError(f"{label} references a symlink or reparse point: {raw}")
        if os.name == "nt":
            for parent in [root, *lexical.parents]:
                if parent == root.parent: break
                try: attributes = os.stat(parent, follow_symlinks=False).st_file_attributes
                except (FileNotFoundError, OSError): continue
                if attributes & 0x400:
                    raise ValidationError(f"{label} references a symlink or reparse point: {raw}")
        candidate = lexical.resolve(strict=False)
        try: candidate.relative_to(root)
        except ValueError: raise ValidationError(f"{label} escapes the source boundary: {raw}")
        require(candidate.is_file(), f"{label} references a missing or non-file path: {raw}")

def implementation(value: object, label: str, repo_root: Path) -> None:
    require(isinstance(value, dict), f"{label} must be an object")
    require(set(value) == IMPLEMENTATION_FIELDS, f"{label} fields drifted or object is empty")
    require(value["status"] in STATUSES, f"{label}.status is not supported")
    path_list(value["paths"], f"{label}.paths", repo_root)

def schema_node(value: object, label: str) -> None:
    require(isinstance(value, dict), f"schema {label} must be an object")
    require(set(value).issubset({"$schema","$defs","$ref","title","type","const","enum","pattern","minLength","minimum","maximum","minItems","maxItems","items","required","properties","additionalProperties"}), f"schema {label} has an unknown keyword")
    if "$ref" in value:
        require(set(value) == {"$ref"} and isinstance(value["$ref"], str), f"schema {label} has an invalid reference")
        return
    if "type" in value: require(value["type"] in {"object","array","string","integer"}, f"schema {label} has an invalid type")
    if "const" in value and "type" in value:
        expected_types = {"string": str, "array": list, "integer": int}
        expected_type = expected_types.get(value["type"])
        require(expected_type is None or (isinstance(value["const"], expected_type) and not (value["type"] == "integer" and isinstance(value["const"], bool))), f"schema {label}.const has wrong type")
    if "enum" in value: require(isinstance(value["enum"], list) and bool(value["enum"]), f"schema {label}.enum must be a non-empty array"); require(len(value["enum"]) == len({json.dumps(item, sort_keys=True) for item in value["enum"]}), f"schema {label}.enum contains duplicates")
    if "enum" in value and "type" in value:
        expected_types = {"string": str, "array": list, "integer": int, "object": dict}
        expected_type = expected_types.get(value["type"])
        if expected_type is not None: require(all(isinstance(item, expected_type) and not (value["type"] == "integer" and isinstance(item, bool)) for item in value["enum"]), f"schema {label}.enum has wrong value type")
    if "pattern" in value:
        require(isinstance(value["pattern"], str), f"schema {label}.pattern must be text")
        try: re.compile(value["pattern"])
        except re.error: raise ValidationError(f"schema {label}.pattern is invalid regex")
    for keyword in ["minimum", "maximum", "minItems", "maxItems", "minLength"]:
        if keyword in value:
            require(isinstance(value[keyword], int) and not isinstance(value[keyword], bool) and value[keyword] >= 0, f"schema {label}.{keyword} must be a non-negative integer")
    if "minimum" in value and "maximum" in value: require(value["minimum"] <= value["maximum"], f"schema {label}.minimum exceeds maximum")
    if "required" in value:
        require(isinstance(value["required"], list) and all(isinstance(item, str) for item in value["required"]), f"schema {label}.required must be an array of strings")
        require(len(value["required"]) == len(set(value["required"])), f"schema {label}.required contains duplicates")
    if "additionalProperties" in value: require(isinstance(value["additionalProperties"], bool), f"schema {label}.additionalProperties must be boolean")
    if "type" in value and value["type"] == "object":
        require(value.get("additionalProperties") is False, f"schema {label} must close additionalProperties")
        require(isinstance(value.get("properties"), dict), f"schema {label}.properties is required")
        require(isinstance(value.get("required"), list), f"schema {label}.required is required")
        require(set(value["required"]).issubset(set(value["properties"])), f"schema {label}.required names an unknown property")
        for key, child in value["properties"].items(): schema_node(child, f"{label}.properties.{key}")
    if "type" in value and value["type"] == "array":
        require(isinstance(value.get("items"), dict), f"schema {label}.items is required")
        schema_node(value["items"], f"{label}.items")

def load_schema(schema_path: Path) -> dict:
    try: schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError: raise ValidationError("schema syntax invalid")
    except OSError as error: raise ValidationError(f"cannot read schema {schema_path}: {error}")
    require(isinstance(schema, dict), "schema root must be an object")
    schema_node(schema, "root")
    require(schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema", "schema draft marker drifted")
    require(schema.get("additionalProperties") is False and set(schema.get("required", [])) == TOP_FIELDS, "schema root boundary drifted")
    require(set(schema.get("properties", {})) == TOP_FIELDS, "schema top-level properties drifted")
    defs = schema.get("$defs")
    require(isinstance(defs, dict) and set(defs) == {"sha","text","target","lineageCommit","featureLineageCommit","linkedCommit","preservation","implementation","feature","surface"}, "schema definitions drifted")
    for name, definition in defs.items(): schema_node(definition, f"$defs.{name}")
    def check_refs(node: object, label: str) -> None:
        if isinstance(node, dict):
            if "$ref" in node: require(node["$ref"].startswith("#/$defs/") and node["$ref"].removeprefix("#/$defs/") in defs, f"schema {label} references a missing definition")
            for key, child in node.items(): check_refs(child, f"{label}.{key}")
        elif isinstance(node, list):
            for index, child in enumerate(node): check_refs(child, f"{label}[{index}]")
    check_refs(schema, "root")
    require(set(defs["target"].get("required", [])) == TARGET_FIELDS, "schema target fields drifted")
    require(set(defs["lineageCommit"].get("required", [])) == LINEAGE_FIELDS, "schema lineage fields drifted")
    require(set(defs["linkedCommit"].get("required", [])) == LINKED_FIELDS, "schema linked fields drifted")
    require(set(defs["preservation"].get("required", [])) == PRESERVATION_FIELDS, "schema preservation fields drifted")
    require(set(defs["feature"].get("required", [])) == FEATURE_FIELDS, "schema feature fields drifted")
    require(set(defs["surface"].get("required", [])) == SURFACE_FIELDS, "schema surface fields drifted")
    require(set(schema["properties"]["counts"].get("required", [])) == COUNT_FIELDS, "schema count fields drifted")
    require(schema["properties"]["canonicalFeatureIds"].get("const") == FEATURE_IDS, "schema canonical feature IDs diverge from handwritten checks")
    require(schema["$defs"]["featureLineageCommit"]["properties"]["source"].get("enum") == sorted(LINEAGE_SOURCES), "schema lineage source diverges from handwritten checks")
    require(schema["properties"]["counts"]["properties"] == {"upstreamCommits":{"const":98},"mainCustomFeatures":{"const":30},"linkedWorktreeCommits":{"const":13},"preservationBranches":{"const":22},"surfaces":{"const":60},"surfacesPerFeature":{"const":2}}, "schema count constants diverge from handwritten checks")
    return schema

def schema_ref(root_schema: dict, ref: str) -> dict:
    require(ref.startswith("#/$defs/"), f"unsupported schema reference {ref}")
    name = ref.removeprefix("#/$defs/")
    require(name in root_schema["$defs"], f"schema reference {ref} is missing")
    return root_schema["$defs"][name]

def apply_schema(value: object, spec: dict, root_schema: dict, label: str) -> None:
    if "$ref" in spec: apply_schema(value, schema_ref(root_schema, spec["$ref"]), root_schema, label); return
    if "const" in spec: require(value == spec["const"], f"{label} disagrees with schema const")
    if "enum" in spec: require(value in spec["enum"], f"{label} is outside schema enum")
    if "pattern" in spec:
        require(isinstance(value, str), f"{label} must be text for schema pattern")
        require(re.fullmatch(spec["pattern"], value) is not None, f"{label} does not match schema pattern")
    if "minLength" in spec: require(isinstance(value, str) and len(value) >= spec["minLength"], f"{label} is shorter than schema minimum")
    if "minimum" in spec: require(isinstance(value, int) and not isinstance(value, bool) and value >= spec["minimum"], f"{label} is below schema minimum")
    if "maximum" in spec: require(isinstance(value, int) and not isinstance(value, bool) and value <= spec["maximum"], f"{label} is above schema maximum")
    if "minItems" in spec: require(isinstance(value, list) and len(value) >= spec["minItems"], f"{label} has too few items")
    if "maxItems" in spec: require(isinstance(value, list) and len(value) <= spec["maxItems"], f"{label} has too many items")
    if spec.get("type") == "object":
        require(isinstance(value, dict), f"{label} must be an object")
        for key in spec.get("required", []): require(key in value, f"{label} is missing required field {key}")
        properties = spec.get("properties", {})
        if spec.get("additionalProperties") is False: require(set(value).issubset(set(properties)), f"{label} has an unexpected nested property")
        for key, child in value.items():
            if key in properties: apply_schema(child, properties[key], root_schema, f"{label}.{key}")
    elif spec.get("type") == "array":
        require(isinstance(value, list), f"{label} must be an array")
        for index, item in enumerate(value): apply_schema(item, spec["items"], root_schema, f"{label}[{index}]")
    elif spec.get("type") == "string":
        require(isinstance(value, str), f"{label} must be text")
    elif spec.get("type") == "integer":
        require(isinstance(value, int) and not isinstance(value, bool), f"{label} must be an integer")


def feature(row: object, label: str, repo_root: Path) -> None:
    require(isinstance(row, dict), f"{label} must be an object")
    require(set(row) == FEATURE_FIELDS, f"{label} fields drifted")
    require(row["id"] in FEATURE_IDS, f"{label} has an unknown feature ID")
    feature_lineage_list(row["lineageCommits"], f"{label}.lineageCommits", row["id"], repo_root); nonempty_text(row["behavior"], f"{label}.behavior")
    path_list(row["paths"], f"{label}.paths", repo_root); string_list(row["apisOrStorage"], f"{label}.apisOrStorage", nonempty=True)
    implementation(row["desktopImplementation"], f"{label}.desktopImplementation", repo_root); implementation(row["siteImplementation"], f"{label}.siteImplementation", repo_root)
    for key in ["materialDesign3","localization","persistence","tests","negativeProof"]: nonempty_text(row[key], f"{label}.{key}")
    string_list(row["interactions"], f"{label}.interactions", nonempty=True); path_list(row["captures"], f"{label}.captures", repo_root); require(row["state"] in STATUSES, f"{label}.state is not supported")

def surface(row: object, label: str, repo_root: Path) -> None:
    require(isinstance(row, dict), f"{label} must be an object"); require(set(row) == SURFACE_FIELDS, f"{label} fields drifted")
    require(row["surfaceId"] in SURFACES, f"{label}.surfaceId is unknown"); require(row["featureId"] in FEATURE_IDS, f"{label}.featureId is unknown")
    feature_lineage_list(row["lineageCommits"], f"{label}.lineageCommits", row["featureId"], repo_root); nonempty_text(row["behavior"], f"{label}.behavior"); path_list(row["paths"], f"{label}.paths", repo_root)
    string_list(row["apisOrStorage"], f"{label}.apisOrStorage", nonempty=True); implementation(row["desktopOrSiteImplementation"], f"{label}.desktopOrSiteImplementation", repo_root)
    for key in ["materialDesign3","localization","persistence","tests","negativeProof"]: nonempty_text(row[key], f"{label}.{key}")
    string_list(row["interactions"], f"{label}.interactions", nonempty=True); path_list(row["captures"], f"{label}.captures", repo_root); require(row["state"] in STATUSES, f"{label}.state is not supported")

def git_bytes(repo: Path, *args: str) -> bytes:
    try: result = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as error: raise ValidationError(f"git {' '.join(args)} failed in {repo}: {error}")
    return result.stdout

def git_ref(repo: Path, ref: str, label: str) -> str:
    output = git_bytes(repo, "rev-parse", "--verify", ref).decode("ascii", errors="strict").strip()
    require(bool(SHA.fullmatch(output)), f"{label} resolved to a malformed object"); return output

def first_subject(repo: Path, sha: str, mode: str = "git-first-line") -> str:
    raw = git_bytes(repo, "show", "-s", "--format=%s", sha).decode("utf-8", errors="strict").rstrip("\r\n")
    if mode == "literal-escape-first-line-public": return raw.split(r"\n", 1)[0]
    require(mode == "git-first-line", f"unsupported subject mode: {mode}"); return raw.splitlines()[0] if raw.splitlines() else raw

def target_history(repo: Path, target: str) -> list[str]:
    try: rows = git_bytes(repo, "rev-list", "-n", "98", target).decode("ascii", errors="strict").splitlines()
    except ValidationError: raise ValidationError("upstream target source unavailable")
    require(len(rows) == 98, f"upstream target returned {len(rows)} commits, expected 98"); require(all(SHA.fullmatch(row) for row in rows), "upstream target returned a malformed SHA"); return rows

def validate(path: Path, schema_path: Path, repo_root: Path, upstream_repo: Path) -> None:
    try: root = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error: raise ValidationError(f"cannot read inventory: {error}")
    require(isinstance(root, dict), "inventory root must be an object")
    schema = load_schema(schema_path)
    for source_name, source in (root.get("lineageSources") or {}).items():
        if isinstance(source, dict) and isinstance(source.get("ref"), str) and source["ref"].startswith("refs/tags/"):
            raise ValidationError(f"inventory.lineageSources.{source_name}.ref must be a direct source ref")
    apply_schema(root, schema, schema, "inventory")
    top = TOP_FIELDS; require(set(root) == top, "inventory top-level fields drifted")
    require(root["schemaVersion"] == 1 and root["inventoryId"] == "feature-lineage-v1", "inventory identity drifted")
    target = root["target"]; require(target == {"sourceRepository":"nexu-io/open-design","sourceUrl":"https://github.com/nexu-io/open-design.git","pinnedImport":"05f5b33ef59f078df10ac1125986e00e4a796cf3","targetCommit":"a554d017c8fa12d8913354ba6cf792d26d0c3b54","expectedCommitCount":98,"membershipOrder":"git log -n 98 <target>"}, "target metadata drifted")
    require(root["canonicalFeatureIds"] == FEATURE_IDS, "canonical feature ID membership or order drifted")
    expected_sources = {"root-main":{"type":"git","repository":"this-project","ref":"main","boundary":"root repository commit ancestry"},"preservation-feature-history":{"type":"git","repository":"this-project","ref":"preservation/appearance-source-20260828","boundary":"preserved feature commit ancestry"},"tabs-history":{"type":"git","repository":"this-project","ref":"preservation/tabs-history-20260828","boundary":"preserved tab and history commit ancestry"},"authenticator-history":{"type":"git","repository":"this-project","ref":"preservation/authenticator-lockout-20260828","boundary":"preserved authenticator and lockout commit ancestry"},"documentation-history":{"type":"git","repository":"this-project","ref":"preservation/documentation-evidence-20260828","boundary":"preserved documentation commit ancestry"},"logo-history":{"type":"git","repository":"this-project","ref":"preservation/logo-customization-20260828","boundary":"preserved logo commit ancestry"},"ollama-history":{"type":"git","repository":"this-project","ref":"preservation/ollama-suite-20260828","boundary":"preserved model-suite commit ancestry"},"front-history":{"type":"git","repository":"this-project","ref":"preservation/front-provenance-20260828","boundary":"preserved provenance commit ancestry"}}
    require(root["lineageSources"] == expected_sources, "lineage source metadata drifted")
    for source_ref in LINEAGE_SOURCES.values():
        require(not source_ref.startswith("refs/tags/"), f"feature lineage source ref {source_ref} must be a direct source ref")
        git_ref(repo_root, f"{source_ref}^{{commit}}", f"feature lineage source ref {source_ref}")
    commits = root["lineageCommits"]; require(isinstance(commits, list) and len(commits) == 98, "lineageCommits must contain exactly 98 rows")
    for index, row in enumerate(commits, 1):
        require(isinstance(row, dict) and set(row) == {"order","sha","subject"}, f"lineageCommits[{index - 1}] fields drifted"); require(row["order"] == index and isinstance(row["sha"], str) and SHA.fullmatch(row["sha"]), f"lineageCommits[{index - 1}] order or SHA is malformed"); nonempty_text(row["subject"], f"lineageCommits[{index - 1}].subject")
    require(len({row["sha"] for row in commits}) == 98, "lineageCommits contains duplicate SHAs"); require(commits[0]["sha"] == target["targetCommit"], "lineage history must start at targetCommit")
    actual_shas = target_history(upstream_repo, target["targetCommit"]); require([row["sha"] for row in commits] == actual_shas, "lineage membership does not match upstream target history")
    for row in commits: require(first_subject(upstream_repo, row["sha"]) == row["subject"], f"upstream subject mismatch for {row['sha']}")
    features = root["mainCustomFeatures"]; require(isinstance(features, list) and len(features) == 30, "mainCustomFeatures must contain exactly 30 rows")
    for index, row in enumerate(features): feature(row, f"mainCustomFeatures[{index}]", repo_root)
    require([row["id"] for row in features] == FEATURE_IDS, "mainCustomFeatures membership or order drifted")
    linked = root["linkedWorktreeCommits"]; require(isinstance(linked, list) and len(linked) == 13, "linkedWorktreeCommits must contain exactly 13 rows")
    linked_branches = {"codex/download-menu-accessibility","codex/folder-browser-final-repair"}; require({row.get("branch") for row in linked if isinstance(row, dict)} == linked_branches, "linked worktree branch membership drifted")
    for index, row in enumerate(linked):
        require(isinstance(row, dict) and set(row) == {"branch","sha","subject","subjectMode"}, f"linkedWorktreeCommits[{index}] fields drifted"); require(row["branch"] in linked_branches and isinstance(row["sha"], str) and SHA.fullmatch(row["sha"]), f"linkedWorktreeCommits[{index}] is malformed"); nonempty_text(row["subject"], f"linkedWorktreeCommits[{index}].subject"); require(row["subjectMode"] in {"git-first-line","literal-escape-first-line-public"}, f"linkedWorktreeCommits[{index}].subjectMode is unsupported"); git_ref(repo_root, f"refs/heads/{row['branch']}^{{commit}}", f"linked ref {row['branch']}"); git_ref(repo_root, f"{row['sha']}^{{commit}}", f"linked commit {row['sha']}"); require(first_subject(repo_root, row["sha"], row["subjectMode"]) == row["subject"], f"linked subject mismatch for {row['sha']}")
    for branch in sorted(linked_branches):
        expected = [row["sha"] for row in linked if row["branch"] == branch]; actual = git_bytes(repo_root, "rev-list", f"main..{branch}").decode("ascii", errors="strict").splitlines(); require(actual == expected, f"linked membership mismatch for {branch}")
    preservation = root["preservationBranches"]; require(isinstance(preservation, list) and len(preservation) == 22, "preservationBranches must contain exactly 22 rows"); require([row.get("branch") for row in preservation if isinstance(row, dict)] == PRESERVATION_BRANCHES, "preservation branch membership or order drifted")
    seen = set()
    for index, row in enumerate(preservation):
        require(isinstance(row, dict) and set(row) == {"branch","sha","subject"}, f"preservationBranches[{index}] fields drifted"); require(isinstance(row["sha"], str) and SHA.fullmatch(row["sha"]), f"preservationBranches[{index}] SHA is malformed"); nonempty_text(row["subject"], f"preservationBranches[{index}].subject"); require(row["sha"] not in seen, "preservationBranches contains duplicate SHAs"); seen.add(row["sha"]); resolved = git_ref(repo_root, f"refs/remotes/origin/{row['branch']}^{{commit}}", f"preservation ref {row['branch']}"); require(resolved == row["sha"], f"preservation ref moved for {row['branch']}"); require(first_subject(repo_root, row["sha"]) == row["subject"], f"preservation subject mismatch for {row['branch']}")
    surfaces = root["surfaces"]; require(isinstance(surfaces, list) and len(surfaces) == 60, "surfaces must contain exactly 60 rows")
    for index, row in enumerate(surfaces): surface(row, f"surfaces[{index}]", repo_root)
    expected_surfaces = [(surface_name, feature_id) for surface_name in ("windows-desktop-application","documentation-site") for feature_id in FEATURE_IDS]; require([(row["surfaceId"], row["featureId"]) for row in surfaces] == expected_surfaces, "surface membership or order drifted")
    require(root["counts"] == {"upstreamCommits":98,"mainCustomFeatures":30,"linkedWorktreeCommits":13,"preservationBranches":22,"surfaces":60,"surfacesPerFeature":2}, "derived counts drifted")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--inventory", type=Path, default=Path(".codex/verification/feature-lineage/inventory.json")); parser.add_argument("--schema", type=Path); parser.add_argument("--repo-root", type=Path, default=Path.cwd()); parser.add_argument("--upstream-repo", type=Path, required=True, help="initialized vendor/open-design submodule or task-local exact upstream checkout"); args = parser.parse_args()
    schema_path = args.schema or args.inventory.with_name("inventory.schema.json")
    try: validate(args.inventory, schema_path, args.repo_root, args.upstream_repo)
    except ValidationError as error: print(f"FAIL: {error}", file=sys.stderr); return 1
    print("PASS: feature lineage inventory is complete, exact, and source-verified"); return 0
if __name__ == "__main__": raise SystemExit(main())
