// One launch in ten, a dish says hello.
//
// The whole feature is a single non-blocking toast: a photograph, the dish's
// name in both languages, and a line of copy the funny-level sliders style.
// It cannot be turned off, which is exactly why it is so carefully bounded —
// it never gates startup, never takes focus, never delays the app becoming
// usable, and never lands on a first run, an error path, or an update.
//
// `eligible` is that boundary, owned by App: it is false while the daemon
// config is still hydrating, while onboarding or the privacy disclosure is on
// screen, and while any app-level error toast is up. This component adds the
// one condition App cannot see — an update in flight — and then waits for the
// app to settle before spending the launch's single draw.
//
// The draw itself, the dish's name and its alt text live in
// `lib/dim-sum/surprise.ts`, which is where they are tested.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

import { Toast } from './Toast';
import { useI18n } from '../i18n';
import { subscribeToUpdaterStatus } from '../lib/updater';
import {
  dimSumAltText,
  dimSumDishName,
  dimSumDrawSpent,
  drawDimSumOncePerLaunch,
} from '../lib/dim-sum/surprise';
import type { DimSumDish } from '../lib/dim-sum/catalog';
import styles from './DimSumSurprise.module.css';

// The draw waits this long after the app first becomes eligible. Not a delay
// to startup — the app is already interactive when this timer starts — but a
// pause long enough that a dish never appears in the same beat as the first
// paint, and long enough for a pending updater status to arrive and cancel it.
const SETTLE_MS = 1600;

// A little longer than a confirmation toast: there is a picture and two names
// to read, and the toast is the only place the dish is ever shown.
const VISIBLE_MS = 7000;

// Every updater state except these means an update is being checked for,
// fetched, or applied. A dish during any of that is an interruption, so the
// launch's draw is simply never taken.
const QUIET_UPDATER_STATES = new Set<string>(['idle', 'not-available', 'unsupported']);

export function DimSumSurprise({ eligible }: { eligible: boolean }) {
  const { locale, languageMode, t } = useI18n();
  const [dish, setDish] = useState<DimSumDish | null>(null);
  const [updateInFlight, setUpdateInFlight] = useState(false);
  // Holds the settle timer so a change of eligibility mid-countdown cancels it
  // rather than firing a draw the app is no longer ready for.
  const settleRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeToUpdaterStatus((status: OpenDesignHostUpdaterStatusSnapshot) => {
      setUpdateInFlight(!QUIET_UPDATER_STATES.has(status.state));
    });
  }, []);

  useEffect(() => {
    // `dimSumDrawSpent()` is the launch-wide guard: once the draw has been
    // taken — by this mount, an earlier one, or React's development
    // double-invoke — no later eligibility change re-rolls it.
    if (!eligible || updateInFlight || dish != null || dimSumDrawSpent()) return;
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      const drawn = drawDimSumOncePerLaunch();
      if (drawn != null) setDish(drawn);
    }, SETTLE_MS);
    return () => {
      if (settleRef.current != null) {
        window.clearTimeout(settleRef.current);
        settleRef.current = null;
      }
    };
  }, [dish, eligible, updateInFlight]);

  const media = useMemo(() => {
    if (dish == null) return null;
    return (
      <img
        alt={dimSumAltText(dish, locale, languageMode)}
        className={styles.photo}
        data-testid="dim-sum-photo"
        // The photograph is decoration around a name the toast also states in
        // text, so it must never hold up the paint of anything else.
        decoding="async"
        loading="lazy"
        src={dish.image}
      />
    );
  }, [dish, languageMode, locale]);

  if (dish == null) return null;

  // No `className` override: the toast keeps the app's own width, corner and
  // elevation, so the surprise looks like every other notification rather than
  // like a card that wandered in from somewhere else.
  return (
    <Toast
      details={t('dimSum.blurb')}
      media={media}
      message={dimSumDishName(dish)}
      role="status"
      ttlMs={VISIBLE_MS}
      onDismiss={() => setDish(null)}
    />
  );
}
