# Authenticator persistence

Authenticator metadata is written through a unique temporary file and then promoted over the prior metadata file. A transient operating-system replacement refusal is retried a bounded number of times. The prior metadata remains the last valid record until the replacement succeeds.

The authenticator store serializes concurrent changes. It writes a validated candidate before publishing that candidate to the live in-memory list. If the metadata write fails, the rejected candidate is not visible to callers and cannot be persisted by a later change. A local history append failure is separate: the metadata change remains applied and the caller receives its recovery status.

If the application reports a persistence failure, retry the requested change after the filesystem is available. Do not delete the application data folder solely for a transient save failure: the existing metadata record is retained.
