import { forwardRef, type ComponentProps, type ElementType } from 'react';

function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

// Surfaces the reduced-motion preference to tests. Real motion/react uses this
// to gate transform animations on the OS `prefers-reduced-motion` setting; the
// mock just exposes the configured value so wiring can be asserted.
function MotionConfig({
  reducedMotion,
  children,
}: {
  reducedMotion?: 'always' | 'never' | 'user';
  children?: React.ReactNode;
}) {
  return <div data-testid="motion-config" data-reduced-motion={reducedMotion}>{children}</div>;
}

// Real `motion/react` memoises its proxy components, so `motion.div` is
// referentially stable for the lifetime of the module. The mock must do the
// same: React keys reconciliation on component *identity*, so returning a
// freshly-created `forwardRef` on every property read makes `<motion.div>`
// a different element type on every render, and React responds by unmounting
// the whole subtree and mounting a replacement. Any DOM node a test captured
// before an `await` is then silently detached — clicks on it never reach
// React's delegated root listener, so the handler simply never fires. That
// produced order-of-microtask flakes in suites that hold an element across an
// await (App.connectors.test.tsx's privacy-banner cases), passing or failing
// purely on whether some unrelated promise happened to re-render in the gap.
const componentCache = new Map<string | symbol, ElementType>();

const motionHandler: ProxyHandler<object> = {
  get(_target, prop: string) {
    const cached = componentCache.get(prop);
    if (cached) return cached;
    const Component = forwardRef<unknown, ComponentProps<ElementType>>((props, ref) => {
      const {
        variants: _variants,
        initial: _initial,
        animate: _animate,
        exit: _exit,
        whileHover: _whileHover,
        whileTap: _whileTap,
        transition: _transition,
        layout: _layout,
        layoutId: _layoutId,
        ...rest
      } = props as Record<string, unknown>;
      const Tag = prop as ElementType;
      return <Tag ref={ref} {...rest} />;
    });
    Component.displayName = `motion.${String(prop)}`;
    componentCache.set(prop, Component as unknown as ElementType);
    return Component;
  },
};

const motion = new Proxy({}, motionHandler);

// jsdom has no matchMedia; components under test always see "no reduced
// motion" so their full animation props stay assertable.
function useReducedMotion(): boolean {
  return false;
}

export { AnimatePresence, MotionConfig, motion, useReducedMotion };
