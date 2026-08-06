// The header search field.
//
// The last piece of structural chrome in `mockups/open-design-m3`: a pill in
// the entry topbar, a leading search glyph, the placeholder "Search projects,
// plugins, design systems…", the regex affordance, and a `Ctrl+Shift+F` hint.
//
// == What it searches, and why it is not a fourth search ==
//
// The three collections the placeholder names each already own a search field
// with this same builder anchored beside it — `PluginsView`, the design-system
// surfaces, the project pickers. And the command palette already answers the
// question one level up: its `go` scope carries Projects, Plugins, Design
// Systems, Integrations and the Marketplace, its `settings` scope carries every
// setting in the product, and its `files` scope is the quick switcher. A header
// field that built its own result list over those three collections would be
// the fourth implementation of a search this app has already written three
// times, sitting twelve pixels from a shortcut that searches strictly more.
//
// So this field is the palette's typeable entry point, not a rival to it. It
// carries its own query, its own mode, its own flags and its own anchored
// builder — never shared with another field, exactly as `useRegexSearch`
// requires — and hands all of that to the palette when it opens. The pattern is
// not decorative: the palette filters its rows with it and says on screen that
// it is doing so.
//
// The mockup draws the field and a separate `Ctrl+Shift+F` button side by side. They
// are one control here because they lead to the same place, and because two
// global searches a finger's width apart is a worse answer than one; the chip
// keeps the shortcut visible where the mockup put it.

import { useState } from 'react';

import { useT } from '../i18n';
import { isMacPlatform } from '../utils/platform';
import { Icon } from './Icon';
import { requestCommandPalette } from './command-palette/open';
import { RegexSearchField } from './regex/RegexSearchField';
import { useRegexSearch } from './regex/useRegexSearch';
import { ariaKeyShortcuts, formatShortcut } from './shortcuts/registry';
import styles from './EntryTopbarSearch.module.css';

/**
 * What the shortcut chip says. The modifier is the platform's, because a chip
 * that renders the Windows/Linux modifier on a Mac trains the user to press a
 * key that does nothing — the palette's own handler reads `Meta` there.
 */
export function paletteShortcutLabel(mac: boolean): string {
  return formatShortcut('commandPalette.open', { mac });
}

/** The same shortcut in the notation `aria-keyshortcuts` is defined in. */
export function paletteShortcutAria(mac: boolean): string {
  return ariaKeyShortcuts('commandPalette.open', { mac });
}

export function EntryTopbarSearch() {
  const t = useT();
  // This field's own text. The controller is created here and handed to
  // `RegexSearchField`, so the builder that opens beside this pill is bound to
  // this query, this pattern, these flags and this mode — and to nothing else.
  const [query, setQuery] = useState('');
  const search = useRegexSearch(query, setQuery);

  const mac = isMacPlatform();
  const shortcut = paletteShortcutLabel(mac);

  const openPalette = () => {
    const pattern = search.query.trim();
    requestCommandPalette({
      query: search.query,
      // Only a regex the user actually switched on travels. An empty pattern
      // in regex mode matches every row, which would open the palette on a
      // list that looks unfiltered and is not.
      regex:
        search.mode === 'regex' && pattern
          ? { source: search.query, flags: search.flags }
          : null,
    });
  };

  return (
    // `role="search"` makes the field a landmark, so a screen-reader user can
    // jump straight to it the way they jump to the navigation rail — which is
    // what "chrome" means for anyone not using a mouse. The landmark and the
    // input share one name deliberately: two different ones would have the
    // reader announce the field twice under two descriptions.
    <div
      className={styles.field}
      role="search"
      aria-label={t('entrySearch.aria')}
      data-testid="entry-topbar-search"
    >
      <Icon name="search" size={18} className={styles.icon} aria-hidden />
      <RegexSearchField
        search={search}
        fieldLabel={t('entrySearch.fieldLabel')}
        ariaLabel={t('entrySearch.aria')}
        placeholder={t('entrySearch.placeholder')}
        className={styles.input}
        hostClassName={styles.host}
        toggleClassName={styles.toggleShape}
        testId="entry-topbar-search-field"
        onKeyDown={(event) => {
          // Enter submits, ArrowDown reaches for the list — the two things a
          // keyboard user tries in a search box that has no results under it.
          // Both open the palette on this query rather than doing nothing,
          // which is the failure mode of a field that only decorates.
          //
          // The builder popover moves focus into itself when it opens, so a
          // pattern being typed in there never reaches this handler.
          if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          openPalette();
        }}
      />
      <button
        type="button"
        className={styles.shortcut}
        onClick={openPalette}
        aria-label={t('entrySearch.paletteAria')}
        aria-keyshortcuts={paletteShortcutAria(mac)}
        title={t('entrySearch.paletteAria')}
        data-testid="entry-topbar-search-palette"
      >
        <kbd className={styles.kbd}>{shortcut}</kbd>
      </button>
    </div>
  );
}
