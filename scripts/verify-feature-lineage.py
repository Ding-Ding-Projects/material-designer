#!/usr/bin/env python3
"""Validate the hand-written feature and commit lineage inventory."""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

FEATURE_IDS = ["language-modes","dialog-emoji-toggle","school-mode","narration","scheduled-settings","dim-sum-surprise","regex-builders","notification-centre","appearance-editors","tabbed-navigation","offline-documentation","command-palette","destructive-confirmation","local-history","changelog-viewer","external-editor","exports","bulk-actions","accessibility-responsive-sizing","personal-vocabulary-upload","toy-locks-authentication","unlock-ladder","shared-link-embed","adhd-modes","browser-download-surfaces","app-logo-customization","file-converter","ollama-suite-manager","status-hub","front-screen-provenance"]
PRESERVATION_BRANCHES = ["preservation/advanced-regex-snapshot-20260828","preservation/appearance-deep-20260828","preservation/appearance-export-schema-20260828","preservation/appearance-schema-20260828","preservation/appearance-source-20260828","preservation/authenticator-lockout-20260828","preservation/browser-downloads-confirmations-20260828","preservation/build-updater-20260828","preservation/documentation-evidence-20260828","preservation/documentation-site-parity-20260828","preservation/emergency-index-20260828","preservation/file-converter-snapshot-20260828","preservation/front-provenance-20260828","preservation/logo-customization-20260828","preservation/ollama-suite-20260828","preservation/personal-vocabulary-snapshot-20260828","preservation/release-integrity-20260828","preservation/shared-ui-primitives-20260828","preservation/tabs-history-20260828","preservation/toy-lock-integration-20260828","preservation/toy-lock-source-snapshot-20260828","preservation/universal-settings-snapshot-20260828"]
SHA = re.compile(r"^[0-9a-f]{40}$")
SURFACES = {"windows-desktop-application", "documentation-site"}
STATUSES = {"implemented", "partial", "absent", "unreachable"}
FEATURE_FIELDS = {"id","lineageCommits","behavior","paths","apisOrStorage","desktopImplementation","siteImplementation","materialDesign3","localization","persistence","tests","negativeProof","interactions","captures","state"}
SURFACE_FIELDS = {"surfaceId","featureId","lineageCommits","behavior","paths","apisOrStorage","desktopOrSiteImplementation","materialDesign3","localization","persistence","tests","negativeProof","interactions","captures","state"}

class ValidationError(Exception):
    pass

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)

def text(value: object, label: str) -> None:
    require(isinstance(value, str) and bool(value.strip()), f"{label} must be non-empty text")

def strings(value: object, label: str, nonempty: bool = False) -> None:
    require(isinstance(value, list), f"{label} must be an array")
    require(not nonempty or bool(value), f"{label} must not be empty")
    require(all(isinstance(item, str) for item in value), f"{label} must contain only strings")

def shas(value: object, label: str) -> None:
    require(isinstance(value, list), f"{label} must be an array")
    require(all(isinstance(item, str) and SHA.fullmatch(item) for item in value), f"{label} has a malformed SHA")
    require(len(value) == len(set(value)), f"{label} contains duplicate SHAs")

def feature(row: object, label: str) -> None:
    require(isinstance(row, dict), f"{label} must be an object")
    require(set(row) == FEATURE_FIELDS, f"{label} fields drifted")
    require(row["id"] in FEATURE_IDS, f"{label} has an unknown feature ID")
    shas(row["lineageCommits"], f"{label}.lineageCommits")
    text(row["behavior"], f"{label}.behavior")
    strings(row["paths"], f"{label}.paths")
    strings(row["apisOrStorage"], f"{label}.apisOrStorage", True)
    require(isinstance(row["desktopImplementation"], dict), f"{label}.desktopImplementation must be an object")
    require(isinstance(row["siteImplementation"], dict), f"{label}.siteImplementation must be an object")
    for key in ["materialDesign3","localization","persistence","tests","negativeProof"]: text(row[key], f"{label}.{key}")
    strings(row["interactions"], f"{label}.interactions", True)
    strings(row["captures"], f"{label}.captures")
    require(row["state"] in STATUSES, f"{label}.state is not supported")

def surface(row: object, label: str) -> None:
    require(isinstance(row, dict), f"{label} must be an object")
    require(set(row) == SURFACE_FIELDS, f"{label} fields drifted")
    require(row["surfaceId"] in SURFACES, f"{label}.surfaceId is unknown")
    require(row["featureId"] in FEATURE_IDS, f"{label}.featureId is unknown")
    shas(row["lineageCommits"], f"{label}.lineageCommits")
    text(row["behavior"], f"{label}.behavior")
    strings(row["paths"], f"{label}.paths")
    strings(row["apisOrStorage"], f"{label}.apisOrStorage", True)
    require(isinstance(row["desktopOrSiteImplementation"], dict), f"{label}.desktopOrSiteImplementation must be an object")
    for key in ["materialDesign3","localization","persistence","tests","negativeProof"]: text(row[key], f"{label}.{key}")
    strings(row["interactions"], f"{label}.interactions", True)
    strings(row["captures"], f"{label}.captures")
    require(row["state"] in STATUSES, f"{label}.state is not supported")

def upstream_history(path: Path, target: str) -> list[tuple[str,str]]:
    command = ["git", "-C", str(path), "log", "--format=%H%x09%s", "-n", "98", target]
    try: result = subprocess.run(command, check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError) as error: raise ValidationError(f"could not read upstream history: {error}")
    rows=[]
    for line in result.stdout.splitlines():
        sha, sep, subject = line.partition("\t")
        require(sep == "\t", "upstream history returned a malformed row")
        rows.append((sha, subject))
    return rows

def validate(path: Path, upstream: Path | None) -> None:
    try: root=json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error: raise ValidationError(f"cannot read inventory: {error}")
    require(isinstance(root,dict), "inventory root must be an object")
    top={"schemaVersion","inventoryId","target","canonicalFeatureIds","lineageCommits","mainCustomFeatures","linkedWorktreeCommits","preservationBranches","surfaces","counts"}
    require(set(root)==top,"inventory top-level fields drifted")
    require(root["schemaVersion"]==1 and root["inventoryId"]=="feature-lineage-v1","inventory identity drifted")
    target=root["target"]
    require(isinstance(target,dict),"target must be an object")
    require(set(target)=={"sourceRepository","sourceUrl","pinnedImport","targetCommit","expectedCommitCount","membershipOrder"},"target fields drifted")
    require(target=={"sourceRepository":"nexu-io/open-design","sourceUrl":"https://github.com/nexu-io/open-design.git","pinnedImport":"05f5b33ef59f078df10ac1125986e00e4a796cf3","targetCommit":"a554d017c8fa12d8913354ba6cf792d26d0c3b54","expectedCommitCount":98,"membershipOrder":"git log -n 98 <target>"},"target metadata drifted")
    require(root["canonicalFeatureIds"]==FEATURE_IDS,"canonical feature ID membership or order drifted")
    commits=root["lineageCommits"]
    require(isinstance(commits,list) and len(commits)==98,"lineageCommits must contain exactly 98 rows")
    for i,row in enumerate(commits,1):
        require(isinstance(row,dict) and set(row)=={"order","sha","subject"},f"lineageCommits[{i-1}] fields drifted")
        require(row["order"]==i and isinstance(row["sha"],str) and SHA.fullmatch(row["sha"]),f"lineageCommits[{i-1}] order or SHA is malformed")
        text(row["subject"],f"lineageCommits[{i-1}].subject")
    require(len({row["sha"] for row in commits})==98,"lineageCommits contains duplicate SHAs")
    require(commits[0]["sha"]==target["targetCommit"],"lineage history must start at targetCommit")
    if upstream is not None: require([(r["sha"],r["subject"]) for r in commits]==upstream_history(upstream,target["targetCommit"]),"lineage does not match upstream target history")
    features=root["mainCustomFeatures"]
    require(isinstance(features,list) and len(features)==30,"mainCustomFeatures must contain exactly 30 rows")
    for i,row in enumerate(features): feature(row,f"mainCustomFeatures[{i}]")
    require([row["id"] for row in features]==FEATURE_IDS,"mainCustomFeatures membership or order drifted")
    linked=root["linkedWorktreeCommits"]
    require(isinstance(linked,list) and len(linked)==13,"linkedWorktreeCommits must contain exactly 13 rows")
    branches={"codex/download-menu-accessibility","codex/folder-browser-final-repair"}
    require({row.get("branch") for row in linked if isinstance(row,dict)}==branches,"linked worktree branch membership drifted")
    seen=set()
    for i,row in enumerate(linked):
        require(isinstance(row,dict) and set(row)=={"branch","sha","subject"},f"linkedWorktreeCommits[{i}] fields drifted")
        require(row["branch"] in branches and isinstance(row["sha"],str) and SHA.fullmatch(row["sha"]),f"linkedWorktreeCommits[{i}] is malformed")
        text(row["subject"],f"linkedWorktreeCommits[{i}].subject"); require(row["sha"] not in seen,"linkedWorktreeCommits contains duplicate SHAs"); seen.add(row["sha"])
    preservation=root["preservationBranches"]
    require(isinstance(preservation,list) and len(preservation)==22,"preservationBranches must contain exactly 22 rows")
    require([row.get("branch") for row in preservation if isinstance(row,dict)]==PRESERVATION_BRANCHES,"preservation branch membership or order drifted")
    seen=set()
    for i,row in enumerate(preservation):
        require(isinstance(row,dict) and set(row)=={"branch","sha","subject"},f"preservationBranches[{i}] fields drifted")
        require(isinstance(row["sha"],str) and SHA.fullmatch(row["sha"]),f"preservationBranches[{i}] SHA is malformed"); text(row["subject"],f"preservationBranches[{i}].subject"); require(row["sha"] not in seen,"preservationBranches contains duplicate SHAs"); seen.add(row["sha"])
    surfaces=root["surfaces"]
    require(isinstance(surfaces,list) and len(surfaces)==60,"surfaces must contain exactly 60 rows")
    for i,row in enumerate(surfaces): surface(row,f"surfaces[{i}]")
    expected=[(s,f) for s in ("windows-desktop-application","documentation-site") for f in FEATURE_IDS]
    require([(row["surfaceId"],row["featureId"]) for row in surfaces]==expected,"surface membership or order drifted")
    require(root["counts"]=={"upstreamCommits":98,"mainCustomFeatures":30,"linkedWorktreeCommits":13,"preservationBranches":22,"surfaces":60,"surfacesPerFeature":2},"derived counts drifted")

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--inventory",type=Path,default=Path(".codex/verification/feature-lineage/inventory.json")); parser.add_argument("--upstream-repo",type=Path); args=parser.parse_args()
    try: validate(args.inventory,args.upstream_repo)
    except ValidationError as error: print(f"FAIL: {error}",file=sys.stderr); return 1
    print("PASS: feature lineage inventory is complete and exact"); return 0
if __name__=="__main__": raise SystemExit(main())
