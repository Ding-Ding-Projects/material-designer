import type { SVGProps } from 'react';

import { MATERIAL_SYMBOL_FOR_ICON_NAME, MaterialSymbol, type MaterialSymbolName } from './MaterialSymbol';
import { REMIX_ICON_PATHS } from './remix-icon-paths';

export type IconName =
  | 'alert-triangle'
  | 'arrow-left'
  | 'arrow-up'
  | 'artboard'
  | 'attach'
  | 'bar-chart-box'
  | 'bell'
  | 'blocks'
  | 'brain'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'crop'
  | 'comment'
  | 'dashboard'
  | 'discord'
  | 'download'
  | 'draw'
  | 'edit'
  | 'external-link'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'file-code'
  | 'file-text'
  | 'folder'
  | 'folder-filled'
  | 'fork'
  | 'github'
  | 'github-filled'
  | 'grip-vertical'
  | 'grid'
  | 'globe'
  | 'hammer'
  | 'help-circle'
  | 'history'
  | 'home'
  | 'home-filled'
  | 'image'
  | 'import'
  | 'info'
  | 'kanban'
  | 'key'
  | 'layers-filled'
  | 'languages'
  | 'layout'
  | 'lightbulb'
  | 'arrow-right'
  | 'link'
  | 'lock'
  | 'mail'
  | 'log-in'
  | 'log-out'
  | 'integrations-filled'
  | 'maximize'
  | 'mic'
  | 'minimize'
  | 'minus'
  | 'more-horizontal'
  | 'more-vertical'
  | 'orbit'
  | 'paint-bucket'
  | 'panel-left'
  | 'palette'
  | 'palette-filled'
  | 'pencil'
  | 'plus'
  | 'plus-filled'
  | 'puzzle'
  | 'slides'
  | 'star'
  | 'swatchbook'
  | 'play'
  | 'present'
  | 'refresh'
  | 'reload'
  | 'robot'
  | 'search'
  | 'send'
  | 'settings'
  | 'share'
  | 'sliders'
  | 'smartphone'
  | 'spinner'
  | 'sparkles'
  | 'stop'
  | 'sun'
  | 'moon'
  | 'sun-moon'
  | 'terminal'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'translate'
  | 'tweaks'
  | 'undo'
  | 'redo'
  | 'upload'
  | 'users'
  | 'trash'
  | 'video-ai'
  | 'volume'
  | 'zoom-in'
  | 'zoom-out';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

/**
 * The three names Material Symbols cannot draw. The family carries no brand
 * logo at all, and drawing one is a trademark problem rather than an icon
 * problem, so these stay on the inlined Remix path data (`remix-icon-paths.ts`)
 * until licensed brand artwork exists.
 */
type BrandIconName = 'discord' | 'github' | 'github-filled';
const BRAND_MARK: Record<BrandIconName, string> = {
  discord: 'discord-line',
  github: 'github-line',
  'github-filled': 'github-fill',
};

function isBrandMark(name: IconName): name is BrandIconName {
  return name in BRAND_MARK;
}

/**
 * Names that are the filled state of another name. M3 fills the selected item
 * in a navigation set and outlines the rest; the FILL axis of the variable
 * font does that, so these share a glyph with their outlined twin.
 */
const FILLED: ReadonlySet<IconName> = new Set<IconName>([
  'folder-filled',
  'home-filled',
  'layers-filled',
  'integrations-filled',
  'palette-filled',
  'plus-filled',
]);

// Compile-time proof that the table covers every non-brand name: a name added
// to `IconName` without a symbol chosen for it fails here, not on screen.
const SYMBOL_FOR: Record<Exclude<IconName, BrandIconName>, MaterialSymbolName> =
  MATERIAL_SYMBOL_FOR_ICON_NAME;

/**
 * The application's icon, drawn from the bundled Material Symbols Rounded face
 * by ligature name (see `MaterialSymbol.tsx`), with the three brand marks
 * still inlined as SVG. The `IconName` union is the stable contract every
 * call site is written against; the glyph behind a name is decided here.
 *
 * `strokeWidth` and other SVG-only props are accepted for compatibility and
 * ignored for a font glyph; `className`, `style` and `aria-hidden` carry over.
 */
export function Icon({ name, size = 14, strokeWidth: _strokeWidth, ...rest }: Props) {
  const { className, style, ...restProps } = rest;
  if (isBrandMark(name)) {
    const path = REMIX_ICON_PATHS[BRAND_MARK[name]];
    if (path) {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          focusable="false"
          className={`od-icon${className ? ` ${className}` : ''}`}
          style={style}
          {...restProps}
        >
          <path d={path} />
        </svg>
      );
    }
    return null;
  }
  return (
    <MaterialSymbol
      name={SYMBOL_FOR[name]}
      size={size}
      filled={FILLED.has(name)}
      className={`od-icon${name === 'spinner' ? ' icon-spin' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}
