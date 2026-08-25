/**
 * The handoff catalogue is deliberately hand-authored.
 *
 * It is a public map of the redesign's current implementation seams, not a
 * CSS parser or a promise that every component has already converged. The
 * verifier checks the exact 18 token rows and 12 owner rows below so a missing
 * row cannot disappear simply because a source file was renamed.
 */

export type HandoffStatus = 'implemented' | 'partial' | 'unverified';

export const HANDOFF_EXPORT_SCHEMA = 'material-designer.handoff.v1' as const;
export const HANDOFF_EXPORT_OMISSIONS = [
  'private user data',
  'credentials',
  'machine-specific paths',
  'runtime payloads',
] as const;
export const HANDOFF_TOKEN_EXPORT_FIELDS = [
  'id',
  'md3Token',
  'appVariable',
  'designSourcePath',
  'appSourcePath',
  'status',
  'evidence',
] as const;
export const HANDOFF_COMPONENT_EXPORT_FIELDS = [
  'id',
  'owner',
  'sourcePath',
  'status',
  'evidence',
] as const;

export interface HandoffTokenMapping {
  id: string;
  md3Token: string;
  appVariable: string;
  designSourcePath: 'apps/web/src/styles/md3-tokens.css';
  appSourcePath: 'apps/web/src/styles/tokens.css';
  status: HandoffStatus;
  evidence: string;
}

export interface HandoffComponentOwner {
  id: string;
  owner: string;
  sourcePath: string;
  status: HandoffStatus;
  evidence: string;
}

export const HANDOFF_TOKEN_MAPPINGS: readonly HandoffTokenMapping[] = [
  {
    id: 'color-primary-accent',
    md3Token: '--md-sys-color-primary',
    appVariable: '--accent',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'tokens.css maps --accent directly to the M3 primary role.',
  },
  {
    id: 'color-on-primary-contrast',
    md3Token: '--md-sys-color-on-primary',
    appVariable: '--accent-contrast',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'partial',
    evidence: 'The legacy light and dark blocks retain the contrast fallback; runtime seed overrides are not yet unified.',
  },
  {
    id: 'color-surface-bg',
    md3Token: '--md-sys-color-surface',
    appVariable: '--bg',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'The product background token resolves to the M3 surface role.',
  },
  {
    id: 'color-surface-bg-app',
    md3Token: '--md-sys-color-surface',
    appVariable: '--bg-app',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'The application canvas uses the same M3 surface role as the base background.',
  },
  {
    id: 'color-surface-container-low-panel',
    md3Token: '--md-sys-color-surface-container-low',
    appVariable: '--bg-panel',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Panel surfaces consume the low container role.',
  },
  {
    id: 'color-surface-container-subtle',
    md3Token: '--md-sys-color-surface-container',
    appVariable: '--bg-subtle',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Subtle fills consume the regular container role.',
  },
  {
    id: 'color-surface-container-high-muted',
    md3Token: '--md-sys-color-surface-container-high',
    appVariable: '--bg-muted',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Muted panels consume the high container role.',
  },
  {
    id: 'color-surface-container-highest-elevated',
    md3Token: '--md-sys-color-surface-container-highest',
    appVariable: '--bg-elevated',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Elevated surfaces consume the highest container role.',
  },
  {
    id: 'color-on-surface-text',
    md3Token: '--md-sys-color-on-surface',
    appVariable: '--text',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Primary text consumes the M3 on-surface role.',
  },
  {
    id: 'color-on-surface-text-strong',
    md3Token: '--md-sys-color-on-surface',
    appVariable: '--text-strong',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Strong text keeps the same high-contrast M3 role.',
  },
  {
    id: 'color-on-surface-variant-muted',
    md3Token: '--md-sys-color-on-surface-variant',
    appVariable: '--text-muted',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Supporting text consumes the M3 on-surface-variant role.',
  },
  {
    id: 'color-outline-variant-border',
    md3Token: '--md-sys-color-outline-variant',
    appVariable: '--border',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Default outlines consume the M3 outline-variant role.',
  },
  {
    id: 'color-outline-border-strong',
    md3Token: '--md-sys-color-outline',
    appVariable: '--border-strong',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Emphasized outlines consume the M3 outline role.',
  },
  {
    id: 'shape-corner-medium-radius',
    md3Token: '--md-sys-shape-corner-m',
    appVariable: '--radius',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'The standard product radius maps to the M3 medium corner.',
  },
  {
    id: 'shape-corner-large-radius',
    md3Token: '--md-sys-shape-corner-l',
    appVariable: '--radius-lg',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Large cards use the M3 large corner role.',
  },
  {
    id: 'shape-corner-full-pill',
    md3Token: '--md-sys-shape-corner-full',
    appVariable: '--radius-pill',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'Pills and full-round controls consume the M3 full corner role.',
  },
  {
    id: 'elevation-two-shadow-md',
    md3Token: '--md-sys-elevation-2',
    appVariable: '--shadow-md',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'implemented',
    evidence: 'The medium product elevation maps to the M3 level-two shadow pair.',
  },
  {
    id: 'typeface-plain-sans',
    md3Token: '--md-ref-typeface-plain',
    appVariable: '--sans',
    designSourcePath: 'apps/web/src/styles/md3-tokens.css',
    appSourcePath: 'apps/web/src/styles/tokens.css',
    status: 'partial',
    evidence: 'The shipped plain typeface leads the product stack; locale-specific fallback coverage remains a runtime verification item.',
  },
] as const;

export const HANDOFF_COMPONENT_OWNERS: readonly HandoffComponentOwner[] = [
  {
    id: 'entry-shell',
    owner: 'EntryShell',
    sourcePath: 'apps/web/src/components/EntryShell.tsx',
    status: 'partial',
    evidence: 'Owns the entry shell geometry and route-mounted home destinations; installed parity capture is unverified.',
  },
  {
    id: 'entry-nav-rail',
    owner: 'EntryNavRail',
    sourcePath: 'apps/web/src/components/EntryNavRail.tsx',
    status: 'partial',
    evidence: 'Owns persistent entry navigation and accessible destination state; the full ten-screen capture matrix is unverified.',
  },
  {
    id: 'entry-topbar-search',
    owner: 'EntryTopbarSearch',
    sourcePath: 'apps/web/src/components/EntryTopbarSearch.tsx',
    status: 'partial',
    evidence: 'Owns the shell search affordance and palette handoff; built-artifact interaction remains unverified.',
  },
  {
    id: 'workspace-tabs-bar',
    owner: 'WorkspaceTabsBar',
    sourcePath: 'apps/web/src/components/WorkspaceTabsBar.tsx',
    status: 'partial',
    evidence: 'Owns browser-style workspace tabs, persistence and overflow; narrow and high-scale captures remain unverified.',
  },
  {
    id: 'settings-dialog',
    owner: 'SettingsDialog',
    sourcePath: 'apps/web/src/components/SettingsDialog.tsx',
    status: 'partial',
    evidence: 'Owns settings page/modal structure and section routing; appearance and handoff source changes are static-only here.',
  },
  {
    id: 'settings-tab-strip',
    owner: 'SettingsTabStrip',
    sourcePath: 'apps/web/src/components/settings/SettingsTabStrip.tsx',
    status: 'partial',
    evidence: 'Owns settings tab overflow, local search and roving focus; runtime parity remains unverified.',
  },
  {
    id: 'command-palette',
    owner: 'CommandPalette',
    sourcePath: 'apps/web/src/components/command-palette/CommandPalette.tsx',
    status: 'partial',
    evidence: 'Owns rich destination and setting rows; Ctrl+Shift+F interaction evidence is not yet captured.',
  },
  {
    id: 'regex-search-field',
    owner: 'RegexSearchField',
    sourcePath: 'apps/web/src/components/regex/RegexSearchField.tsx',
    status: 'partial',
    evidence: 'Owns one field-specific builder per search bar; handoff adds two independent instances.',
  },
  {
    id: 'appearance-runtime',
    owner: 'AppearanceRuntime',
    sourcePath: 'apps/web/src/components/appearance/AppearanceRuntime.tsx',
    status: 'partial',
    evidence: 'Owns live appearance preference application; the installed build has not been photographed for this lane.',
  },
  {
    id: 'app-status-bar',
    owner: 'AppStatusBar',
    sourcePath: 'apps/web/src/components/AppStatusBar.tsx',
    status: 'partial',
    evidence: 'Owns the persistent 28px status surface; exact tuple parity is unverified.',
  },
  {
    id: 'button-primitive',
    owner: 'Button primitive',
    sourcePath: 'packages/components/src/button.tsx',
    status: 'unverified',
    evidence: 'The shared primitive is the intended control owner; this handoff records no runtime claim.',
  },
  {
    id: 'text-field-primitive',
    owner: 'Text-field primitives',
    sourcePath: 'packages/components/src/form-controls.tsx',
    status: 'unverified',
    evidence: 'The shared text-field seam is the intended field owner; this handoff records no runtime claim.',
  },
] as const;

export const HANDOFF_REGISTRY_SOURCE_PATHS = [
  'apps/web/src/styles/md3-tokens.css',
  'apps/web/src/styles/tokens.css',
] as const;

const TOKEN_KEYS = new Set<string>(HANDOFF_TOKEN_EXPORT_FIELDS);
const COMPONENT_KEYS = new Set<string>(HANDOFF_COMPONENT_EXPORT_FIELDS);

function hasExactKeys(value: object, expected: ReadonlySet<string>): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.size && actual.every((key) => expected.has(key));
}

export function isValidHandoffTokenMapping(value: unknown): value is HandoffTokenMapping {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, TOKEN_KEYS)) return false;
  const row = value as HandoffTokenMapping;
  return typeof row.id === 'string'
    && typeof row.md3Token === 'string'
    && typeof row.appVariable === 'string'
    && typeof row.designSourcePath === 'string'
    && typeof row.appSourcePath === 'string'
    && typeof row.status === 'string'
    && typeof row.evidence === 'string'
    && row.id.length > 0
    && row.md3Token.startsWith('--')
    && row.appVariable.startsWith('--')
    && row.designSourcePath === 'apps/web/src/styles/md3-tokens.css'
    && row.appSourcePath === 'apps/web/src/styles/tokens.css'
    && ['implemented', 'partial', 'unverified'].includes(row.status)
    && row.evidence.length > 0;
}

export function isValidHandoffComponentOwner(value: unknown): value is HandoffComponentOwner {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, COMPONENT_KEYS)) return false;
  const row = value as HandoffComponentOwner;
  return typeof row.id === 'string'
    && typeof row.owner === 'string'
    && typeof row.sourcePath === 'string'
    && typeof row.status === 'string'
    && typeof row.evidence === 'string'
    && row.id.length > 0
    && row.owner.length > 0
    && row.sourcePath.length > 0
    && ['implemented', 'partial', 'unverified'].includes(row.status)
    && row.evidence.length > 0;
}

export function requireHandoffTokenMapping(value: unknown): HandoffTokenMapping {
  if (!isValidHandoffTokenMapping(value)) {
    throw new Error('Projected handoff token row does not match the export schema');
  }
  return value;
}

export function requireHandoffComponentOwner(value: unknown): HandoffComponentOwner {
  if (!isValidHandoffComponentOwner(value)) {
    throw new Error('Projected handoff component row does not match the export schema');
  }
  return value;
}

export function assertHandoffRegistry(): void {
  if (HANDOFF_TOKEN_MAPPINGS.length !== 18 || HANDOFF_COMPONENT_OWNERS.length !== 12) {
    throw new Error('Handoff registry row counts drifted from the documented contract');
  }
  if (new Set(HANDOFF_TOKEN_MAPPINGS.map((row) => row.id)).size !== 18) {
    throw new Error('Handoff token ids are not unique');
  }
  if (new Set(HANDOFF_COMPONENT_OWNERS.map((row) => row.id)).size !== 12) {
    throw new Error('Handoff component ids are not unique');
  }
  if (!HANDOFF_TOKEN_MAPPINGS.every(isValidHandoffTokenMapping)) {
    throw new Error('Handoff token registry schema is invalid');
  }
  if (!HANDOFF_COMPONENT_OWNERS.every(isValidHandoffComponentOwner)) {
    throw new Error('Handoff component registry schema is invalid');
  }
}

export function handoffRegistryIsExact(): boolean {
  return HANDOFF_TOKEN_MAPPINGS.length === 18 && HANDOFF_COMPONENT_OWNERS.length === 12;
}
