// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FigmaImportResult } from '@open-design/contracts';

import { FigmaImportModal } from '../../src/components/FigmaImportModal';

const CSS = readFileSync(
  new URL('../../src/components/FigmaImportModal.module.css', import.meta.url),
  'utf8',
);

function renderModal() {
  return render(
    <FigmaImportModal
      onClose={() => {}}
      resolveProjectId={async () => null}
      onImported={(_result: FigmaImportResult, _projectId: string) => {}}
      onFigmaUrl={() => {}}
    />,
  );
}

describe('FigmaImportModal accessibility and layout', () => {
  afterEach(() => cleanup());

  it('gives the URL and notes controls durable accessible names', () => {
    renderModal();

    const fileTab = screen.getByRole('tab', { name: 'Upload .fig' });
    const urlTab = screen.getByRole('tab', { name: 'Figma URL' });
    expect(fileTab).toHaveAttribute('aria-controls', 'figma-import-panel-file');
    expect(urlTab).toHaveAttribute('aria-controls', 'figma-import-panel-url');
    expect(screen.getByRole('tabpanel', { name: 'Upload .fig' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    expect(screen.getByRole('tabpanel', { name: 'Figma URL' })).toBeTruthy();
    const urlField = screen.getByRole('textbox', { name: 'Figma URL' });
    const notesField = screen.getByRole('textbox', { name: 'Notes for the build' });
    expect(urlField).toHaveAttribute('id', 'figma-import-url');
    expect(notesField).toHaveAttribute('id', 'figma-import-notes');
    expect(document.querySelector('label[for="figma-import-url"]')).toHaveTextContent('Figma URL');
    expect(document.querySelector('label[for="figma-import-notes"]')).toHaveTextContent('Notes for the build');
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

  it('traps keyboard focus and restores the opener', () => {
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
    const focusable = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    expect(focusable.length).toBeGreaterThan(1);
    focusable[0]?.focus();
    fireEvent.keyDown(focusable[0]!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    fireEvent.keyDown(focusable[focusable.length - 1]!, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
