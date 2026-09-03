// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';
import { I18nProvider } from '../../src/i18n';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

function project(id: string, name: string, kind?: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...(kind ? { metadata: { kind } as Project['metadata'] } : {}),
  } as Project;
}

const projects = [
  project('p-proto', 'Landing refresh'),
  project('p-deck', 'Quarterly deck', 'deck'),
  project('p-video', 'Launch teaser', 'video'),
];

function renderTab() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as Response));
  return render(
    <I18nProvider initial="en">
      <DesignsTab
        projects={projects}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        isActive={false}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DesignsTab filters', () => {
  it('opens collapsed with a summary of the whole collection', () => {
    renderTab();
    const toggle = screen.getByTestId('designs-filters-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('designs-filter-all')).toBeNull();
    expect(screen.getByTestId('designs-filters-summary').textContent).toContain('3 projects');
  });

  it('reveals the five chips in the mockup order and narrows the grid by kind', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('designs-filters-toggle'));
    const chips = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
      .filter((el) => el.getAttribute('data-testid')?.startsWith('designs-filter-'));
    expect(chips.map((el) => el.getAttribute('data-testid'))).toEqual(
      expect.arrayContaining(['designs-filter-all', 'designs-filter-prototype', 'designs-filter-deck', 'designs-filter-media', 'designs-filter-document']),
    );

    fireEvent.click(screen.getByTestId('designs-filter-deck'));
    expect(screen.getByTestId('designs-filter-deck').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Quarterly deck')).toBeTruthy();
    expect(screen.queryByText('Landing refresh')).toBeNull();
    expect(screen.queryByText('Launch teaser')).toBeNull();
    expect(screen.getByTestId('designs-filters-summary').textContent).toContain('Decks');

    // A project with no kind is a prototype — the creation path's default.
    fireEvent.click(screen.getByTestId('designs-filter-prototype'));
    expect(screen.getByText('Landing refresh')).toBeTruthy();
    expect(screen.queryByText('Quarterly deck')).toBeNull();

    // Image, video and audio are all media.
    fireEvent.click(screen.getByTestId('designs-filter-media'));
    expect(screen.getByText('Launch teaser')).toBeTruthy();
    expect(screen.queryByText('Landing refresh')).toBeNull();
  });
});
