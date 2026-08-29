import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const designRoot = resolve(__dirname, '../../');

export default defineConfig({
  resolve: {
    alias: {
      '@open-design/components': resolve(designRoot, 'packages/components/src/index.ts'),
      '@open-design/contracts': resolve(designRoot, 'packages/contracts/src/index.ts'),
      '@open-design/host': resolve(designRoot, 'packages/host/src/index.ts'),
      '@open-design/platform': resolve(designRoot, 'packages/platform/src/index.ts'),
      '@open-design/release': resolve(designRoot, 'packages/release/src/index.ts'),
      '@open-design/sidecar': resolve(designRoot, 'packages/sidecar/src/index.ts'),
      '@open-design/sidecar-proto': resolve(designRoot, 'packages/sidecar-proto/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'tests/components/CustomSelect.test.tsx',
      'tests/components/PluginInputsForm.test.tsx',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
