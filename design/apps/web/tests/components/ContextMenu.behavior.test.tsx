// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextMenu } from '../../src/components/ContextMenu';

const acceptTargetAction = (request: { targetId: string; action: 'edit-appearance' | 'lock-element' }) => ({
  ...request,
  accepted: true as const,
});
const acceptDestructive = (request: { targetId: string; itemId: string; label: string }) => ({
  ...request,
  accepted: true as const,
});

describe('ContextMenu scroll behavior', () => {
  it('keeps the menu open while its own item list scrolls', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        ariaLabel="Actions"
        items={Array.from({ length: 20 }, (_, index) => ({
          id: `action-${index}`,
          label: `Action ${index}`,
          onSelect: vi.fn(),
        }))}
        onClose={onClose}
        x={0}
        y={0}
        searchLabel="Actions"
        searchPlaceholder="Filter actions"
        noResultsLabel="No actions match this filter."
        resultCountLabel={(count) => `${count} actions`}
        onEditAppearance={acceptTargetAction}
        onLock={acceptTargetAction}
        editAppearanceLabel="Edit appearance…"
        lockLabel="Lock this element…"
        onRequestDestructiveConfirmation={acceptDestructive}
        destructiveUnavailableLabel="Confirmation is unavailable."
      />,
    );

    fireEvent.scroll(screen.getByRole('menu'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.scroll(document);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
