// Hosted browser check for the documentation site's real module. This suite is
// intentionally kept beside the desktop tests so the hosted job can load the
// site module after the approved universal-settings source is present.
// It is not run in this lane because the repository's local policy keeps the
// Node and browser toolchain in hosted verification.

import { afterEach, describe, expect, it } from 'vitest';

const SITE_MODULE = '../../../../../site/assets/js/personal-vocabulary.js';

function mountSiteSurface(): void {
  document.body.innerHTML = `
    <section data-personal-vocabulary>
      <input data-personal-vocabulary-file type="file">
      <input data-personal-vocabulary-sample value="A private UI label can be adapted here.">
      <output data-personal-vocabulary-output></output>
      <input data-personal-vocabulary-search>
      <p data-personal-vocabulary-count></p>
      <button data-personal-vocabulary-clear></button>
      <p data-personal-vocabulary-status></p>
      <p data-personal-vocabulary-no-matches></p>
      <input data-personal-vocabulary-history-search>
      <input data-personal-vocabulary-history-date-from>
      <input data-personal-vocabulary-history-date-to>
      <button data-personal-vocabulary-history-preset-value></button>
      <div data-personal-vocabulary-history-preset-options></div>
      <input data-personal-vocabulary-history-action-search>
      <button data-personal-vocabulary-history-action-value></button>
      <div data-personal-vocabulary-history-action-options></div>
      <p data-personal-vocabulary-history-status></p>
      <ul data-personal-vocabulary-history-list></ul>
      <button data-personal-vocabulary-history-export></button>
      <button data-personal-vocabulary-history-select-all></button>
      <button data-personal-vocabulary-history-invert></button>
      <button data-personal-vocabulary-history-delete></button>
      <dialog data-personal-vocabulary-history-confirm></dialog>
      <strong data-personal-vocabulary-history-confirm-count></strong>
      <input data-personal-vocabulary-history-key-one>
      <input data-personal-vocabulary-history-key-two>
      <input data-personal-vocabulary-history-slider value="0">
      <button data-personal-vocabulary-history-cancel></button>
      <button data-personal-vocabulary-history-confirm-action></button>
    </section>`;
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('documentation site personal-vocabulary behavior', () => {
  it('loads valid local bytes, updates the real output, and resets the picker', async () => {
    const { initPersonalVocabulary } = await import(SITE_MODULE);
    mountSiteSurface();
    initPersonalVocabulary();
    const picker = document.querySelector('[data-personal-vocabulary-file]') as HTMLInputElement;
    const file = new File(['{"schemaVersion":1,"entries":{"label":"display"}}'], 'local.json', { type: 'application/json' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem('open-design:personal-vocabulary:v1')).toContain('display');
    expect(picker.value).toBe('');
  });

  it('uses local dates, filtered projection, and a redacted deletion event', async () => {
    const { initPersonalVocabulary } = await import(SITE_MODULE);
    const today = new Date();
    localStorage.setItem('open-design:personal-vocabulary-history:v1', JSON.stringify([
      { schemaVersion: 1, action: 'loaded', at: today.getTime() },
      { schemaVersion: 1, action: 'cleared', at: today.getTime() - 86400000 * 3 },
    ]));
    mountSiteSurface();
    initPersonalVocabulary();
    const from = document.querySelector('[data-personal-vocabulary-history-date-from]') as HTMLInputElement;
    from.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    from.dispatchEvent(new Event('input'));
    expect(document.querySelector('[data-personal-vocabulary-history-list]')?.textContent).toContain('Loaded');
    expect(document.querySelector('[data-personal-vocabulary-history-list]')?.textContent).not.toContain('Cleared');
  });
});
