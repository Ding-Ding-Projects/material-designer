# Full folder browser

Every Windows daemon-backed folder choice opens the Explorer-style common
dialog, not the legacy tree-only `FolderBrowserDialog`. This covers working
directories, linked local code, project locations, folder imports and
design-system source folders because they all share `POST /api/dialog/open-folder`.

## Behavior

The browser provides the standard address and breadcrumb navigation, back,
forward and up history, sidebar locations, search, folder contents in the
shell's available views, keyboard navigation and inline new-folder controls.
The title comes from the typed `workingDirPicker.title` locale key (with
`Select a code folder to link` as the English fallback); the desktop path is
parented to the initiating Electron window and the daemon fallback uses a
topmost one-pixel owner without replacing the shell UI. After the dialog
settles, the desktop parent and the originating renderer trigger are focused
again where those owners are available.

The implementation uses `OpenFileDialog` as an Explorer-shell adapter with an
exact private sentinel filename. Its `FileOk` handler accepts only:

1. a path that is itself an existing directory; or
2. the exact sentinel inside an existing current directory.

A real file, malformed path, unavailable share or missing directory cancels the
close and leaves the browser open. Returned paths pass through
`Path.GetFullPath`; drive and UNC roots are not trimmed, and Unicode, spaces and
apostrophes remain intact. Cancel returns `null` through the existing API.
Renderer failure and cancellation copy comes from the typed locale dictionary;
English and Hong Kong Cantonese funny-level overrides change only its voice,
not the path, failure, or recovery facts.

## Security and failure behavior

- File selection can never be converted silently into its parent directory.
- No arbitrary path is accepted merely because filename validation is disabled.
- Inaccessible and disconnected directories remain unselected.
- The dialog and owner are disposed in `finally`.
- Native command failure retains the existing `null` result rather than
  returning partial stdout.
- The selected path still passes the same downstream canonicalization and trust
  boundaries as a typed or desktop-host-picked path.

## Verification

Focused source tests pin STA mode, the owner relationship, Explorer dialog
properties, the sentinel, `FileOk`, directory existence, file rejection, full
path normalization, localized title escaping, Unicode/space/apostrophe paths,
empty and nonempty folder fixtures, cancellation, failure, and disposal. A
desktop source check also pins the Electron parent, Explorer properties, parent
focus restoration, cancellation separation, and the absence of the legacy
tree-only dialog identifier. A complete Windows artifact verdict also
opens the real dialog through the approved hidden-desktop route, confirms the
Explorer surface, selects a Unicode test directory using the keyboard, checks
the exact returned path, and exercises Escape cancellation. Source-string tests
do not claim that final rendered/interaction proof.

## Suggested reading

- [accessibility.md](accessibility.md)
- [regex-builder.md](regex-builder.md)
- [../architecture/packaged-runtime.md](../architecture/packaged-runtime.md)
