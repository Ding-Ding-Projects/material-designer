// The runtime appearance controls: seed, sizing, and typography.
//
// A separate component rather than more JSX inside `SettingsDialog`, which
// is already nine thousand lines and holds nineteen sections. Everything
// here belongs to the appearance store next door, so it lives next to the
// store, and `AppearanceSection` renders it as one element.
//
// Three things worth knowing before editing:
//
//   * No control here has state of its own. The store is the single value
//     — see `store.ts` for why — so every input reads `preferences` and
//     writes through `update`, which persists and applies in the same call.
//     There is no draft, no Save, and no revert: the whole point of these
//     controls is that the UI changes under the user's hand.
//
//   * The unsupported typography properties are rendered, not hidden.
//     `typography.ts` is the authority on which ones this platform can
//     honour; the ones it cannot keep their control, keep the user's saved
//     value, and say which kind of "no" they are. Hiding them would make
//     the editor look unfinished and make an exported theme lossy.
//
//   * UI scale is applied by the desktop shell, not by CSS. Nothing here
//     needs to know that, but a future contributor tempted to add a `zoom`
//     property to make the preview "work" should read the long note in
//     `state/appearance.ts` first.

import type { CSSProperties } from 'react';

import { Button } from '@open-design/components';

import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import {
  APPEARANCE_DENSITIES,
  APPEARANCE_SEEDS,
  DEFAULT_APPEARANCE_PREFERENCES,
  FONT_STACK_IDS,
  MAX_FONT_SIZE_PX,
  MAX_UI_SCALE,
  MIN_FONT_SIZE_PX,
  MIN_UI_SCALE,
  UI_SCALE_STEP,
  quantizeUiScale,
  type AppearanceSeed,
  type AppearanceTypography,
} from '../../state/appearance';
import { DENSITY_LABEL_KEY, FONT_LABEL_KEY, SEED_LABEL_KEY } from './labels';
import { useAppearancePreferences } from './store';
import {
  TYPEFACE_PREVIEW_SAMPLE,
  TYPOGRAPHY_SUPPORT,
  isFaceAvailable,
  previewStyleFor,
  type TypographyPropertyId,
  type UnsupportedReason,
} from './typography';
import styles from './AppearanceControls.module.css';

/**
 * The `primary` role each seed resolves to in the LIGHT palette, copied
 * from that seed's block in `styles/md3-tokens.css`.
 *
 * The one place in this file that names a colour, and it has to: a swatch
 * offering the violet seed cannot be painted in `--md-sys-color-primary`,
 * because that property already holds whichever seed is active — every
 * swatch would show the same colour and the control would be a row of
 * identical circles. This is palette data, which the design rules exempt
 * from the roles-only requirement for exactly this reason.
 *
 * The light value is used in both themes deliberately: it is the swatch's
 * identity, and the four dark tones are close enough to each other in
 * lightness that they read as one colour on a dark surface.
 */
const SEED_SWATCH: Record<AppearanceSeed, string> = {
  sunset: '#8F4C34',
  violet: '#65558F',
  teal: '#00696D',
  lime: '#4C6700',
};

/* The seed, density and font-stack label maps moved to `./labels.ts` when the
   command palette started rendering these same choices as live rows: one map
   read by both surfaces cannot drift the way two copies of it can. */

const UNSUPPORTED_REASON_KEY: Record<UnsupportedReason, keyof Dict> = {
  'no-variable-font': 'appearance.unsupportedNoVariableFont',
  'cjk-unsafe': 'appearance.unsupportedCjkUnsafe',
  'contrast-unsafe': 'appearance.unsupportedContrastUnsafe',
};

const TYPOGRAPHY_LABEL_KEY: Record<TypographyPropertyId, keyof Dict> = {
  fontStackId: 'appearance.fontFamily',
  fontSizePx: 'appearance.fontSize',
  fontWeight: 'appearance.fontWeight',
  lineHeight: 'appearance.lineHeight',
  letterSpacingEm: 'appearance.letterSpacing',
  opticalSize: 'appearance.opticalSize',
  grade: 'appearance.grade',
  smallCaps: 'appearance.smallCaps',
  glow: 'appearance.glow',
};

export function AppearanceControls() {
  const t = useT();
  const { preferences, update } = useAppearancePreferences();
  const typography = preferences.typography;

  const setTypography = (patch: Partial<AppearanceTypography>) => {
    update({ typography: { ...typography, ...patch } });
  };

  const scalePercent = Math.round(preferences.uiScale * 100);

  return (
    <div className={styles.cards}>
      {/* ---- Seed ---------------------------------------------------- */}
      <section className={styles.card} data-od-setting="appearance.seed">
        <h4 className={styles.cardTitle}>{t('appearance.seedLabel')}</h4>
        <p className={styles.cardHint}>{t('appearance.seedHint')}</p>
        <div className={styles.swatches} role="radiogroup" aria-label={t('appearance.seedLabel')}>
          {APPEARANCE_SEEDS.map((seed) => {
            const active = preferences.seed === seed;
            return (
              <button
                key={seed}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(SEED_LABEL_KEY[seed])}
                className={styles.swatch}
                style={{ background: SEED_SWATCH[seed] }}
                onClick={() => update({ seed })}
                data-testid={`appearance-seed-${seed}`}
              />
            );
          })}
        </div>
      </section>

      {/* ---- Sizing -------------------------------------------------- */}
      <section className={styles.card} data-od-setting="appearance.sizing">
        <h4 className={styles.cardTitle}>{t('appearance.sizing')}</h4>
        <p className={styles.cardHint}>{t('appearance.sizingHint')}</p>

        <div className={styles.row} data-od-setting="appearance.uiScale">
          <span className={styles.rowLabel} id="od-appearance-scale-label">
            {t('appearance.uiScaleLabel')}
          </span>
          <span className={styles.rowControl}>
            <input
              type="range"
              className={styles.slider}
              // Percent rather than the stored factor: an integer range
              // avoids the floating-point step the factor would need, and
              // it is the unit the readout and the status bar both use.
              min={Math.round(MIN_UI_SCALE * 100)}
              max={Math.round(MAX_UI_SCALE * 100)}
              step={Math.round(UI_SCALE_STEP * 100)}
              value={scalePercent}
              // Read-only rather than removed while auto-fit is on: the
              // thumb is still the truthful readout of the current scale,
              // and hiding it would make the switch look like it deleted
              // the control it is driving.
              disabled={preferences.autoFit}
              aria-labelledby="od-appearance-scale-label"
              aria-valuetext={`${scalePercent}%`}
              onChange={(event) =>
                update({ uiScale: quantizeUiScale(Number(event.target.value) / 100) })
              }
              data-testid="appearance-ui-scale"
            />
            <span className={styles.readout}>{`${scalePercent}%`}</span>
          </span>
        </div>

        <div className={styles.row} data-od-setting="appearance.density">
          <span className={styles.rowLabel}>{t('appearance.densityLabel')}</span>
          <span
            className="seg-control"
            role="radiogroup"
            aria-label={t('appearance.densityLabel')}
            style={{ '--seg-cols': APPEARANCE_DENSITIES.length } as CSSProperties}
          >
            {APPEARANCE_DENSITIES.map((density) => {
              const active = preferences.density === density;
              return (
                <button
                  key={density}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={'seg-btn' + (active ? ' active' : '')}
                  onClick={() => update({ density })}
                  data-testid={`appearance-density-${density}`}
                >
                  <span className="seg-title">{t(DENSITY_LABEL_KEY[density])}</span>
                </button>
              );
            })}
          </span>
        </div>

        <label className={styles.switchRow} data-od-setting="appearance.autoFit">
          <input
            type="checkbox"
            role="switch"
            className={styles.switchInput}
            checked={preferences.autoFit}
            onChange={(event) => update({ autoFit: event.target.checked })}
            data-testid="appearance-auto-fit"
          />
          <span className={styles.switchLabel}>{t('appearance.autoFit')}</span>
        </label>
        <p className={styles.note}>{t('appearance.autoFitHint')}</p>
      </section>

      {/* ---- Typography ---------------------------------------------- */}
      <section className={styles.card} data-od-setting="appearance.typography">
        <h4 className={styles.cardTitle}>{t('appearance.typography')}</h4>
        <p className={styles.cardHint}>{t('appearance.typographyHint')}</p>

        <div
          className={styles.faces}
          role="radiogroup"
          aria-label={t('appearance.fontFamily')}
          data-od-setting="appearance.fontFamily"
        >
          {FONT_STACK_IDS.map((id) => {
            const active = typography.fontStackId === id;
            const available = isFaceAvailable(id);
            const statusKey: keyof Dict =
              available === true
                ? 'appearance.fontInstalled'
                : available === false
                  ? 'appearance.fontNotInstalled'
                  : 'appearance.fontUnknown';
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={styles.face}
                onClick={() => setTypography({ fontStackId: id })}
                data-testid={`appearance-font-${id}`}
              >
                <span className={styles.faceName}>{t(FONT_LABEL_KEY[id])}</span>
                {/* Rendered in the stack being offered, and carrying both
                    Latin and CJK, so the CJK tail every stack ends in is
                    visible in the list rather than promised in prose. */}
                <span className={styles.faceSample} style={previewStyleFor(id)}>
                  {TYPEFACE_PREVIEW_SAMPLE}
                </span>
                <span className={styles.faceStatus}>{t(statusKey)}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.row} data-od-setting="appearance.fontSize">
          <span className={styles.rowLabel} id="od-appearance-size-label">
            {t('appearance.fontSize')}
          </span>
          <span className={styles.rowControl}>
            <input
              type="range"
              className={styles.slider}
              min={MIN_FONT_SIZE_PX}
              max={MAX_FONT_SIZE_PX}
              step={0.5}
              value={typography.fontSizePx}
              aria-labelledby="od-appearance-size-label"
              aria-valuetext={`${typography.fontSizePx}px`}
              onChange={(event) => setTypography({ fontSizePx: Number(event.target.value) })}
              data-testid="appearance-font-size"
            />
            <span className={styles.readout}>{`${typography.fontSizePx}px`}</span>
          </span>
        </div>

        <div className={styles.row} data-od-setting="appearance.fontWeight">
          <span className={styles.rowLabel} id="od-appearance-weight-label">
            {t('appearance.fontWeight')}
          </span>
          <span className={styles.rowControl}>
            <input
              type="range"
              className={styles.slider}
              min={100}
              max={900}
              step={100}
              value={typography.fontWeight}
              aria-labelledby="od-appearance-weight-label"
              onChange={(event) => setTypography({ fontWeight: Number(event.target.value) })}
              data-testid="appearance-font-weight"
            />
            <span className={styles.readout}>{typography.fontWeight}</span>
          </span>
        </div>

        <div className={styles.row} data-od-setting="appearance.lineHeight">
          <span className={styles.rowLabel} id="od-appearance-line-label">
            {t('appearance.lineHeight')}
          </span>
          <span className={styles.rowControl}>
            <input
              type="range"
              className={styles.slider}
              min={1}
              max={2.4}
              step={0.05}
              value={typography.lineHeight}
              aria-labelledby="od-appearance-line-label"
              onChange={(event) => setTypography({ lineHeight: Number(event.target.value) })}
              data-testid="appearance-line-height"
            />
            <span className={styles.readout}>{typography.lineHeight}</span>
          </span>
        </div>

        <div className={styles.row} data-od-setting="appearance.letterSpacing">
          <span className={styles.rowLabel} id="od-appearance-tracking-label">
            {t('appearance.letterSpacing')}
          </span>
          <span className={styles.rowControl}>
            <input
              type="range"
              className={styles.slider}
              min={-0.05}
              max={0.2}
              step={0.005}
              value={typography.letterSpacingEm}
              aria-labelledby="od-appearance-tracking-label"
              onChange={(event) => setTypography({ letterSpacingEm: Number(event.target.value) })}
              data-testid="appearance-letter-spacing"
            />
            <span className={styles.readout}>{`${typography.letterSpacingEm}em`}</span>
          </span>
        </div>

        {/* Kept, explained, and still saved — see the file header. */}
        <div className={styles.unsupported}>
          <div className={styles.row} data-od-setting="appearance.opticalSize">
            <span className={styles.rowLabel} id="od-appearance-opsz-label">
              {t(TYPOGRAPHY_LABEL_KEY.opticalSize)}
            </span>
            <span className={styles.rowControl}>
              <input
                type="range"
                className={styles.slider}
                min={8}
                max={144}
                step={1}
                value={typography.opticalSize}
                aria-labelledby="od-appearance-opsz-label"
                onChange={(event) => setTypography({ opticalSize: Number(event.target.value) })}
                data-testid="appearance-optical-size"
              />
              <span className={styles.readout}>{typography.opticalSize}</span>
            </span>
            <span className={styles.badge}>{t('appearance.unsupportedBadge')}</span>
            <p className={styles.reason}>
              {t(UNSUPPORTED_REASON_KEY[TYPOGRAPHY_SUPPORT.opticalSize.reason ?? 'no-variable-font'])}
            </p>
          </div>

          <div className={styles.row} data-od-setting="appearance.grade">
            <span className={styles.rowLabel} id="od-appearance-grade-label">
              {t(TYPOGRAPHY_LABEL_KEY.grade)}
            </span>
            <span className={styles.rowControl}>
              <input
                type="range"
                className={styles.slider}
                min={-200}
                max={150}
                step={5}
                value={typography.grade}
                aria-labelledby="od-appearance-grade-label"
                onChange={(event) => setTypography({ grade: Number(event.target.value) })}
                data-testid="appearance-grade"
              />
              <span className={styles.readout}>{typography.grade}</span>
            </span>
            <span className={styles.badge}>{t('appearance.unsupportedBadge')}</span>
            <p className={styles.reason}>
              {t(UNSUPPORTED_REASON_KEY[TYPOGRAPHY_SUPPORT.grade.reason ?? 'no-variable-font'])}
            </p>
          </div>

          <label className={styles.switchRow} data-od-setting="appearance.smallCaps">
            <input
              type="checkbox"
              className={styles.switchInput}
              checked={typography.smallCaps}
              onChange={(event) => setTypography({ smallCaps: event.target.checked })}
              data-testid="appearance-small-caps"
            />
            <span className={styles.switchLabel}>{t(TYPOGRAPHY_LABEL_KEY.smallCaps)}</span>
            <span className={styles.badge}>{t('appearance.unsupportedBadge')}</span>
            <span className={styles.reason}>
              {t(UNSUPPORTED_REASON_KEY[TYPOGRAPHY_SUPPORT.smallCaps.reason ?? 'cjk-unsafe'])}
            </span>
          </label>

          <label className={styles.switchRow} data-od-setting="appearance.glow">
            <input
              type="checkbox"
              className={styles.switchInput}
              checked={typography.glow}
              onChange={(event) => setTypography({ glow: event.target.checked })}
              data-testid="appearance-glow"
            />
            <span className={styles.switchLabel}>{t(TYPOGRAPHY_LABEL_KEY.glow)}</span>
            <span className={styles.badge}>{t('appearance.unsupportedBadge')}</span>
            <span className={styles.reason}>
              {t(UNSUPPORTED_REASON_KEY[TYPOGRAPHY_SUPPORT.glow.reason ?? 'contrast-unsafe'])}
            </span>
          </label>
        </div>
      </section>

      <div className={styles.footer}>
        <Button
          variant="ghost"
          onClick={() => update(DEFAULT_APPEARANCE_PREFERENCES)}
          data-testid="appearance-reset"
        >
          {t('appearance.reset')}
        </Button>
      </div>
    </div>
  );
}
