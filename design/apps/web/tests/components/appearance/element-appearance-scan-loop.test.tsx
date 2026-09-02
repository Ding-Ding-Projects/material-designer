// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ElementAppearanceBoundary } from '../../../src/components/appearance/ElementAppearanceBoundary';
import { useAppearanceRegistry } from '../../../src/components/appearance/elementAppearance';

afterEach(() => {
  cleanup();
});

// The boundary wraps the whole application, so any render loop it starts is an
// application-wide hang: the scan walks document.body, and every re-render used
// to start the next scan. These pin the three links that closed that circuit.
describe('element appearance registry re-render contract', () => {
  it('does not re-render when unregistering an id that was never registered', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useAppearanceRegistry();
    });

    const before = renders;
    act(() => {
      result.current.unregister('appearance:never-registered');
      result.current.unregister('appearance:also-absent');
    });

    // Every scan unregisters the ids whose semantic digest collided, so an
    // unconditional re-render here is a pump: re-render, re-scan, collide.
    expect(renders).toBe(before);
  });

  it('keeps one targets array identity across renders that change nothing', () => {
    const seen: (readonly unknown[])[] = [];
    const { rerender, result } = renderHook(() => {
      const registry = useAppearanceRegistry();
      seen.push(registry.targets);
      return registry;
    });

    rerender();
    rerender();

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(1);
    expect(result.current.targets).toBe(seen[0]);
  });

  it('re-renders once a target really is removed', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useAppearanceRegistry();
    });

    const element = document.createElement('button');
    act(() => {
      result.current.register({
        id: 'appearance:real', label: 'Real', role: 'button', path: 'button', element,
      });
    });
    expect(result.current.targets).toHaveLength(1);

    const before = renders;
    act(() => {
      result.current.unregister('appearance:real');
    });
    expect(renders).toBeGreaterThan(before);
    expect(result.current.targets).toHaveLength(0);
  });
});

describe('element appearance boundary scan', () => {
  it('settles instead of scanning forever over colliding siblings', () => {
    // Nested elements with the same tag and the same text produce the same
    // semantic digest, so this tree is the collision case the scan hits on any
    // real screen.
    let childRenders = 0;
    function CountingChild() {
      childRenders += 1;
      const ref = useRef<HTMLDivElement | null>(null);
      useEffect(() => {
        ref.current?.setAttribute('data-mounted', 'true');
      }, []);
      return (
        <div ref={ref}>
          <div>
            <div>Same text</div>
          </div>
        </div>
      );
    }

    const started = Date.now();
    render(
      <ElementAppearanceBoundary>
        <CountingChild />
      </ElementAppearanceBoundary>,
    );

    expect(Date.now() - started).toBeLessThan(4_000);
    expect(childRenders).toBeLessThan(20);
  });
});

describe('element appearance boundary source contract', () => {
  it('keeps the render-valued targets array out of the scan dependencies', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/components/appearance/ElementAppearanceBoundary.tsx'),
      'utf8',
    );

    // `targets` is a new array on every registration. Listing it here gives
    // `scan` a new identity every render, which re-runs the MutationObserver
    // effect, which scans again.
    expect(source).toContain('}, [c, observationRoot, register, unregister]);');
    expect(source).toContain('targetsRef.current.forEach((target) => {');
  });
});
