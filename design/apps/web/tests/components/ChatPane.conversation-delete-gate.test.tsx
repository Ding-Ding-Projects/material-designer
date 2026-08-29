// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Current chat',
    createdAt: 1,
    updatedAt: 2,
  },
  {
    id: 'conv-2',
    projectId: 'project-1',
    title: 'Pricing table',
    createdAt: 3,
    updatedAt: 4,
  },
];

function renderChat(onDeleteConversation: (id: string) => void) {
  return render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={onDeleteConversation}
    />,
  );
}

function openDeleteGate(): HTMLElement {
  fireEvent.click(screen.getByTestId('conversation-history-trigger'));
  fireEvent.click(screen.getByTestId('conversation-delete-conv-2'));
  return screen.getByTestId('destructive-gate');
}

function authorizeGate(gate: HTMLElement): void {
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-first'));
  fireEvent.click(within(gate).getByTestId('destructive-gate-key-second'));
  for (const value of ['20', '40', '60', '80', '100']) {
    fireEvent.change(within(gate).getByTestId('destructive-gate-slider'), {
      target: { value },
    });
  }
}

describe('ChatPane conversation deletion', () => {
  it('owns the destructive gate and does not call native confirm or delete on the first click', () => {
    const onDeleteConversation = vi.fn();
    const nativeConfirm = vi.spyOn(globalThis, 'confirm');
    renderChat(onDeleteConversation);

    const gate = openDeleteGate();

    expect(gate).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(onDeleteConversation).not.toHaveBeenCalled();
    expect(gate.textContent).toContain('Pricing table');
  });

  it('keeps the conversation when the gate is cancelled', async () => {
    const onDeleteConversation = vi.fn();
    renderChat(onDeleteConversation);

    const gate = openDeleteGate();
    fireEvent.click(within(gate).getByTestId('destructive-gate-exit'));

    await waitFor(() => expect(screen.queryByTestId('destructive-gate')).toBeNull());
    expect(onDeleteConversation).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-item-conv-2')).toBeTruthy();
  });

  it('calls the live deletion callback only after both keys and the full slider', async () => {
    const onDeleteConversation = vi.fn();
    renderChat(onDeleteConversation);

    const gate = openDeleteGate();
    authorizeGate(gate);

    await waitFor(() => expect(onDeleteConversation).toHaveBeenCalledWith('conv-2'));
    expect(onDeleteConversation).toHaveBeenCalledTimes(1);
  });
});
