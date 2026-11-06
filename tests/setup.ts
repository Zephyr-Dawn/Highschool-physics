import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { clearParameterExpressionMemory } from '../src/math/parameterExpressionMemory';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearParameterExpressionMemory();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
}

// jsdom logs a noisy "not implemented" error for every WebGL probe.
// The P01 fallback path only needs to observe that no context is available.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  writable: true,
  value: () => null,
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
