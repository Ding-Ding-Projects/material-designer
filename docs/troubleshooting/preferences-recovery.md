# Desktop preference recovery

## Behavior

Desktop preferences use the optional host settings bridge when it is available.
Language, tone, School mode, narration, attention settings, and schedules retain
a bounded local recovery record when the host cannot accept a change. Multiple
panels share one serialized coordinator. Nested controls submit only changed
fields, and schedule changes identify the affected rule, so an older panel cannot
overwrite a newer independent edit.

A pre-host local record imports only into an untouched host revision. Later
host/local differences require an explicit recovery decision:

- **Apply local recovery** reads the current host revision and submits one
  revision-checked write. A rejected write retains the recovery record.
- **Keep host settings** accepts the host value without writing it. The local
  snapshot remains reviewed history and is never automatically replayed.
- **Retry recovery history** retries only history persistence. It never repeats
  an already accepted host write.

After a renderer restart, the complete normalized setting values are compared.
Matching values are adopted without another write; differing values remain a
conflict. Equality establishes that the values match, not who applied them.
Revision and update time alone do not turn identical values into a conflict.

## Failure and recovery

Host disappearance, revision conflicts, and local storage quota/security errors
do not silently discard the proposed snapshot. Accepted host state and pending
history are represented separately. History failures remain visible and retryable.
The UI does not claim that history was saved when only the host write succeeded.

School mode suppresses the runtime behaviors it owns, including dialog emoji,
narration, scheduled overlays, and attention surfaces, while preserving the
user's choices for restoration when that mode ends.

## Integration and privacy

The canonical API is `writeUniversalSettingsPatch(UniversalSettingsPatch):
Promise<void>`. Consumers submit field-minimal nested patches, use stable schedule
operations, and handle rejected writes with persistent feedback. The old universal
module paths re-export this implementation rather than creating another store.
This settings record does not carry host integration credentials; the privileged
credential path remains host-owned.

## Verification boundary

Candidate `fae71c4cd767766b0f0a312e4f65e494664b2ef0` passed 35 focused tests across
two files, including mounted recovery buttons, concurrent editors, bridge loss,
quota/security errors, School transitions, and fresh-module restart recovery.
Negative cases were observed before repair, and two independent final reviews
found no remaining source issue in this batch. Imported-source verification
reports zero gaps. Full renderer, installed interaction, and visual matrix
verification remain pending in issue #21.
