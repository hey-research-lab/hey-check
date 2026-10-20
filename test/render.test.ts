import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadResvg } from '../src/card/render.js';

describe('the card renderer', () => {
  it('is loaded on first use, never when hey-check starts', () => {
    const source = readFileSync(new URL('../src/card/render.ts', import.meta.url), 'utf8');
    // A value import would load the native module at start-up, so a platform with no prebuilt
    // binary could not get even the text answer with --no-card.
    expect(source).not.toMatch(/^import\s+\{[^}]*\bResvg\b[^}]*\}\s+from\s+'@resvg\/resvg-js'/m);
    expect(source).toMatch(/^import type \* as resvg from '@resvg\/resvg-js';$/m);
  });

  it('names the way out when it has no build for this platform', () => {
    const missing = () => {
      throw new Error("Cannot find module '@resvg/resvg-js-plan9-x64'\nRequire stack:\n- …");
    };
    expect(() => loadResvg(missing)).toThrow(
      /could not load on [\w-]+; run with --no-card for the text answer \(Cannot find module '@resvg\/resvg-js-plan9-x64'\)$/,
    );
  });
});
