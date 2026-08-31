# Status Hub surface

The web application has a reusable Status Hub surface for showing the current
state of a work session, its lanes, evidence, and the next checks that still
need attention. It is a read-and-report surface, not a second source of truth.

## Data and delivery boundary

`design/apps/web/src/runtime/status-hub.ts` contains the transport client and
the local fallback model. The client uses same-origin requests by default and
accepts a configured HTTPS endpoint when a deployment needs one. Relative values
are resolved with URL semantics and must retain the exact current origin. Plain
HTTP is refused before the access callback runs unless the caller explicitly
enables a loopback development URL; protocol-relative, malformed and backslash
authority forms are refused too. Every request keeps one bounded deadline through
credential resolution, headers, body parsing, and response mapping. A streamed
body is byte bounded and cancelled on timeout; a response without a stream must
declare a bounded `Content-Length` before text is read. It validates the response
schema, limits list traversal and text lengths, and refuses a response for a
different session. Invalid or unreachable data remains unavailable rather than
becoming a guessed success.

The access credential is resolved by a callback for the individual request. It
is never part of `StatusSnapshot`, `StatusLane`, `StatusEvidence`, replies,
local fallback state, logs, or exported data. The client does not write a
credential to browser storage. A successful HTTP response is not enough to
claim that a status update or answer was delivered when the service explicitly
returns `acknowledged: false`, `accepted: false`, or `delivered: false`.

The local fallback is deliberately in memory. It is useful when the shared
service is unavailable, and its card is labelled as local-only. Its timestamp
is unavailable until a real update is supplied. Its `sharedDelivery` and
`pollable` capabilities are false, its publish result is local-only and not
delivered, and its answer route is unavailable. It cannot answer a user
question or imply that another reader received an update. A caller can retry
the authenticated client at any time.

## Surface contract

`StatusHubCard` renders the current state as text and a status marker, the last
updated instant, the verified baseline, top-level evidence, lanes, and next
checks. Each lane is an accessible expandable section. The card has its own
plain-text-first search field with an adjacent regex builder and keeps the
search state local to that card. Evidence, lanes, and next checks all use that
same predicate. The result set reports an honest no-match or empty state.
Records older than five minutes are rendered as stale waiting data with an
age and a last-known state, never as a current verified state. Links are
displayed only after URL validation and open with the usual external-link
protections. A bounded 15-second freshness timer recomputes that state while a
card is mounted and clears itself when the card unmounts.

`StatusHubPanel` reads the authenticated client first. If that read fails and a
fallback was supplied, it renders the fallback and labels the reason. It does
not silently replace a failed acknowledgement with a green state. `mountId`
is one of `C0`, `C2`, `C7`, or `C12`, so integration mounts can be addressed and
tested without importing application navigation or changing route ownership.
The mount/open event remains an integration boundary in the host shell; this
lane does not edit the central application mount. `openStatusHub` dispatches a
typed local event and the matching panel refreshes its client; dispatching the
event alone never claims that a remote reader saw it.

The source is committed, the generated release data is checked against the
explicit GitHub CLI inventory, and the build-time completeness Chut is
available through `--check`. No hosted Status Hub endpoint or authentication
was configured for this lane, so hosted delivery and a real built-interface
drive remain unverified rather than being inferred from source.

`scripts/verify-changelog-status.ps1` is the deterministic local aggregator for
the release-history and status-adjacent negative Chuts. It is a source check
ready for C0 build-script integration, not a hosted delivery proof.

The component uses Material Design 3 color roles, shape, elevation and touch
targets. It remains usable at narrow widths, wraps long evidence and commit
strings, and removes non-essential motion under the reduced-motion preference.
The host supplies localized labels through `StatusHubLabels`, which keeps the
transport and card reusable across the three language modes without embedding
private or machine-specific text in the client.

## Failure modes and recovery

| State | What the user sees | Recovery |
| --- | --- | --- |
| Missing or unreachable service | Unavailable status, with the local-only label when a fallback exists | Retry the card's refresh action or reconnect the service |
| Invalid response or wrong session | The existing snapshot remains, or an honest unavailable state | Inspect the service schema and retry |
| Stale response | Waiting status with the age and last-known state | Refresh the authenticated service |
| Expired or refused authorization | Unavailable status, never a delivered claim | Re-authenticate through the owning host flow, then refresh |
| Explicit negative acknowledgement | The update is not reported as delivered | Keep the prior facts and retry after the service is healthy |
| No evidence or next checks | A labelled empty state | This is a real empty collection, not a loading spinner |

The surface never renders a question control that appears to send an answer
without an acknowledgement. A host that needs interactive questions should call
`answer`, then poll the replies endpoint or the owning inbox before describing
the answer as delivered.

## Verification

Focused tests live in `design/apps/web/tests/runtime/status-hub.test.ts` and
`design/apps/web/tests/components/StatusHubCard.test.tsx`, and
release-history boundary checks live in `scripts/test-release-history-negative.mjs`.
They cover session binding, malformed evidence removal, bounded arrays and response
bytes, transport scope and credential ordering, acknowledgement refusal,
credential separation between headers and body, stale state, unavailable
timestamps, local-only capabilities, and the local fallback update path.
Built application interaction and hosted Status Hub delivery remain separate
evidence requirements for the integration lane.

## Suggested reading

- [front-screen-provenance.md](front-screen-provenance.md), for artifact-bound version facts.
- [changelog-viewer.md](changelog-viewer.md), for the all-releases viewer shown beside those facts.
- [../site/pages-deployment.md](../site/pages-deployment.md), for the hosted status surface boundary.
