// Jest test setup file
// This file runs before each test file

// Mock import.meta.url for CommonJS Jest environment
// This is needed because token-list.service.ts uses import.meta.url
if (typeof globalThis.import === 'undefined') {
  globalThis.import = {
    meta: {
      url: 'file:///mock-url',
    },
  };
}

// Also provide it as a global for fileURLToPath usage
globalThis.__import_meta_url__ = 'file:///mock-url';

