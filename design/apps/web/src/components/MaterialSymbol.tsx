import type { CSSProperties } from 'react';

import styles from './MaterialSymbol.module.css';

/**
 * A glyph from the bundled Material Symbols Rounded variable icon font.
 *
 * The face is declared in `styles/material-symbols.css` and served from
 * `public/fonts/material-symbols/`. Nothing here reaches the network.
 *
 * The API deliberately mirrors {@link ./RemixIcon.tsx}'s, because every call
 * site that moved to this component moved by swapping the element name and the
 * icon name and nothing else — the box, the default size and the
 * `aria-hidden` default are all the same, so no layout depended on the swap.
 */

/**
 * Every icon name this component may be asked for, mapped from the name the
 * incumbent icon font used.
 *
 * It exists so the migration is checkable rather than trusted. A Material
 * Symbol is addressed by the *ligature* of its name, which means a name the
 * font does not carry does not fall back to a blank or a box — it renders the
 * name itself as literal English text, so `keyboard_arrow_dwon` would put the
 * word "keyboard_arrow_dwon" in the toolbar. Every value below was checked
 * against the official codepoints list published with the font
 * (google/material-design-icons, `variablefont/*.codepoints`, 4,268 names),
 * and a test pins that same check so a later addition cannot skip it.
 *
 * It covers the 52 non-brand names. The other nine the incumbent font served
 * are brand marks — X, LinkedIn, Facebook, Reddit, Telegram, WhatsApp, Weibo,
 * LINE, Instagram — and Material Symbols carries no brand logo at all, so
 * `SocialShareGrid.tsx` stays on the old font until licensed brand artwork
 * exists. `book-open-line` is here because it has a clean equivalent, even
 * though its one call site sits inside that same brand table.
 */
export const MATERIAL_SYMBOL_FOR_REMIX_ICON = {
  'account-circle-line': 'account_circle',
  'arrow-down-s-line': 'keyboard_arrow_down',
  'arrow-go-back-line': 'undo',
  'arrow-go-forward-line': 'redo',
  'arrow-left-line': 'arrow_back',
  'arrow-up-s-line': 'keyboard_arrow_up',
  'battery-charge-line': 'battery_charging_full',
  'book-open-line': 'menu_book',
  'camera-line': 'photo_camera',
  'chat-3-line': 'chat_bubble',
  'chat-new-line': 'add_comment',
  'check-line': 'check',
  'checkbox-blank-line': 'check_box_outline_blank',
  'checkbox-line': 'check_box',
  'checkbox-multiple-blank-line': 'filter_none',
  'close-line': 'close',
  'code-s-slash-line': 'code',
  'computer-line': 'computer',
  'download-line': 'download',
  'edit-line': 'edit',
  'external-link-line': 'open_in_new',
  'eye-line': 'visibility',
  'file-code-line': 'code_blocks',
  'file-copy-line': 'content_copy',
  'file-line': 'description',
  'file-ppt-line': 'slideshow',
  'file-zip-line': 'folder_zip',
  'git-branch-line': 'account_tree',
  'history-line': 'history',
  'image-add-line': 'add_photo_alternate',
  'image-line': 'image',
  'input-field': 'text_fields',
  link: 'link',
  'list-check-2': 'checklist',
  'lock-line': 'lock',
  'loader-4-line': 'progress_activity',
  'mark-pen-line': 'ink_highlighter',
  'message-3-line': 'chat',
  'more-2-line': 'more_horiz',
  'pages-line': 'article',
  'pencil-line': 'edit',
  'play-line': 'play_arrow',
  'presentation-line': 'co_present',
  'question-line': 'help',
  'refresh-line': 'refresh',
  'restart-line': 'restart_alt',
  'screenshot-2-line': 'screenshot',
  'search-line': 'search',
  'settings-3-line': 'settings',
  'settings-line': 'settings',
  'share-forward-line': 'share',
  'slideshow-3-line': 'slideshow',
  // `mobile` and `smartphone` are ALIASES for one glyph here, so either name
  // renders the same icon. Kept as `mobile` because that is what shipped; the
  // choice is arbitrary, not a workaround.
  //
  // Correcting an earlier note in this spot, because it would mislead the next
  // person into avoiding valid names: the bundled face DOES carry `smartphone`.
  // Its GSUB ligature table holds **4,268 names** — the same 4,268 the
  // published codepoints list has — resolving to **3,967 distinct target
  // glyphs**, the gap being aliases exactly like this pair. "3,967" is a count
  // of glyphs, not of addressable names, and reading it as the latter is what
  // made `smartphone` look absent.
  //
  // Verified by decompressing the shipped woff2 and walking cmap + GSUB: both
  // `smartphone` and `mobile` are ligatures targeting glyph 2239, and that is
  // the same glyph the cmap gives for each name's published codepoint. All 49
  // names this table renders were re-checked the same way, and all 49 pass.
  // The method is written up in `docs/standards/typography-and-icons.md` so it
  // can be re-run rather than re-argued.
  //
  // One consequence worth carrying forward: whatever put the literal word
  // "smartphone" on screen, it was NOT a missing ligature. The likelier causes
  // are a context where `liga` is off, or a reader taking `element.textContent`
  // — which for a Material Symbol is always the ligature name, and is why this
  // component publishes `data-symbol` and an `aria-label` to read instead.
  'smartphone-line': 'mobile',
  'subtract-line': 'remove',
  'tablet-line': 'tablet',
  text: 'title',
  'time-line': 'schedule',
  'team-line': 'group',
  'upload-cloud-2-line': 'cloud_upload',
  'upload-cloud-line': 'cloud_upload',
  'zoom-in-line': 'zoom_in',
} as const satisfies Record<string, string>;

/**
 * The second table: every name in `Icon.tsx`'s `IconName` union except the
 * three brand marks, mapped to the Material Symbol that `Icon` now renders.
 *
 * `Icon` used to inline Remix path data (and a hand-drawn stroke set) so that
 * packaged `od://` documents, which cannot load `url()` fonts, still had
 * icons. The application shell is not an `od://` document — it serves the
 * bundled face from `public/fonts/` like every other asset — so its 850-odd
 * `<Icon>` call sites can move to the same glyphs the mockup draws by changing
 * this one module and zero call sites, exactly as
 * `docs/standards/typography-and-icons.md` set out.
 *
 * Every value here was checked against the GSUB ligature table of the woff2
 * actually on disk, not typed from memory; the check is pinned by
 * `tests/styles/material-symbols-ligatures.test.ts`, which walks the font
 * and refuses a name it cannot address. Where two `IconName`s are the same
 * idea at two fills (`home` / `home-filled`) they share a glyph and `Icon`
 * drives the FILL axis instead.
 */
export const MATERIAL_SYMBOL_FOR_ICON_NAME = {
  'alert-triangle': 'warning',
  'arrow-left': 'arrow_back',
  'arrow-up': 'arrow_upward',
  'arrow-right': 'arrow_forward',
  artboard: 'crop_free',
  attach: 'attach_file',
  'bar-chart-box': 'bar_chart',
  bell: 'notifications',
  blocks: 'apps',
  brain: 'psychology',
  check: 'check',
  'chevron-down': 'keyboard_arrow_down',
  'chevron-left': 'keyboard_arrow_left',
  'chevron-right': 'keyboard_arrow_right',
  close: 'close',
  copy: 'content_copy',
  crop: 'crop',
  comment: 'chat_bubble',
  dashboard: 'dashboard',
  download: 'download',
  draw: 'brush',
  edit: 'edit',
  'external-link': 'open_in_new',
  eye: 'visibility',
  'eye-off': 'visibility_off',
  file: 'description',
  'file-code': 'code_blocks',
  'file-text': 'article',
  folder: 'folder',
  'folder-filled': 'folder',
  fork: 'account_tree',
  'grip-vertical': 'drag_indicator',
  grid: 'grid_view',
  globe: 'public',
  hammer: 'hardware',
  'help-circle': 'help',
  history: 'history',
  home: 'home',
  'home-filled': 'home',
  image: 'image',
  import: 'upload',
  info: 'info',
  kanban: 'view_kanban',
  key: 'key',
  'layers-filled': 'layers',
  languages: 'translate',
  layout: 'space_dashboard',
  lightbulb: 'lightbulb',
  link: 'link',
  lock: 'lock',
  mail: 'mail',
  'log-in': 'login',
  'log-out': 'logout',
  'integrations-filled': 'hub',
  maximize: 'fullscreen',
  mic: 'mic',
  minimize: 'fullscreen_exit',
  minus: 'remove',
  'more-horizontal': 'more_horiz',
  orbit: 'orbit',
  'paint-bucket': 'format_color_fill',
  'panel-left': 'left_panel_open',
  palette: 'palette',
  'palette-filled': 'palette',
  pencil: 'edit',
  plus: 'add',
  'plus-filled': 'add_circle',
  puzzle: 'extension',
  slides: 'slideshow',
  star: 'star',
  swatchbook: 'style',
  play: 'play_arrow',
  present: 'co_present',
  refresh: 'refresh',
  reload: 'restart_alt',
  robot: 'smart_toy',
  search: 'search',
  send: 'send',
  settings: 'settings',
  share: 'share',
  sliders: 'tune',
  smartphone: 'smartphone',
  spinner: 'progress_activity',
  sparkles: 'auto_awesome',
  stop: 'stop',
  sun: 'light_mode',
  moon: 'dark_mode',
  'sun-moon': 'routine',
  terminal: 'terminal',
  'thumbs-down': 'thumb_down',
  'thumbs-up': 'thumb_up',
  translate: 'translate',
  tweaks: 'instant_mix',
  undo: 'undo',
  redo: 'redo',
  upload: 'upload',
  users: 'group',
  trash: 'delete',
  'video-ai': 'smart_display',
  volume: 'volume_up',
  'zoom-in': 'zoom_in',
  'zoom-out': 'zoom_out',
} as const satisfies Record<string, string>;

export type MaterialSymbolName =
  | (typeof MATERIAL_SYMBOL_FOR_REMIX_ICON)[keyof typeof MATERIAL_SYMBOL_FOR_REMIX_ICON]
  | (typeof MATERIAL_SYMBOL_FOR_ICON_NAME)[keyof typeof MATERIAL_SYMBOL_FOR_ICON_NAME];

interface MaterialSymbolProps {
  /** The symbol's ligature name, e.g. `settings`. */
  name: MaterialSymbolName;
  /** Rendered size in px (or any CSS length). Drives the box and the font size together. */
  size?: number | string;
  /**
   * Drives the font's `FILL` axis. M3 fills the selected item in a navigation
   * set and outlines the rest; this is the axis that does it.
   */
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * An accessible name. Icons are decorative by default — the label beside
   * them carries the meaning — so this is only for the icon-only controls
   * where nothing else names the action.
   */
  label?: string;
}

export function MaterialSymbol({
  name,
  size = 14,
  filled = false,
  className,
  style,
  label,
}: MaterialSymbolProps) {
  return (
    <span
      className={className ? `${styles.symbol} ${className}` : styles.symbol}
      // The glyph's identity as a stable attribute. The incumbent icon element
      // carried its name in a class (`ri-close-line`), which is what every
      // test and every devtools session reached for; a CSS Module class is
      // hashed and the text content is a ligature, so neither is a handle
      // worth keeping. This is.
      // The glyph is drawn by the stylesheet from this attribute
      // (`::before { content: attr(data-symbol) }`), so the ligature name
      // never becomes DOM text: `textContent`, clipboard copies and any code
      // that reads a label out of a button see the words, not `close`.
      data-symbol={name}
      data-filled={filled ? 'true' : 'false'}
      // A named glyph is an image with a text alternative; an unnamed one is
      // decoration and must stay out of the accessibility tree entirely.
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        fontSize: size,
        width: size,
        height: size,
        ...style,
      }}
    />
  );
}
