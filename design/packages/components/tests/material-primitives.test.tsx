// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Button,
  Checkbox,
  Field,
  Heading,
  Input,
  Label,
  Menu,
  MenuItem,
  OverlaySurface,
  Radio,
  registerMenuShortcut,
  Surface,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from '../src';

afterEach(() => cleanup());

describe('Material 3 primitives', () => {
  it('renders semantic button variants, state, and loading boundaries', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button variant="filled" onClick={onClick}>Create</Button>
        <Button variant="tonal">Secondary</Button>
        <Button variant="outlined">Outline</Button>
        <Button variant="text" size="icon" aria-label="More" />
        <Button variant="danger" loading>Delete</Button>
      </>,
    );

    const create = screen.getByRole('button', { name: 'Create' });
    expect(create.getAttribute('data-md-component')).toBe('button');
    expect(create.getAttribute('data-md-variant')).toBe('filled');
    expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('aria-busy')).toBe('true');
    fireEvent.click(create);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('maps legacy button API aliases without emitting repainting global classes', () => {
    const globalOverride = document.createElement('style');
    globalOverride.textContent = '.primary, .ghost, .subtle, .primary-ghost { background: rgb(255, 0, 255) !important; }';
    document.head.appendChild(globalOverride);
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="primary-ghost">Primary ghost</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="subtle">Subtle</Button>
      </>,
    );
    for (const [name, legacyClass] of [
      ['Primary', 'primary'],
      ['Primary ghost', 'primary-ghost'],
      ['Ghost', 'ghost'],
      ['Subtle', 'subtle'],
    ] as const) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('data-md-variant')).toBe(legacyClass);
      expect(button.classList.contains(legacyClass)).toBe(false);
      expect(getComputedStyle(button).backgroundColor).not.toBe('rgb(255, 0, 255)');
    }
    globalOverride.remove();
  });

  it('connects field labels, native required constraint validation, and errors', () => {
    render(
      <Field label="Project name" description="Shown in the title bar." error="Name is required." required>
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText('Project name');
    const description = screen.getByText('Shown in the title bar.');
    const error = screen.getByRole('alert', { name: 'Name is required.' });
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.checkValidity()).toBe(false);
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy.includes(description.id)).toBe(true);
    expect(describedBy.includes(error.id)).toBe(true);
  });

  it('preserves a child control required and ARIA state when Field is not required', () => {
    render(
      <Field label="Workspace">
        <Input required aria-required="true" aria-describedby="existing-help" />
      </Field>,
    );
    const input = screen.getByLabelText('Workspace');
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('existing-help');
  });

  it('keeps selection controls native and accessible', () => {
    render(
      <>
        <Checkbox label="Remember choice" />
        <Radio label="Light" name="theme" value="light" />
        <Switch label="Enable updates" />
      </>,
    );
    expect(screen.getByRole('checkbox', { name: 'Remember choice' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Enable updates' })).toBeTruthy();
  });

  it('provides menu roles and roving keyboard focus', () => {
    const onClose = vi.fn();
    render(
      <Menu aria-label="Actions" onClose={onClose}>
        <MenuItem>First</MenuItem>
        <MenuItem shortcut={registerMenuShortcut({ id: 'save', label: 'Ctrl+S', keys: 'Control+S' })}>Second</MenuItem>
        <MenuItem disabled>Unavailable</MenuItem>
      </Menu>,
    );

    const menu = screen.getByRole('menu', { name: 'Actions' });
    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: /Second/ });
    expect(first.getAttribute('data-md-component')).toBe('menu-item');
    expect(first.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(second.getAttribute('aria-keyshortcuts')).toBe('Control+S');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rejects arbitrary shortcut metadata before it can become ARIA state', () => {
    expect(() => registerMenuShortcut({ id: 'save', label: 'Ctrl+S', keys: 'Ctrl+S' })).toThrowError(
      'Menu shortcut registration rejected unsupported key sequence for save',
    );
    expect(() => render(
      <Menu aria-label="Unregistered shortcut">
        <MenuItem shortcut={{ id: 'fake', label: 'Fake', keys: 'Alt+F' } as never}>Fake</MenuItem>
      </Menu>,
    )).toThrowError('MenuItem requires a registered shortcut descriptor before exposing aria-keyshortcuts');
  });

  it('keeps tabs in the correct orientation and exposes selected panels', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs defaultValue="one" orientation="vertical" onValueChange={onValueChange}>
        <TabList aria-label="Workspace sections">
          <Tab value="one">One</Tab>
          <Tab value="two">Two</Tab>
        </TabList>
        <TabPanel value="one">First content</TabPanel>
        <TabPanel value="two">Second content</TabPanel>
      </Tabs>,
    );

    const list = screen.getByRole('tablist', { name: 'Workspace sections' });
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect(one.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'One' }).hasAttribute('hidden')).toBe(false);
    fireEvent.click(two);
    expect(onValueChange).toHaveBeenCalledWith('two');
    expect(two.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Two' }).hasAttribute('hidden')).toBe(false);
  });

  it('refuses an unnamed tablist instead of shipping an inaccessible strip', () => {
    expect(() => render(
      <Tabs defaultValue="one">
        <TabList>
          <Tab value="one">One</Tab>
        </TabList>
      </Tabs>,
    )).toThrowError('TabList requires an accessible name via aria-label or aria-labelledby');
  });

  it('maps typography roles, keeps an overlay bounded, and returns focus on dismissal', () => {
    const onDismiss = vi.fn();
    const opener = document.createElement('button');
    opener.type = 'button';
    opener.textContent = 'Open details';
    document.body.appendChild(opener);
    opener.focus();
    const returnFocusRef = { current: opener };
    render(
      <>
        <Heading>Workspace</Heading>
        <Heading as="h1">Override heading</Heading>
        <Label>Section</Label>
        <Typography variant="bodyLarge">Details</Typography>
        <OverlaySurface
          role="dialog"
          aria-label="Details"
          onDismiss={onDismiss}
          dismissOnOutsidePress
          returnFocusRef={returnFocusRef}
        >
          Overlay
        </OverlaySurface>
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Workspace' }).tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'Override heading' }).tagName).toBe('H1');
    expect(screen.getByText('Section').getAttribute('data-typography')).toBe('labelLarge');
    const overlay = screen.getByRole('dialog', { name: 'Details' });
    expect(overlay.getAttribute('data-surface-level')).toBe('3');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(2);
    opener.remove();
  });

  it('dismisses only the topmost overlay and returns focus once per opener', () => {
    const parentDismiss = vi.fn();
    const childDismiss = vi.fn();
    const parentOpener = document.createElement('button');
    const childOpener = document.createElement('button');
    parentOpener.textContent = 'Open parent';
    childOpener.textContent = 'Open child';
    document.body.append(parentOpener, childOpener);
    const parentFocus = vi.spyOn(parentOpener, 'focus');
    const childFocus = vi.spyOn(childOpener, 'focus');
    const parentRef = { current: parentOpener };
    const childRef = { current: childOpener };
    const view = render(
      <OverlaySurface role="dialog" aria-label="Parent" onDismiss={parentDismiss} dismissOnOutsidePress returnFocusRef={parentRef}>
        Parent
      </OverlaySurface>,
    );
    view.rerender(
      <>
        <OverlaySurface role="dialog" aria-label="Parent" onDismiss={parentDismiss} dismissOnOutsidePress returnFocusRef={parentRef}>
          Parent
        </OverlaySurface>
        <OverlaySurface role="dialog" aria-label="Child" onDismiss={childDismiss} dismissOnOutsidePress returnFocusRef={childRef}>
          Child
        </OverlaySurface>
      </>,
    );

    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'Parent' }));
    expect(childDismiss).toHaveBeenCalledTimes(1);
    expect(parentDismiss).toHaveBeenCalledTimes(0);
    expect(childFocus).toHaveBeenCalledTimes(1);
    expect(parentFocus).toHaveBeenCalledTimes(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(parentDismiss).toHaveBeenCalledTimes(1);
    expect(parentFocus).toHaveBeenCalledTimes(1);
    view.unmount();
    parentOpener.remove();
    childOpener.remove();
  });

  it('restricts interactive surfaces to native interactive elements', () => {
    expect(() => render(<Surface interactive>Not operable</Surface>)).toThrowError(
      'Surface interactive requires a native interactive element via as',
    );
    expect(() => render(<Surface interactive as="a">Missing href</Surface>)).toThrowError(
      'Surface interactive anchors require a non-empty href',
    );
    expect(() => render(<Surface interactive as="input">Invalid children</Surface>)).toThrowError(
      'Surface input cannot receive children',
    );
    expect(() => render(<Surface interactive as="summary">No details owner</Surface>)).toThrowError(
      'Surface summary requires an explicit details owner',
    );
    const onClick = vi.fn();
    render(<Surface interactive as="button" onClick={onClick}>Operable</Surface>);
    const button = screen.getByRole('button', { name: 'Operable' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    render(<Surface interactive as="a" href="/details">Open details</Surface>);
    expect(screen.getByRole('link', { name: 'Open details' }).getAttribute('href')).toBe('/details');
  });
});
