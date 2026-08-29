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
for a vertical strip. `Button` defaults to the outlined Material 3 treatment,
with `loading` disabling the native control for the complete operation.
`Field` creates stable local ids when its child control does not provide one.
`Menu` autofocuses its first enabled item and wraps arrow movement by default.
`TabPanel` stays mounted by default so switching tabs does not discard local
state; set `keepMounted={false}` when a surface explicitly needs unmounting.

## Failure modes

The package does not pretend to migrate the whole product. Existing feature
components may still use legacy global classes until their owning migration
lane moves them to these primitives. The explicit aliases in `Button` are a
compatibility boundary, not a second design system.

If the web token sheet is absent, each primitive has a conservative fallback
for its key colour, size and shape values. A consumer still needs the token
sheet for the complete theme, density, seeded palette and typeface behaviour.
If an overlay caller needs a non-modal focus trap, it should use `Dialog`; an
`OverlaySurface` only owns its painted surface, Escape handling and bounds.

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
focus, selected panels, field relationships and overlay dismissal.
`material-primitives.contract.test.ts` checks the complete export boundary,
token and reduced-motion declarations, explicit legacy aliases, and a
deliberate red-then-green marker regression. These checks prove the shared
package boundary only. They do not prove that every existing product surface
uses the new primitives, which remains a follow-up migration concern.

## Suggested articles

- [material-design-3.md](material-design-3.md) — the product-wide conformance
  contract and its current partial status.
- [accessibility.md](accessibility.md) — keyboard, focus, role and sizing
  requirements for every surface.
- [overlays.md](overlays.md) — painted, bounded and keyboard-reachable overlay
  behaviour.
- [typography-and-icons.md](typography-and-icons.md) — bundled typefaces and
  icon-font boundaries.
