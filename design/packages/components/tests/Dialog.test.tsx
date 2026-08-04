// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../src/dialog';

afterEach(() => {
  cleanup();
});

describe('Dialog', () => {
  it('wires labelled dialogs consistently', () => {
    render(
      <Dialog ariaLabelledBy="dialog-title">
        <h2 id="dialog-title">Rename design</h2>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Rename design' })).toBeTruthy();
  });

  it('closes on backdrop click when enabled', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog onClose={onClose}>
        <h2>Backdrop close</h2>
      </Dialog>,
    );

    fireEvent.click(container.querySelector('.modal-backdrop') as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape when enabled', () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} closeOnEscape>
        <h2>Escape close</h2>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets custom panels opt out of the shared modal chrome class', () => {
    const { container } = render(
      <Dialog className="plugin-details-modal" includeChromeClassName={false}>
        <h2>Plugin details</h2>
      </Dialog>,
    );

    const panel = container.querySelector('.plugin-details-modal');

    expect(panel).toBeTruthy();
    expect(panel?.className).toBe('plugin-details-modal');
    expect(panel?.classList.contains('modal')).toBe(false);
  });

  it('keeps caller variant sizing overrides ahead of shared dialog defaults', () => {
    const variantStyles = document.createElement('style');
    variantStyles.textContent = '.modal-rename { width: 420px; gap: 14px; }';
    document.head.insertBefore(variantStyles, document.head.firstChild);

    try {
      const { container } = render(
        <Dialog className="modal-rename">
          <h2>Rename design</h2>
        </Dialog>,
      );

      const panel = container.querySelector('.modal-rename') as HTMLElement;
      const panelStyles = getComputedStyle(panel);

      expect(panelStyles.width).toBe('420px');
      expect(panelStyles.gap).toBe('14px');
    } finally {
      variantStyles.remove();
    }
  });

  it('supports sectioned layouts with shared header/body/footer primitives', () => {
    const { container } = render(
      <Dialog layout="sectioned" ariaLabelledBy="dialog-title">
        <DialogHeader>
          <DialogTitle id="dialog-title">Sketch text</DialogTitle>
          <DialogDescription>Add a note to the canvas.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label>
            <span>Text</span>
            <input type="text" />
          </label>
        </DialogBody>
        <DialogFooter>
          <button type="button">Cancel</button>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Sketch text' })).toBeTruthy();
    expect(container.querySelector('[class*="dialogSectioned"]')).toBeTruthy();
    expect(container.querySelector('[class*="header"]')).toBeTruthy();
    expect(container.querySelector('[class*="body"]')).toBeTruthy();
    expect(container.querySelector('[class*="footer"]')).toBeTruthy();
  });

  // aria-modal="true" is a promise that the rest of the page is inert. It was
  // being made without a focus trap behind it, so Tab walked out of the dialog
  // onto the controls the backdrop was covering — for a confirmation dialog,
  // the very controls the user had just been asked to stop and think about.
  describe('focus management', () => {
    it('moves focus to the first tab stop when it opens', () => {
      render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
          <button type="button">Delete</button>
        </Dialog>,
      );

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    });

    it('wraps Tab from the last stop back to the first', () => {
      render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
          <button type="button">Delete</button>
        </Dialog>,
      );
      const first = screen.getByRole('button', { name: 'Cancel' });
      const last = screen.getByRole('button', { name: 'Delete' });

      last.focus();
      fireEvent.keyDown(document, { key: 'Tab' });

      expect(document.activeElement).toBe(first);
    });

    it('wraps Shift+Tab from the first stop back to the last', () => {
      render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
          <button type="button">Delete</button>
        </Dialog>,
      );
      const first = screen.getByRole('button', { name: 'Cancel' });
      const last = screen.getByRole('button', { name: 'Delete' });

      first.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

      expect(document.activeElement).toBe(last);
    });

    it('pulls focus back when it has escaped to the page behind', () => {
      const outside = document.createElement('button');
      outside.textContent = 'Behind the backdrop';
      document.body.appendChild(outside);

      render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
        </Dialog>,
      );

      outside.focus();
      fireEvent.keyDown(document, { key: 'Tab' });

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
      outside.remove();
    });

    it('gives focus back to whatever opened it', () => {
      const opener = document.createElement('button');
      opener.textContent = 'Delete project';
      document.body.appendChild(opener);
      opener.focus();

      const view = render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
        </Dialog>,
      );
      expect(document.activeElement).not.toBe(opener);

      view.unmount();

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it('ignores keys other than Tab', () => {
      render(
        <Dialog ariaLabel="Confirm">
          <button type="button">Cancel</button>
          <button type="button">Delete</button>
        </Dialog>,
      );
      const last = screen.getByRole('button', { name: 'Delete' });

      last.focus();
      fireEvent.keyDown(document, { key: 'ArrowDown' });

      expect(document.activeElement).toBe(last);
    });
  });
});
