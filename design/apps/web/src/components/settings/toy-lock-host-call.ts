// Compatibility export for settings integrations that still import the
// historical path. The implementation lives with the dedicated toy-lock
// components so future callers share one deadline and one failure contract.
export {
  TOY_LOCK_UI_DEADLINE_MS,
  withToyLockUiDeadline,
} from '../toy-locks/host-call';
