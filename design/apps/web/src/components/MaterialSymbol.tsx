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
  'arrow-down-s-line': 'keyboard_arrow_down',
  'arrow-go-back-line': 'undo',
  'arrow-go-forward-line': 'redo',
  'arrow-left-line': 'arrow_back',
  'arrow-up-s-line': 'keyboard_arrow_up',
  'book-open-line': 'menu_book',
  'chat-3-line': 'chat_bubble',
  'chat-new-line': 'add_comment',
  'check-line': 'check',
  'checkbox-blank-line': 'check_box_outline_blank',
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
  'loader-4-line': 'progress_activity',
  'mark-pen-line': 'ink_highlighter',
  'message-3-line': 'chat',
  'more-2-line': 'more_horiz',
  'pages-line': 'article',
  'pencil-line': 'edit',
  'play-line': 'play_arrow',
  'presentation-line': 'co_present',
  'refresh-line': 'refresh',
  'restart-line': 'restart_alt',
  'screenshot-2-line': 'screenshot',
  'search-line': 'search',
  'settings-3-line': 'settings',
  'settings-line': 'settings',
  'share-forward-line': 'share',
  'slideshow-3-line': 'slideshow',
  'smartphone-line': 'smartphone',
  'subtract-line': 'remove',
  'tablet-line': 'tablet',
  text: 'title',
  'upload-cloud-line': 'cloud_upload',
  'zoom-in-line': 'zoom_in',
} as const satisfies Record<string, string>;

export type MaterialSymbolName =
  (typeof MATERIAL_SYMBOL_FOR_REMIX_ICON)[keyof typeof MATERIAL_SYMBOL_FOR_REMIX_ICON];

interface MaterialSymbolProps {
  /** The symbol's ligature name, e.g. `settings`. */
  name: MaterialSymbolName;
  /** Rendered size in px. Drives the box and the font size together. */
  size?: number;
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
    >
      {name}
    </span>
  );
}
