import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';

import { CARD_FONT_FAMILY, type Measure } from './svg.js';

export const FONT_FILES = ['Geist-Regular.ttf', 'Geist-SemiBold.ttf', 'Geist-Bold.ttf'] as const;

/**
 * The bundled fonts live in `assets/fonts` at the package root. The CLI bundle is `dist/cli.js`
 * and the sources are `src/card/*.ts`, so look upward from this module for the first directory
 * that holds them.
 */
export function defaultFontDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i += 1) {
    const candidate = join(dir, 'assets', 'fonts');
    if (existsSync(join(candidate, FONT_FILES[0]))) return candidate;
    dir = dirname(dir);
  }
  throw new Error('The card font (assets/fonts/Geist-*.ttf) is missing from this install.');
}

export type Fonts = { files: string[] };

export function loadFonts(fontDir: string = defaultFontDir()): Fonts {
  const files = FONT_FILES.map((f) => join(fontDir, f));
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`The card font ${file} is missing from this install.`);
  }
  return { files };
}

/** Only the bundled font, never a system font: the card renders the same on every machine. */
function options(fonts: Fonts): ResvgRenderOptions {
  return {
    font: {
      fontFiles: fonts.files,
      loadSystemFonts: false,
      defaultFontFamily: CARD_FONT_FAMILY,
    },
    fitTo: { mode: 'original' },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  };
}

const escapeForMeasure = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text width measured by laying the text out with the card's own font (cached). */
export function createMeasure(fonts: Fonts): Measure {
  const cache = new Map<string, number>();
  return (text, size, weight, letterSpacing = 0) => {
    const key = `${size}|${weight}|${letterSpacing}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    // A leading and trailing "|" keep spaces at the ends in the measured run; their width is
    // measured once and taken off.
    const svg = (t: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="400"><text x="0" y="300" font-family="${CARD_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}" xml:space="preserve">${escapeForMeasure(t)}</text></svg>`;
    const width = (t: string) => new Resvg(svg(t), options(fonts)).getBBox()?.width ?? 0;
    const bars = width('||');
    const value = text === '' ? 0 : Math.max(0, width(`|${text}|`) - bars);
    cache.set(key, value);
    return value;
  };
}

export function renderPng(svg: string, fonts: Fonts): Buffer {
  return new Resvg(svg, options(fonts)).render().asPng();
}
