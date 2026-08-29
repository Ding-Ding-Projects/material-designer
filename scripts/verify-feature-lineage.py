#!/usr/bin/env python3
"""Validate the explicit feature and commit lineage inventory."""
from __future__ import annotations
import argparse
import json
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
IMPLEMENTATION_FIELDS = {"status", "paths"}

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

def path_list(value: object, label: str, repo_root: Path) -> None:
    string_list(value, label)
    root = repo_root.resolve()
    for raw in value:
        require("\\" not in raw, f"{label} contains a non-canonical path: {raw}")
        relative = PurePosixPath(raw)
        require(not relative.is_absolute() and ".." not in relative.parts, f"{label} escapes the source boundary: {raw}")
        candidate = (root / Path(*relative.parts)).resolve(strict=False)
        try: candidate.relative_to(root)
        except ValueError: raise ValidationError(f"{label} escapes the source boundary: {raw}")
        require(candidate.is_file(), f"{label} references a missing or non-file path: {raw}")

def implementation(value: object, label: str, repo_root: Path) -> None:
    require(isinstance(value, dict), f"{label} must be an object")
    require(set(value) == IMPLEMENTATION_FIELDS, f"{label} fields drifted or object is empty")
    require(value["status"] in STATUSES, f"{label}.status is not supported")
    path_list(value["paths"], f"{label}.paths", repo_root)

def feature(row: object, label: str, repo_root: Path) -> None:
    require(isinstance(row, dict), f"{label} must be an object")
    require(set(row) == FEATURE_FIELDS, f"{label} fields drifted")
    require(row["id"] in FEATURE_IDS, f"{label} has an unknown feature ID")
    sha_list(row["lineageCommits"], f"{label}.lineageCommits"); nonempty_text(row["behavior"], f"{label}.behavior")
    path_list(row["paths"], f"{label}.paths", repo_root); string_list(row["apisOrStorage"], f"{label}.apisOrStorage", nonempty=True)
    implementation(row["desktopImplementation"], f"{label}.desktopImplementation", repo_root); implementation(row["siteImplementation"], f"{label}.siteImplementation", repo_root)
    for key in ["materialDesign3","localization","persistence","tests","negativeProof"]: nonempty_text(row[key], f"{label}.{key}")
    string_list(row["interactions"], f"{label}.interactions", nonempty=True); path_list(row["captures"], f"{label}.captures", repo_root); require(row["state"] in STATUSES, f"{label}.state is not supported")

def surface(row: object, label: str, repo_root: Path) -> None:
    require(isinstance(row, dict), f"{label} must be an object"); require(set(row) == SURFACE_FIELDS, f"{label} fields drifted")
    require(row["surfaceId"] in SURFACES, f"{label}.surfaceId is unknown"); require(row["featureId"] in FEATURE_IDS, f"{label}.featureId is unknown")
    sha_list(row["lineageCommits"], f"{label}.lineageCommits"); nonempty_text(row["behavior"], f"{label}.behavior"); path_list(row["paths"], f"{label}.paths", repo_root)
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
    rows = git_bytes(repo, "rev-list", "-n", "98", target).decode("ascii", errors="strict").splitlines()
    require(len(rows) == 98, f"upstream target returned {len(rows)} commits, expected 98"); require(all(SHA.fullmatch(row) for row in rows), "upstream target returned a malformed SHA"); return rows

def validate(path: Path, repo_root: Path, upstream_repo: Path) -> None:
    try: root = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error: raise ValidationError(f"cannot read inventory: {error}")
    require(isinstance(root, dict), "inventory root must be an object")
    top = {"schemaVersion","inventoryId","target","canonicalFeatureIds","lineageCommits","mainCustomFeatures","linkedWorktreeCommits","preservationBranches","surfaces","counts"}; require(set(root) == top, "inventory top-level fields drifted")
    require(root["schemaVersion"] == 1 and root["inventoryId"] == "feature-lineage-v1", "inventory identity drifted")
    target = root["target"]; require(target == {"sourceRepository":"nexu-io/open-design","sourceUrl":"https://github.com/nexu-io/open-design.git","pinnedImport":"05f5b33ef59f078df10ac1125986e00e4a796cf3","targetCommit":"a554d017c8fa12d8913354ba6cf792d26d0c3b54","expectedCommitCount":98,"membershipOrder":"git log -n 98 <target>"}, "target metadata drifted")
    require(root["canonicalFeatureIds"] == FEATURE_IDS, "canonical feature ID membership or order drifted")
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
        require(isinstance(row, dict) and set(row) == {"branch","sha","subject","subjectMode"}, f"linkedWorktreeCommits[{index}] fields drifted"); require(row["branch"] in linked_branches and isinstance(row["sha"], str) and SHA.fullmatch(row["sha"]), f"linkedWorktreeCommits[{index}] is malformed"); nonempty_text(row["subject"], f"linkedWorktreeCommits[{index}].subject"); require(row["subjectMode"] in {"git-first-line","literal-escape-first-line-public"}, f"linkedWorktreeCommits[{index}].subjectMode is unsupported"); git_ref(repo_root, f"refs/heads/{row['branch']}", f"linked ref {row['branch']}"); git_ref(repo_root, f"{row['sha']}^{{commit}}", f"linked commit {row['sha']}"); require(first_subject(repo_root, row["sha"], row["subjectMode"]) == row["subject"], f"linked subject mismatch for {row['sha']}")
    for branch in sorted(linked_branches):
        expected = [row["sha"] for row in linked if row["branch"] == branch]; actual = git_bytes(repo_root, "rev-list", f"main..{branch}").decode("ascii", errors="strict").splitlines(); require(actual == expected, f"linked membership mismatch for {branch}")
    preservation = root["preservationBranches"]; require(isinstance(preservation, list) and len(preservation) == 22, "preservationBranches must contain exactly 22 rows"); require([row.get("branch") for row in preservation if isinstance(row, dict)] == PRESERVATION_BRANCHES, "preservation branch membership or order drifted")
    seen = set()
    for index, row in enumerate(preservation):
        require(isinstance(row, dict) and set(row) == {"branch","sha","subject"}, f"preservationBranches[{index}] fields drifted"); require(isinstance(row["sha"], str) and SHA.fullmatch(row["sha"]), f"preservationBranches[{index}] SHA is malformed"); nonempty_text(row["subject"], f"preservationBranches[{index}].subject"); require(row["sha"] not in seen, "preservationBranches contains duplicate SHAs"); seen.add(row["sha"]); resolved = git_ref(repo_root, f"refs/remotes/origin/{row['branch']}", f"preservation ref {row['branch']}"); require(resolved == row["sha"], f"preservation ref moved for {row['branch']}"); require(first_subject(repo_root, row["sha"]) == row["subject"], f"preservation subject mismatch for {row['branch']}")
    surfaces = root["surfaces"]; require(isinstance(surfaces, list) and len(surfaces) == 60, "surfaces must contain exactly 60 rows")
    for index, row in enumerate(surfaces): surface(row, f"surfaces[{index}]", repo_root)
    expected_surfaces = [(surface_name, feature_id) for surface_name in ("windows-desktop-application","documentation-site") for feature_id in FEATURE_IDS]; require([(row["surfaceId"], row["featureId"]) for row in surfaces] == expected_surfaces, "surface membership or order drifted")
    require(root["counts"] == {"upstreamCommits":98,"mainCustomFeatures":30,"linkedWorktreeCommits":13,"preservationBranches":22,"surfaces":60,"surfacesPerFeature":2}, "derived counts drifted")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--inventory", type=Path, default=Path(".codex/verification/feature-lineage/inventory.json")); parser.add_argument("--repo-root", type=Path, default=Path.cwd()); parser.add_argument("--upstream-repo", type=Path, required=True, help="initialized vendor/open-design submodule or task-local exact upstream checkout"); args = parser.parse_args()
    try: validate(args.inventory, args.repo_root, args.upstream_repo)
    except ValidationError as error: print(f"FAIL: {error}", file=sys.stderr); return 1
    print("PASS: feature lineage inventory is complete, exact, and source-verified"); return 0
if __name__ == "__main__": raise SystemExit(main())
