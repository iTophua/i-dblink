/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

declare module 'vitest' {
  export interface Assertion<T> {
    toBeInTheDocument(): T;
  }
}

declare global {
  // Node.js global
  var global: typeof globalThis;
}
