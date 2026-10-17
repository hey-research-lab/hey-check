import { defineConfig } from 'tsup';

/** Builds scripts/card-examples.ts for `pnpm card:examples`; the output is never published. */
export default defineConfig({
  entry: { 'card-examples': 'scripts/card-examples.ts' },
  outDir: 'node_modules/.cache/hey-check',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  dts: false,
  splitting: false,
  define: { __CHECK_VERSION__: JSON.stringify('examples') },
});
