# Shared Material Design 3 primitives

This page records the shared component package's Material Design 3 foundation.
It is an implementation boundary for later application work, not a claim that
every existing application surface has already migrated.

## Behaviour

`@open-design/components` exposes reusable primitives for the component anatomy
that the application is moving toward:

- `Button` supports filled, tonal, outlined, text, elevated and error variants,
  48dp touch targets, loading state, full-width layout, state layers and a
  visible focus ring. Existing variant names remain explicit compatibility
  aliases and do not replace the Material 3 default.
- `Input`, `Textarea`, `Select` and `Field` provide labelled controls with
  description, required and error relationships through `aria-describedby`,
  `aria-required` and `aria-invalid`.
- `Checkbox`, `Radio` and `Switch` keep native input semantics while providing
  Material 3 indicators, focus, disabled and reduced-motion states.
- `Menu` and `MenuItem` provide menu roles, keyboard movement, Home/End,
  Escape/Tab dismissal, checkbox/radio item semantics, visible shortcut text
  and a painted, bounded surface.
- `Tabs`, `TabList`, `Tab` and `TabPanel` provide tablist/tab/tabpanel roles,
  roving focus, horizontal or vertical arrow movement, selected state and
  persistent panel relationships.
- `Typography` and its `Heading` and `Label` helpers map to the complete
  Material 3 type scale while retaining semantic element selection.
- `Surface`, `StateLayer` and `OverlaySurface` provide elevation levels,
  state-layer opacity, painted overlay chrome, Escape dismissal and viewport
  bounds.
- `DetailsSurface` and `SummarySurface` provide the structural disclosure
  pair. `SummarySurface` can only mount beneath its real `details` owner.

All primitives consume `--md-sys-*` roles, shape, elevation, type, spacing,
state-layer and motion tokens. Functional data colours remain product-owned
data and are not repainted as component chrome.

## Configuration

The component package is source-transpiled by the web application. Consumers
import the components from `@open-design/components`; the package's
`styles.css` remains the compatibility global sheet, while each new primitive
uses a colocated CSS Module. The web token sheet is loaded before the package
global sheet in `design/apps/web/src/index.css`.

`Tabs` defaults to horizontal orientation and accepts `orientation="vertical"`
for a vertical strip. Every `TabList` must provide `aria-label` or
`aria-labelledby`; an unnamed strip throws at render time instead of shipping
an inaccessible navigation surface. `Button` defaults to the outlined Material
3 treatment, with `loading` disabling the native control for the complete
operation. The `small` button is still 48dp tall, because a visual size name
must not quietly produce a target that is difficult to operate.
`Field` creates stable local ids when its child control does not provide one.
`Field required` sets both native `required` constraint validation and the
matching ARIA state while preserving a child control's existing required and
described-by values. `Menu` autofocuses its first enabled item and wraps arrow
movement by default. A menu shortcut may retain a string for display-only
compatibility, but `createMenuShortcutRegistry` is the only public registration
path. Its `register` method requires the binding id, visible label, handler,
context, and the same key sequence used by the binding source before any ARIA
shortcut is exposed. Only the opaque handle returned by that exact registry can
be passed to a `MenuItem`; a same-context handle from another registry and a
standalone branded-looking object are rejected. Re-registering an id with a
different label, key sequence, or context is rejected, as are unsupported
sequences and missing handlers. Keyboard dispatch is owned by the registry and
is limited to handles actually represented by that mounted menu's `MenuItem`
children, so one key sequence invokes one represented handler once. The registry
can query and invoke the same handler source that it registered. No shortcut is
invented from display text or an arbitrary ARIA value. Normalized `(context,
keys)` pairs must be unique within a registry; two different ids cannot silently
compete for the same key sequence.
`TabPanel` stays mounted by default so switching tabs does not discard local
state; set `keepMounted={false}` when a surface explicitly needs unmounting.
`OverlaySurface` is bounded on both viewport axes and scrolls internally.
Outside-pointer dismissal is opt-in through `dismissOnOutsidePress`; Escape
dismissal is independently controlled by `closeOnEscape`; both routes can
return focus through `returnFocusRef`. Overlay instances share a topmost-owner
stack, so Escape and outside presses dismiss only the top surface. A visible
surface without a real `onDismiss` keeps ownership and does not consume the
event. A portalled child cannot dismiss its parent, and each immediate opener
receives focus at most once for one dismissal of one mounted overlay instance.

The `.od-select-*` rules in `design/apps/web/src/styles/primitives.css` and the
`CustomSelect.tsx` provider are one atomic dependency on the shared-search
field. The provider renders a field-owned plain-text-first search input,
result count, filtered options, an honest no-results state, and a locked
wrapper that keeps the disabled trigger reachable for its unlock flow. The
wrapper classifies pointer, keyboard, programmatic, and context activation
separately and never activates the disabled target itself. The stylesheet
owns nested-scroll geometry and touch sizing, but CSS alone does not create
any of those behaviors. The provider and stylesheet must land together before
the select behavior can be called complete. Its real RegexSearchField builder
is portalled to `document.body`, and RegexSearchField passes its concrete mounted
builder root to the owning select through a bounded callback ref. The provider
uses the root's identity and node containment, accepting a composed path when
available and walking ancestry when it is not. The diagnostic `data-*` marker is
never sufficient for ownership, so copied markers, stale roots and unrelated
elements still dismiss the select. The production PluginInputsForm select field uses this
provider through a non-label field wrapper, avoiding native label double
activation while retaining its accessible name and value flow.

## Failure modes

The package does not pretend to migrate the whole product. Existing feature
components may still use legacy global classes until their owning migration
lane moves them to these primitives. The explicit aliases in `Button` are an
API compatibility boundary mapped only to the module's Material 3 classes;
the aliases do not emit legacy global classes, so a higher-specificity global
rule cannot repaint a Material 3 variant.

If the web token sheet is absent, each primitive has a conservative fallback
for its key colour, size and shape values. A consumer still needs the token
sheet for the complete theme, density, seeded palette and typeface behaviour.
If an overlay caller needs a non-modal focus trap, it should use `Dialog`; an
`OverlaySurface` owns its painted surface, explicit outside/Escape policy,
focus return, and both-axis bounds. An interactive `Surface` is rejected unless
`as` names a validated native interactive element. Anchors require a non-empty
`href`, a Surface rendered as `input` or `textarea` rejects children, and a
summary must be rendered through the structural `DetailsSurface` and
`SummarySurface` pair. The pair stamps an owner marker and checks the mounted
summary's actual parent element, so React-context-only or portalled summaries
are refused. A caller-supplied boolean is never accepted as ownership proof,
and an orphan `SummarySurface` is refused. The primitive does not style
a non-operable `div` as a clickable card.

## Security considerations

These are rendering-only primitives. They do not persist credentials, issue
network requests, execute commands or inspect user files. Native controls keep
the browser's input validation and assistive-technology semantics. `Menu` and
`Tabs` refuse disabled item movement and activation through the native disabled
state as well as their keyboard handlers.

## Verification

Run the focused component package checks from the design workspace:

```text
pnpm --filter @open-design/components typecheck
pnpm --filter @open-design/components test --run
```

`material-primitives.test.tsx` exercises native roles, keyboard movement,
focus, selected panels, field constraint validation, real registered shortcut
mapping, unnamed-tablist refusal, overlay dismissal and focus return, default
heading semantics, the small-button contract, and interactive-surface refusal.
The alias case also installs a deliberately hostile global rule and checks the
rendered computed colour, proving that compatibility aliases do not leak into
the effective cascade.
`material-primitives.contract.test.ts` parses CSS after removing comments,
tracks combinators, nested at-rules and layers, evaluates declaration order,
specificity and `!important`, checks unconditional versus media-conditioned
winners, and verifies
long-select nested-scroll reachability as a CSS handoff contract, checks the complete runtime export
boundary and token declarations, including exact reduced-motion winners and
decisive unrelated-media, constrained-media, unsupported-at-rule, unsupported
selector, stronger-selector, repeated-rule, layer-order, complexity, and
comment-only negatives. The parser fails closed when it cannot model the
selector or condition. These checks prove the shared
package boundary only. They do not prove that every existing product surface
uses the new primitives, which remains a follow-up migration concern.

The committed `design/apps/web/vitest.shared-primitives.config.ts` is the
narrow web-source route for the real `CustomSelect` and production
`PluginInputsForm` checks. It aliases workspace packages to their source entry
points, omits unrelated setup imports, and contains no `vi.mock` for
`RegexSearchField` or `useRegexSearch`. The route exercises the portalled builder root, pointer and
mouse fallback handling, teardown and remount ownership, all four lock
activation classifications, outside focus return, localized option values,
and real combobox selection. It is not a product build or a claim that every
existing select has migrated.

The committed `scripts/test-shared-primitives-mutations.ps1` is the executable
checked-source mutation route. It refuses a non-empty starting status, records
UTF-8 byte hashes and lengths, applies each source mutation separately, runs a
bounded real focused check, requires the expected red diagnostic, restores the
exact bytes in a `finally` path, re-runs the same check green, and proves final
hashes, `git diff`, and `git status` are unchanged. Its cases cover concrete
portal registration and callback detachment, production select adoption,
result counts, nested option overflow, duplicate normalized shortcuts,
`:not()` specificity, comment-only removals, and whole-import removal.

## Suggested articles

- [material-design-3.md](material-design-3.md): the product-wide conformance
  contract and its current partial status.
- [accessibility.md](accessibility.md): keyboard, focus, role and sizing
  requirements for every surface.
- [overlays.md](overlays.md): painted, bounded and keyboard-reachable overlay
  behaviour.
- [typography-and-icons.md](typography-and-icons.md): bundled typefaces and
  icon-font boundaries.
