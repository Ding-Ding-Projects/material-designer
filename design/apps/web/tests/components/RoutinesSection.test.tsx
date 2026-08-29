// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';
import { readFileSync } from 'node:fs';

import { RoutinesSection } from '../../src/components/RoutinesSection';
import * as router from '../../src/router';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
const originalInnerWidth = window.innerWidth;
const ROUTINES_CSS = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);

function cssRule(css: string, selector: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let preludeStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      if (depth === 0 && source.slice(preludeStart, index).trim() === selector) {
        let nested = 1;
        let end = index + 1;
        while (end < source.length && nested > 0) {
          if (source[end] === '{') nested += 1;
          if (source[end] === '}') nested -= 1;
          end += 1;
        }
        return source.slice(index + 1, end - 1);
      }
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      preludeStart = index + 1;
    } else if (character === ';' && depth === 0) {
      preludeStart = index + 1;
    }
  }
  throw new Error(`Missing CSS rule for ${selector}`);
}

function cssValue(block: string, property: string): string {
  const line = block
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${property}:`));
  if (!line) throw new Error(`Missing CSS declaration for ${property}`);
  return line.slice(property.length + 1).replace(/;$/, '').trim();
}

function assertRoutineTitleWrap(css: string): void {
  const title = cssRule(css, '.routines-item-title');
  expect(cssValue(title, 'display')).toBe('flex');
  expect(cssValue(title, 'align-items')).toBe('center');
  expect(cssValue(title, 'flex-wrap')).toBe('wrap');
  expect(cssValue(title, 'min-width')).toBe('0');

  const strong = cssRule(css, '.routines-item-title strong');
  expect(cssValue(strong, 'min-width')).toBe('0');
  expect(cssValue(strong, 'max-width')).toBe('100%');
  expect(cssValue(strong, 'overflow-wrap')).toBe('anywhere');
}

function mutateCssDeclaration(
  css: string,
  selector: string,
  property: string,
  replacement: string,
): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS marker for ${selector}`);
  let depth = 0;
  let end = start;
  for (; end < css.length; end += 1) {
    if (css[end] === '{') depth += 1;
    if (css[end] === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  const rule = css.slice(start, end);
  const lines = rule.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.trim().startsWith(`${property}:`));
  if (lineIndex < 0) throw new Error(`Missing mutable declaration for ${property}`);
  const indentation = lines[lineIndex]!.match(/^\s*/)?.[0] ?? '';
  lines[lineIndex] = `${indentation}${property}: ${replacement};`;
  return css.slice(0, start) + lines.join('\n') + css.slice(end);
}

/**
 * Drive the super-confirmation gate all the way: both keys, then the slider to
 * the end. Deleting an automation used to be one browser confirm; it is now
 * this, and the sequence is what these tests have to perform to reach the
 * delete.
 */
function authorizeDestructiveGate(): void {
  const gate = screen.getByTestId('destructive-gate');
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
  // The slider rations forward travel, so a single jump to the end does not
  // authorize — five advances is the minimum the ration allows.
  for (const value of ['20', '40', '60', '80', '100']) {
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value },
    });
  }
}

describe('RoutinesSection', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('creates a weekly routine that reuses an existing project', async () => {
    let routines: Routine[] = [];
    const projects = [{ id: 'proj-1', name: 'Routine Test Project' }];
    const createBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        createBodies.push(body);
        routines = [{
          id: 'routine-1',
          name: body.name,
          prompt: body.prompt,
          schedule: body.schedule,
          target: body.target,
          skillId: null,
          agentId: null,
          enabled: true,
          nextRunAt: Date.now() + 3600_000,
          lastRun: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New automation' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.change(screen.getAllByRole('combobox')[1]!, {
      target: { value: 'proj-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Weekly digest')).toBeTruthy();
    });
    expect(createBodies).toEqual([
      {
        name: 'Weekly digest',
        prompt: 'Summarize GitHub and design activity.',
        schedule: {
          kind: 'weekly',
          weekday: 3,
          time: '09:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        target: {
          mode: 'reuse',
          projectId: 'proj-1',
        },
        enabled: true,
      },
    ]);
  });

  it('pauses and resumes an existing routine through PATCH updates', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const patchBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        const current = routines[0]!;
        routines = [{
          ...current,
          enabled: body.enabled,
          updatedAt: Date.now(),
        }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;

    // Pause/resume is the M3 switch now (roadmap Wave 4), so the control has
    // ONE stable accessible name and reports its state through aria-checked
    // rather than by renaming itself between two words.
    const toggle = () =>
      within(card).getByRole('switch', { name: 'Morning briefing enabled' });
    const stateChip = () => card.querySelector<HTMLElement>('.routines-state-chip');

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(stateChip()?.dataset.state).toBe('enabled');
    expect(stateChip()?.textContent).toBe('active');
    expect(Array.from(within(card).getByRole('button', { name: 'Run now' }).classList).sort())
      .toEqual(['btn', 'routines-action', 'routines-action-tonal'].sort());
    expect(Array.from(within(card).getByRole('button', { name: 'Delete' }).classList).sort())
      .toEqual(['btn', 'routines-action', 'routines-item-delete'].sort());
    // The old Pause/Resume button must not remain as a second button-shaped
    // route to the same action. The switch role is the exact interaction
    // boundary and the legacy accessible button name is intentionally absent.
    expect(within(card).queryByRole('button', { name: 'Morning briefing enabled' })).toBeNull();
    fireEvent.click(toggle());
    await waitFor(() => {
      expect(toggle().getAttribute('aria-checked')).toBe('false');
      expect(stateChip()?.dataset.state).toBe('paused');
      expect(stateChip()?.textContent).toBe('paused');
    });

    fireEvent.click(toggle());
    await waitFor(() => {
      expect(toggle().getAttribute('aria-checked')).toBe('true');
      expect(stateChip()?.dataset.state).toBe('enabled');
      expect(stateChip()?.textContent).toBe('active');
    });

    expect(patchBodies).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('uses an exact brace-aware title wrapping rule and proves each mutation red', () => {
    assertRoutineTitleWrap(ROUTINES_CSS);

    const missingFlexWrap = mutateCssDeclaration(
      ROUTINES_CSS,
      '.routines-item-title',
      'flex-wrap',
      'nowrap',
    );
    expect(() => assertRoutineTitleWrap(missingFlexWrap)).toThrow();

    const missingTitleMinWidth = mutateCssDeclaration(
      ROUTINES_CSS,
      '.routines-item-title',
      'min-width',
      'auto',
    );
    expect(() => assertRoutineTitleWrap(missingTitleMinWidth)).toThrow();

    const missingStrongMinWidth = mutateCssDeclaration(
      ROUTINES_CSS,
      '.routines-item-title strong',
      'min-width',
      'auto',
    );
    expect(() => assertRoutineTitleWrap(missingStrongMinWidth)).toThrow();

    const missingOverflowWrap = mutateCssDeclaration(
      ROUTINES_CSS,
      '.routines-item-title strong',
      'overflow-wrap',
      'normal',
    );
    expect(() => assertRoutineTitleWrap(missingOverflowWrap)).toThrow();
  });

  it('keeps a long bilingual routine title and its state chip in the narrow title row', async () => {
    const routines: Routine[] = [{
      id: 'routine-long',
      name: 'Weekly design review and release notes · 每週設計審查及發布說明',
      prompt: 'Review the latest work.',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: false,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/routines') {
        return new Response(JSON.stringify({ routines }), { status: 200 });
      }
      if (url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const name = await screen.findByText(routines[0]!.name);
    const title = name.closest('.routines-item-title') as HTMLElement;
    expect(title.classList.contains('routines-item-title')).toBe(true);
    expect(title.querySelector('strong')?.textContent).toBe(routines[0]!.name);
    expect(title.querySelector('.routines-state-chip')?.getAttribute('data-state')).toBe('paused');
    expect(title.querySelector('.routines-state-chip')?.textContent).toBe('paused');
  });

  it('runs a routine now and loads its history', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const runBodies: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/run' && init?.method === 'POST') {
        runBodies.push(url);
        const current = routines[0]!;
        routines = [{
          ...current,
          lastRun: {
            runId: 'run-1',
            status: 'queued',
            trigger: 'manual',
            startedAt: Date.now(),
            projectId: 'proj-run',
            conversationId: 'conv-run',
            agentRunId: 'agent-run-1',
          },
        }];
        return new Response(JSON.stringify({
          routine: routines[0],
          run: routines[0]!.lastRun,
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
        }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-1',
              trigger: 'manual',
              status: 'queued',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now(),
              completedAt: null,
              summary: null,
              error: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;

    fireEvent.click(within(card).getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(within(card).getByRole('button', { name: 'Hide history' })).toBeTruthy();
    });
    expect(await screen.findByText('manual')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open project' })).toBeTruthy();
    expect(runBodies).toEqual(['/api/routines/routine-1/run']);
  });

  it('shows a validation error when reuse mode is selected without a project', async () => {
    const postBodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [{ id: 'proj-1', name: 'Routine Test Project' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        postBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({}), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New automation' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    });
    expect(postBodies).toEqual([]);
  });

  it('deletes a routine after the destructive gate is authorized', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const deletedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        routines = [];
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    // Pressing Delete opens the gate and does nothing else. The gate names the
    // automation, so the user can check what the slider is about to do.
    const gate = screen.getByTestId('destructive-gate');
    // getAllByText, because the gate names the automation more than once — as
    // the target it is about to act on and again in the list of what will go.
    // Naming it twice is the gate doing its job; the assertion only needs it
    // to appear at all.
    expect(within(gate).getAllByText(/Morning briefing/).length).toBeGreaterThan(0);
    expect(deletedUrls).toEqual([]);

    authorizeDestructiveGate();

    await waitFor(() => {
      expect(screen.getByText('No automations yet.')).toBeTruthy();
    });
    expect(deletedUrls).toEqual(['/api/routines/routine-1']);
  });

  it('leaves the routine alone when the destructive gate is dismissed', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const deletedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    const gate = screen.getByTestId('destructive-gate');
    // Both keys on and the slider dragged part-way: the emergency exit still
    // leaves the automation untouched, because nothing has run.
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
    fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value: '20' },
    });
    fireEvent.click(within(gate).getByTestId('destructive-gate-exit'));

    await waitFor(() => {
      expect(screen.queryByTestId('destructive-gate')).toBeNull();
    });
    expect(deletedUrls).toEqual([]);
    // Same reason as above: assert the automation is still listed, without
    // depending on how many places render its name.
    expect(screen.getAllByText('Morning briefing').length).toBeGreaterThan(0);
  });

  it('opens the project referenced by a routine run from history', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-1',
              trigger: 'manual',
              status: 'succeeded',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now(),
              completedAt: Date.now() + 2000,
              summary: 'Done',
              error: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open project' }));

    expect(navigateSpy).toHaveBeenCalledWith(
      {
        kind: 'project',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        fileName: null,
      },
    );
  });

  it('shows persisted failure reasons in the last-run summary and history', async () => {
    const failure = 'Agent stalled without emitting any new output for 1s.';
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: {
        runId: 'run-failed-1',
        status: 'failed',
        trigger: 'scheduled',
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        projectId: 'proj-run',
        conversationId: 'conv-run',
        agentRunId: 'agent-run-1',
        error: failure,
        errorCode: 'AGENT_EXECUTION_FAILED',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-failed-1',
              routineId: 'routine-1',
              trigger: 'scheduled',
              status: 'failed',
              projectId: 'proj-run',
              conversationId: 'conv-run',
              agentRunId: 'agent-run-1',
              startedAt: Date.now() - 1000,
              completedAt: Date.now(),
              summary: null,
              error: failure,
              errorCode: 'AGENT_EXECUTION_FAILED',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    expect(within(row).getByText(failure)).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'History' }));
    await waitFor(() => {
      expect(screen.getAllByText(failure)).toHaveLength(2);
    });
  });

  it('shows the empty history state when a routine has never run', async () => {
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({ runs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });

  it('falls back to the empty history state when loading run history fails', async () => {
    const routines = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10') {
        return new Response(JSON.stringify({ error: 'history unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });

  it('shows an error alert when the initial routines load fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/routines') {
        return new Response(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects') {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('routines: 500');
  });

  it('shows an error alert when creating a routine fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'provider unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'New automation' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Weekly digest' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize GitHub and design activity.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('alert')).textContent).toContain('provider unavailable');
    expect(screen.getByDisplayValue('Weekly digest')).toBeTruthy();
  });

  it('shows an error alert when running a routine now fails', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/run' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'agent unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Run now' }));

    expect((await screen.findByRole('alert')).textContent).toContain('agent unavailable');
    expect(within(card).queryByRole('button', { name: 'Hide history' })).toBeNull();
  });

  it('shows an error alert when pausing a routine fails and keeps the current action', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ error: 'scheduler unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = await screen.findByText('Morning briefing');
    const card = row.closest('li')!;
    const toggle = within(card).getByRole('switch', { name: 'Morning briefing enabled' });
    fireEvent.click(toggle);

    expect((await screen.findByRole('alert')).textContent).toContain('scheduler unavailable');
    // The switch is stateless and the host owns `checked`: a failed PATCH
    // leaves the automation enabled, so the control must still read as on
    // rather than having flipped optimistically to a state the daemon
    // rejected.
    expect(
      within(card).getByRole('switch', { name: 'Morning briefing enabled' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(card.querySelector<HTMLElement>('.routines-state-chip')?.dataset.state).toBe('enabled');
    expect(card.querySelector<HTMLElement>('.routines-state-chip')?.textContent).toBe('active');
  });

  it('edits an existing routine and PATCHes the updated fields', async () => {
    let routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'reuse', projectId: 'proj-1' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const patchBodies: unknown[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [{ id: 'proj-1', name: 'Routine Test Project' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        const current = routines[0]!;
        routines = [{
          ...current,
          name: body.name ?? current.name,
          prompt: body.prompt ?? current.prompt,
          schedule: body.schedule ?? current.schedule,
          target: body.target ?? current.target,
          updatedAt: Date.now(),
        }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Morning briefing');
    const promptInput = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(promptInput.value).toBe('Morning summary');

    fireEvent.change(nameInput, { target: { value: 'Renamed briefing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Renamed briefing')).toBeTruthy();
    });
    expect(patchBodies).toHaveLength(1);
    const body = patchBodies[0] as Record<string, unknown>;
    expect(body.name).toBe('Renamed briefing');
    expect(body.prompt).toBe('Morning summary');
    expect(body.schedule).toEqual({ kind: 'daily', time: '09:00', timezone: 'UTC' });
    expect(body.target).toEqual({ mode: 'reuse', projectId: 'proj-1' });
  });

  it('shows the failure inside the gate when deleting a routine fails', async () => {
    const routines: Routine[] = [{
      id: 'routine-1',
      name: 'Morning briefing',
      prompt: 'Morning summary',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: Date.now() + 3600_000,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ error: 'delete failed upstream' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<RoutinesSection />);

    const row = (await screen.findByText('Morning briefing')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    authorizeDestructiveGate();

    // The daemon's own words, rendered inside the gate the user is looking at
    // rather than on a banner behind it. The gate stays open over an
    // automation that is demonstrably still in the list.
    const failure = await screen.findByTestId('destructive-gate-failure');
    expect(failure.textContent).toContain('delete failed upstream');
    const gate = screen.getByTestId('destructive-gate');
    expect(gate).toBeTruthy();
    // Scoped outside the gate deliberately. The gate names the automation it
    // failed to delete, so a bare query matches there too — and the claim
    // being made is that the automation is still in the LIST, which a match
    // inside the gate would not show.
    const stillListed = screen
      .getAllByText('Morning briefing')
      .some((node) => !gate.contains(node));
    expect(stillListed).toBe(true);
  });
});
