import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

const rawError = console.error;
console.error = (...args: unknown[]) => {
  const msg = String(args[0] || '');
  if (msg.includes('ReactDOMTestUtils.act') && msg.includes('deprecated')) return;
  rawError(...args);
};
