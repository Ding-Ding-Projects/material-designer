// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FigmaImportResult } from '@open-design/contracts';

const importProjectFigmaMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/providers/registry', () => ({ importProjectFigma: importProjectFigmaMock }));

import { FIGMA_URL_RE, FigmaImportModal } from '../../src/components/FigmaImportModal';
import { I18nProvider, type Locale } from '../../src/i18n';

const CSS = readFileSync(
  new URL('../../src/components/FigmaImportModal.module.css', import.meta.url),
  'utf8',
);

function renderModal(locale?: Locale) {
  const modal = (
    <FigmaImportModal
      onClose={() => {}}
      resolveProjectId={async () => null}
      onImported={(_result: FigmaImportResult, _projectId: string) => {}}
      onFigmaUrl={() => {}}
    />
  );
  return render(locale ? <I18nProvider initial={locale}>{modal}</I18nProvider> : modal);
}

describe('FigmaImportModal accessibility and layout', () => {
  afterEach(() => {
    cleanup();
    importProjectFigmaMock.mockReset();
  });

  it('uses catalogued localized names for the URL and notes controls', () => {
    renderModal('zh-HK');

    const fileTab = screen.getByRole('tab', { name: '上傳 .fig' });
    const urlTab = screen.getByRole('tab', { name: 'Figma URL' });
    expect(fileTab).toHaveAttribute('aria-controls', 'figma-import-panel-file');
    expect(urlTab).toHaveAttribute('aria-controls', 'figma-import-panel-url');
    expect(screen.getByRole('tabpanel', { name: '上傳 .fig' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    expect(screen.getByRole('tabpanel', { name: 'Figma URL' })).toBeTruthy();
    const urlField = screen.getByRole('textbox', { name: 'Figma URL' });
    const notesField = screen.getByRole('textbox', { name: '備註' });
    expect(urlField).toHaveAttribute('id', 'figma-import-url');
    expect(notesField).toHaveAttribute('id', 'figma-import-notes');
    expect(document.querySelector('label[for="figma-import-url"]')).toHaveTextContent('Figma URL');
    expect(document.querySelector('label[for="figma-import-notes"]')).toHaveTextContent('備註');
    expect(screen.getByPlaceholderText('https://figma.com/design/… 或 /file/…')).toBeTruthy();
    expect(screen.getByPlaceholderText('例如：我們使用溫暖自然的配色和圓角。品牌語氣有趣但專業...')).toBeTruthy();
  });

  it('announces invalid URL errors and associates them with the form controls', () => {
    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    const urlField = screen.getByRole('textbox', { name: 'Figma URL' });
    const notesField = screen.getByRole('textbox', { name: 'Notes' });
    fireEvent.change(urlField, { target: { value: 'not-a-figma-url' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import & build' }));

    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('id', 'figma-import-error');
    expect(urlField).toHaveAttribute('aria-invalid', 'true');
    expect(urlField).toHaveAttribute('aria-describedby', 'figma-import-error');
    expect(notesField).not.toHaveAttribute('aria-invalid');
    expect(notesField).not.toHaveAttribute('aria-describedby');
  });

  it('anchors URL validation while accepting Figma query strings and hashes', () => {
    expect(FIGMA_URL_RE.test('https://figma.com/file/abc123')).toBe(true);
    expect(FIGMA_URL_RE.test('https://www.figma.com/design/abc123/landing?node-id=1%3A2#canvas')).toBe(true);
    expect(FIGMA_URL_RE.test('https://figma.com/file/abc123 trailing text')).toBe(false);
    expect(FIGMA_URL_RE.test('https://figma.com/file/abc123?node-id=1%3A2 extra')).toBe(false);
  });

  it('clears a valid file before reporting an invalid drop on the visible dropzone', () => {
    renderModal();
    const fileInput = document.getElementById('figma-import-file') as HTMLInputElement;
    const dropzone = document.querySelector('label[for="figma-import-file"]') as HTMLElement;

    fireEvent.change(fileInput, { target: { files: [new File(['valid'], 'design.fig')] } });
    expect(screen.getByRole('button', { name: 'Import & build' })).not.toBeDisabled();

    fireEvent.change(fileInput, { target: { files: [new File(['invalid'], 'notes.txt')] } });
    expect(screen.getByRole('button', { name: 'Import & build' })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(fileInput).toHaveAttribute('aria-invalid', 'true');
    expect(fileInput).toHaveAttribute('aria-describedby', 'figma-import-file-helper figma-import-error');
    expect(dropzone).toHaveAttribute('for', 'figma-import-file');
  });

  it('moves a URL-tab drop to the visible file target and keeps its localized error associated', async () => {
    renderModal('zh-HK');

    const urlTab = screen.getByRole('tab', { name: 'Figma URL' });
    fireEvent.click(urlTab);
    fireEvent.drop(screen.getByRole('dialog'), {
      dataTransfer: { files: [new File(['invalid'], 'notes.txt')] },
    });

    const fileTab = screen.getByRole('tab', { name: '上傳 .fig' });
    await waitFor(() => expect(fileTab).toHaveAttribute('aria-selected', 'true'));
    expect(urlTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: '上傳 .fig' })).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('呢個唔係 .fig 檔案');

    const fileInput = document.getElementById('figma-import-file') as HTMLInputElement;
    expect(fileInput).toHaveAttribute('aria-labelledby', 'figma-import-file-label');
    expect(fileInput).toHaveAttribute('aria-describedby', 'figma-import-file-helper figma-import-error');
    await waitFor(() => expect(fileInput).toHaveFocus());
  });

  it('keeps the native file input named and keyboard-reachable through the visible dropzone', () => {
    renderModal('zh-HK');

    const fileInput = document.getElementById('figma-import-file') as HTMLInputElement;
    const dropzone = document.querySelector('label[for="figma-import-file"]') as HTMLElement;
    const accessibleLabel = document.getElementById('figma-import-file-label');

    expect(dropzone).toHaveAttribute('for', 'figma-import-file');
    expect(accessibleLabel).toHaveTextContent('上傳 .fig');
    expect(fileInput).toHaveAttribute('aria-labelledby', 'figma-import-file-label');
    expect(fileInput).not.toHaveAttribute('aria-hidden');
    expect(fileInput).toHaveAttribute('accept', '.fig');
    expect(CSS).not.toMatch(/\.fileInput\s*\{[^}]*display:\s*none/);
    expect(CSS).toMatch(/\.fileInput\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?clip:\s*rect/);
    expect(CSS).toMatch(/\.filePicker:focus-within\s+\.dropzone/);
  });

  it('keeps URL import failures visible and retryable', async () => {
    const onClose = vi.fn();
    const onFigmaUrl = vi.fn()
      .mockRejectedValueOnce(new Error('Project unavailable'))
      .mockResolvedValueOnce(undefined);
    render(
      <FigmaImportModal
        onClose={onClose}
        resolveProjectId={async () => null}
        onImported={() => {}}
        onFigmaUrl={onFigmaUrl}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Figma URL' }), {
      target: { value: 'https://figma.com/file/abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import & build' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Project unavailable'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Import & build' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onFigmaUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps the standalone translator fallback in English without a provider', () => {
    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    expect(screen.getByRole('textbox', { name: 'Figma URL' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeTruthy();
  });

  it('supports arrow-key tab navigation with a roving tab stop', () => {
    renderModal();
    const fileTab = screen.getByRole('tab', { name: 'Upload .fig' });
    const urlTab = screen.getByRole('tab', { name: 'Figma URL' });

    fileTab.focus();
    fireEvent.keyDown(fileTab, { key: 'ArrowRight' });
    expect(urlTab).toHaveFocus();
    expect(urlTab).toHaveAttribute('aria-selected', 'true');
    expect(fileTab).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the modal body scrollable while the header and footer remain fixed', () => {
    expect(CSS).toMatch(/\.modal\s*\{[\s\S]*?min-height:\s*0;/);
    expect(CSS).toMatch(
      /\.body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(CSS).toMatch(/\.head\s*\{[\s\S]*?flex:\s*0 0 auto;/);
    expect(CSS).toMatch(/\.foot\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });

  it('traps keyboard focus through the native file input and restores the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(
      <FigmaImportModal
        onClose={onClose}
        resolveProjectId={async () => null}
        onImported={(_result: FigmaImportResult, _projectId: string) => {}}
        onFigmaUrl={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Import from Figma' });
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>([
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')));
    const fileInput = document.getElementById('figma-import-file');
    expect(focusable.length).toBeGreaterThan(1);
    expect(fileInput).toBeInstanceOf(HTMLInputElement);
    expect(focusable).toContain(fileInput);

    const pressTab = (index: number, shiftKey = false) => {
      const current = focusable[index]!;
      const nextIndex = (index + (shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      const next = focusable[nextIndex]!;
      current.focus();
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
        shiftKey,
      });
      current.dispatchEvent(event);
      // jsdom does not perform the browser's ordinary Tab default action. Let
      // the real modal handler own the wrap edges, and model the native move
      // between middle controls so the full path still exercises the input.
      if (!event.defaultPrevented) next.focus();
      expect(document.activeElement).toBe(next);
    };

    for (let index = 0; index < focusable.length; index += 1) pressTab(index);
    for (let index = focusable.length - 1; index >= 0; index -= 1) pressTab(index, true);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes before invoking the host callback after a successful file import', async () => {
    const calls: string[] = [];
    const result: FigmaImportResult = {
      snapshotDir: 'figma',
      files: ['figma/tree.json'],
      contextPath: 'figma/DESIGN-context.md',
      suggestedPrompt: 'Build the imported page',
      label: 'design.fig',
      inventory: {
        decoded: true,
        source: 'fig-file',
        nodeCount: 1,
        pageCount: 1,
        frameCount: 1,
        componentCount: 0,
        colors: [],
        fonts: [],
        assetCount: 0,
        hasThumbnail: false,
        warnings: [],
      },
    };
    importProjectFigmaMock.mockResolvedValue({ ok: true, result });
    render(
      <FigmaImportModal
        onClose={() => calls.push('close')}
        resolveProjectId={async () => 'project-1'}
        onImported={() => calls.push('imported')}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['valid'], 'design.fig')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import & build' }));

    await waitFor(() => expect(calls).toEqual(['close', 'imported']));
  });
});
