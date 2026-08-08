import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.js does not set test.globals=true, so @testing-library/react's
// own auto-cleanup (which detects a global afterEach) never fires. Without this,
// DOM from one test leaks into the next within the same file.
afterEach(cleanup);

// jsdom has no IntersectionObserver; motion's useInView (used by animate-ui's
// CountingNumber and any other inView-driven primitive) needs one to exist.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

// jsdom has no ResizeObserver; Radix's Select (and other size-measuring primitives) needs one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom implements no pointer-capture APIs at all; Radix's Select (and other
// pointer-driven primitives) call these unconditionally on interaction.
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no matchMedia; anything reading prefers-reduced-motion/prefers-color-scheme needs one.
if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom ships no canvas 2D rendering backend (would need the native `canvas`
// package); stub getContext with a no-op surface so components that draw on
// mount don't crash under test — pixel output is out of scope here.
const NOOP_2D_CONTEXT = new Proxy(
  {},
  {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: () => true,
  },
);
HTMLCanvasElement.prototype.getContext = function getContext(type) {
  return type === '2d' ? NOOP_2D_CONTEXT : null;
};
