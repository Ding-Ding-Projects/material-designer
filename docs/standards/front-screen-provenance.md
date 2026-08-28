# Front-screen version provenance

## Behaviour

The Material Designer desktop web surface presents a factual identity strip before its tab strip and before the onboarding sign-in surface. It shows the running package version and the build or release timestamp that belongs to that same version. The timestamp is formatted for the visitor's local timezone with seconds and an explicit timezone name. The strip is present while the application is loading, so missing data is visible as unavailable rather than being replaced by a launch-time clock.

The documentation site presents the same information before its tabs. Its checked-in tuple is intentionally empty and renders an unavailable state until the Pages workflow injects a tuple from a matching published release. The site formats that recorded instant locally in the browser while retaining seconds and a timezone label.

The onboarding identity surface uses the Material Designer display name and does not present the upstream product name as the installed application's identity.

## Configuration

Packaged builds carry two provenance values in `open-design-config.json`:

- `buildSourceCommit`, a 40-character source commit id;
- `buildUpdatedAt`, an ISO-8601 timestamp with seconds and a UTC or numeric offset.

The release workflow receives the timestamp from GitHub's run-start provenance and passes both values through the packer into the packaged sidecar environment. The supported `build-installer.ps1` route accepts the same values only when they are supplied externally, match the checked-out commit and package version, and pass strict calendar validation. It never creates a timestamp from the host clock. When those values are absent or invalid, the generated record carries `provenanceStatus: unavailable` and the front-screen strip reports unavailable. The daemon publishes provenance through `GET /api/version` only when the record is valid and its version matches the resolved package version.

The site keeps its corresponding verified release tuple in the front-screen data attributes in `site/index.html`. That tuple is release data, not a browser load timestamp.

## Failure modes

An empty or placeholder version is unavailable. A provenance record with a malformed commit, a timestamp without seconds or timezone, an invalid date, or a version different from the displayed version is unavailable. The version may remain visible when it is independently valid, but the timestamp and verification state remain unavailable. No current clock, file modification time, or launch time is used as a substitute.

## Security considerations

The record contains public build facts only. It carries no credentials, local paths, tokens, or user data. The daemon validates the commit and timestamp shape before returning the record. The site reads only its own checked-in data attributes and makes no network request to resolve this identity strip.

## Verification

Focused source checks cover:

- bound version and provenance acceptance;
- `/api/version` unavailable and verified response cases;
- `/api/health` and `/api/version` bounded deadlines, so a hung boot dependency
  settles to unavailable instead of leaving the shell inert forever;
- placeholder, version mismatch, malformed commit, and malformed timestamp refusal;
- the shared bounded semantic-version validator rejecting malformed and
  overlong package versions;
- bounded version-request cancellation that settles a hung lookup to unavailable;
- local formatting with seconds;
- packaged sidecar forwarding of both provenance values;
- the empty site source tuple, visible fields, local formatter, and unavailable fallback;
- strict calendar validation that rejects overflow dates such as February 31;
- the manual installer route's externally supplied-or-unavailable provenance boundary;
- the Pages workflow's no-JavaScript injection of every visible provenance value and status.

The relevant files are `design/apps/web/src/lib/front-screen-provenance.ts`, `design/apps/web/src/components/FrontScreenProvenance.tsx`, `design/apps/daemon/src/app-version.ts`, `design/apps/packaged/src/config.ts`, `design/apps/packaged/src/sidecars.ts`, and `site/assets/js/main.js`. Hosted build and packaged interaction remain separate evidence requirements and must be rerun against the commit that contains this feature.

### Suggested articles

- [releases.md](releases.md), for release metadata and installer provenance.
- [packaged-runtime.md](../architecture/packaged-runtime.md), for the packaged process layout.
- [shell-chrome.md](../architecture/shell-chrome.md), for the desktop shell's status surfaces.
