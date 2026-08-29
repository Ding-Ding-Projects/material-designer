import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  normalizeUniversalSettings,
  readUniversalSettings,
  subscribeUniversalSettings,
  resolveScheduledSettings,
  type UniversalSettingsState,
  getUniversalSettingsHost,
} from './universalSettings';
import { useNarrator } from '../narrator/narrator';
import './universal-settings.css';

/**
 * A shell-level observer keeps universal state effective even while Settings
 * is closed. The panel is an editor, not the owner of the live mode.
 */
export function UniversalSettingsRuntime() {
  const [state, setState] = useState<UniversalSettingsState>(() =>
    getUniversalSettingsHost() ? normalizeUniversalSettings({ schemaVersion: 1, revision: 0, updatedAt: 0 }) : readUniversalSettings(),
  );
  const [now, setNow] = useState(() => Date.now());
  const [effective, setEffective] = useState<UniversalSettingsState>(() => state);
  const [sessionStartedAt] = useState(() => Date.now());
  const { setLocale, setLanguageMode, setFunnyLevel } = useI18n();
  const narrator = useNarrator();

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const bridge = getUniversalSettingsHost();
    const external = state.schedules.filter((rule) => rule.enabled && rule.source !== 'local');
    const refresh = async (): Promise<void> => {
      const requestGeneration = ++generation;
      try {
        const results = await Promise.all(external.map(async (rule) => {
          if (!bridge) return [rule.id, null] as const;
          const request = rule.source === 'api'
            ? { source: 'api' as const, url: rule.sourceUrl ?? '' }
            : { source: 'homeAssistant' as const, baseUrl: rule.sourceBaseUrl ?? '', entity: rule.sourceEntity ?? '' };
          const result = await bridge.resolveSchedule(request);
          return [rule.id, result.ok ? { values: result.values, sourceState: result.sourceState } : null] as const;
        }));
        if (cancelled || requestGeneration !== generation) return;
        const overlays = new Map(results);
        const rules = state.schedules.map((rule) => {
          const externalResult = overlays.get(rule.id);
          if (rule.source !== 'local' && (!externalResult || externalResult.sourceState === 'off')) return null;
          return externalResult ? { ...rule, values: { ...rule.values, ...externalResult.values } } : rule;
        }).filter((rule): rule is UniversalSettingsState['schedules'][number] => rule !== null);
        setEffective(resolveScheduledSettings(state, rules, new Date()));
      } catch {
        if (!cancelled && requestGeneration === generation) setEffective(resolveScheduledSettings(state, state.schedules, new Date()));
      }
    };
    void refresh();
    const timer = state.schedules.some((rule) => rule.enabled) ? window.setInterval(() => void refresh(), 60_000) : null;
    return () => { cancelled = true; generation += 1; if (timer !== null) window.clearInterval(timer); };
  }, [state]);

  useEffect(() => {
    const bridge = getUniversalSettingsHost();
    if (bridge) {
      let mounted = true;
      void bridge.read().then((result) => {
        if (!mounted || !result.ok) return;
        setState(normalizeUniversalSettings(result.state));
      });
      const unsubscribe = bridge.subscribe((value) => setState(normalizeUniversalSettings(value)));
      return () => {
        mounted = false;
        unsubscribe();
      };
    }
    return subscribeUniversalSettings((value) => setState(value));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-universal-school-mode', String(effective.school.enabled));
    root.setAttribute('data-universal-school-name', effective.school.name);
    root.setAttribute('data-universal-dialog-emoji', String(effective.showDialogEmoji));
    root.setAttribute('data-universal-display-name', effective.displayName);
    root.setAttribute('data-universal-theme', effective.theme);
    root.setAttribute('data-universal-density', effective.density);
    root.style.setProperty('--universal-accent-color', effective.accentColor);
    root.style.setProperty('--universal-ui-font-family', effective.uiFontFamily);
    for (const mode of ['focus', 'low-stimulation', 'time-awareness', 'one-thing', 'momentum']) {
      const key = mode.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof UniversalSettingsState['adhd'];
      root.setAttribute(`data-universal-adhd-${mode}`, String(effective.adhd[key] === true));
    }
    document.title = effective.displayName;
    window.dispatchEvent(new CustomEvent('material-designer:universal-school-mode', {
      detail: { enabled: effective.school.enabled, name: effective.school.name },
    }));
    if (effective.school.enabled) {
      setLocale('en');
      setLanguageMode('single');
      setFunnyLevel('en', 1);
      setFunnyLevel('zh-HK', 1);
    } else {
      setLocale(effective.languageMode === 'cantonese' ? 'zh-HK' : 'en');
      setLanguageMode(effective.languageMode === 'bilingual' ? 'bilingual' : 'single');
      setFunnyLevel('en', effective.funnyEnglish);
      setFunnyLevel('zh-HK', effective.funnyCantonese);
    }
    const language = effective.narrator.language === 'english' ? 'en' : effective.narrator.language === 'cantonese' ? 'zh-HK' : 'both';
    const current = narrator.preferences;
    if (current.enabled !== effective.narrator.enabled || current.language !== language || current.quiet !== effective.narrator.quiet || current.rate !== effective.narrator.rate || current.pitch !== effective.narrator.pitch || current.englishVoiceId !== effective.narrator.englishVoiceId || current.cantoneseVoiceId !== effective.narrator.cantoneseVoiceId) {
      narrator.setPreferences({ ...current, enabled: effective.narrator.enabled, language, quiet: effective.narrator.quiet, rate: effective.narrator.rate, pitch: effective.narrator.pitch, englishVoiceId: effective.narrator.englishVoiceId, cantoneseVoiceId: effective.narrator.cantoneseVoiceId });
    }
  }, [effective, narrator, setFunnyLevel, setLanguageMode, setLocale, state]);

  useEffect(() => {
    const applyDialogEmoji = (): void => {
      document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]').forEach((dialog) => {
        const title = dialog.querySelector<HTMLElement>('[data-dialog-title], h1, h2, h3, h4');
        if (!title) return;
        const existing = title.querySelector<HTMLElement>('[data-universal-dialog-emoji-marker]');
        if (effective.showDialogEmoji && !existing) {
          const marker = document.createElement('span');
          marker.textContent = '💬';
          marker.setAttribute('aria-hidden', 'true');
          marker.dataset.universalDialogEmojiMarker = 'true';
          marker.style.marginInlineEnd = '0.35em';
          title.prepend(marker);
        } else if (!effective.showDialogEmoji && existing) {
          existing.remove();
        }
      });
    };
    applyDialogEmoji();
    const observer = new MutationObserver(applyDialogEmoji);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [effective.showDialogEmoji]);

  useEffect(() => {
    if (!effective.adhd.focus) return undefined;
    const onFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const surface = target.closest<HTMLElement>('section, main, [role="dialog"], [data-tab-panel]');
      const parent = surface?.parentElement;
      if (!parent) return;
      for (const child of Array.from(parent.children)) {
        if (child instanceof HTMLElement) child.toggleAttribute('data-universal-adhd-dimmed', child !== surface);
      }
    };
    const clear = (): void => {
      document.querySelectorAll<HTMLElement>('[data-universal-adhd-dimmed]').forEach((node) => node.removeAttribute('data-universal-adhd-dimmed'));
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', clear);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', clear);
      clear();
    };
  }, [effective.adhd.focus]);

  useEffect(() => {
    if (!effective.adhd.timeAwareness && !effective.adhd.momentum) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [effective.adhd.momentum, effective.adhd.timeAwareness]);

  const elapsed = Math.max(0, now - sessionStartedAt);
  const elapsedLabel = `${Math.floor(elapsed / 60000)}m ${Math.floor(elapsed / 1000) % 60}s`;
  const momentumDue = effective.adhd.momentum && effective.updatedAt > 0 && now - effective.updatedAt >= 15 * 60 * 1000;
  const inactiveMinutes = Math.floor(Math.max(0, now - effective.updatedAt) / 60000);

  return (
    <>
      {effective.adhd.timeAwareness ? (
        <div className="universal-adhd-time-awareness" role="status" aria-live="off">
          Session elapsed: {elapsedLabel}
        </div>
      ) : null}
      {effective.adhd.oneThing && effective.nextAction ? (
        <div className="universal-adhd-next-action" role="status" aria-live="polite">
          Next action: {effective.nextAction}
        </div>
      ) : null}
      {momentumDue ? (
        <div className="universal-adhd-momentum" role="status" aria-live="polite">
          Nothing has changed here for {inactiveMinutes} minutes.
        </div>
      ) : null}
    </>
  );
}
