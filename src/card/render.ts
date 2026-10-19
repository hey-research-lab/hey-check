import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type * as resvg from '@resvg/resvg-js';

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

type ResvgModule = typeof resvg;

let resvgModule: ResvgModule | undefined;

/**
 * The rasteriser is a native module with prebuilt binaries for the common platforms only. It is
 * loaded on first use, never at start-up, so `--no-card`, `--json --no-card` and `--quiet --no-card`
 * still answer on a platform it has no build for; drawing a card there fails as
 * `card_not_written` (exit 1) after the answer, with a message that names the way out.
 */
export function loadResvg(
  load: (id: string) => unknown = createRequire(import.meta.url),
): ResvgModule {
  if (resvgModule) return resvgModule;
  try {
    resvgModule = load('@resvg/resvg-js') as ResvgModule;
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new Error(
      `the card renderer (@resvg/resvg-js) could not load on ${process.platform}-${process.arch}; run with --no-card for the text answer (${reason})`,
      { cause: error },
    );
  }
  return resvgModule;
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
function options(fonts: Fonts): resvg.ResvgRenderOptions {
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
    const { Resvg } = loadResvg();
    const width = (t: string) => new Resvg(svg(t), options(fonts)).getBBox()?.width ?? 0;
    const bars = width('||');
    const value = text === '' ? 0 : Math.max(0, width(`|${text}|`) - bars);
    cache.set(key, value);
    return value;
  };
}

export function renderPng(svg: string, fonts: Fonts): Buffer {
  const { Resvg } = loadResvg();
  return new Resvg(svg, options(fonts)).render().asPng();
}
