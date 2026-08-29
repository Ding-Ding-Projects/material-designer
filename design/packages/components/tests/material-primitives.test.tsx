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

  it('connects field labels, descriptions, required state, and errors', () => {
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
    expect(input.getAttribute('aria-describedby')).toContain(description.id);
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
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
        <MenuItem shortcut="Ctrl+S">Second</MenuItem>
        <MenuItem disabled>Unavailable</MenuItem>
      </Menu>,
    );

    const menu = screen.getByRole('menu', { name: 'Actions' });
    const first = screen.getByRole('menuitem', { name: 'First' });
    const second = screen.getByRole('menuitem', { name: /Second/ });
    expect(first.getAttribute('data-md-component')).toBe('menu-item');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('maps typography roles and dismisses painted overlays with Escape', () => {
    const onDismiss = vi.fn();
    render(
      <>
        <Heading as="h1">Workspace</Heading>
        <Label>Section</Label>
        <Typography variant="bodyLarge">Details</Typography>
        <OverlaySurface role="dialog" aria-label="Details" onDismiss={onDismiss}>Overlay</OverlaySurface>
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Workspace' }).getAttribute('data-typography')).toBe('headlineSmall');
    expect(screen.getByText('Section').getAttribute('data-typography')).toBe('labelLarge');
    const overlay = screen.getByRole('dialog', { name: 'Details' });
    expect(overlay.getAttribute('data-surface-level')).toBe('3');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
