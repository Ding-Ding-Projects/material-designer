// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

    fireEvent.click(screen.getByRole('tab', { name: 'Figma URL' }));
    expect(screen.getByRole('textbox', { name: 'Figma URL' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Notes for the build' })).toBeTruthy();
  });

  it('keeps the modal body scrollable while the header and footer remain fixed', () => {
    expect(CSS).toMatch(/\.modal\s*\{[\s\S]*?min-height:\s*0;/);
    expect(CSS).toMatch(
      /\.body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(CSS).toMatch(/\.head\s*\{[\s\S]*?flex:\s*0 0 auto;/);
    expect(CSS).toMatch(/\.foot\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  });
});
