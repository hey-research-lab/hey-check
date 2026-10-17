/**
 * Draws the README's example cards from the saved fixtures (no network): `pnpm card:examples`.
 * The clock is fixed at the fixtures' recording time so the cards do not drift.
 */
import { createMeasure, loadFonts, renderPng } from '../src/card/render.js';
import { run } from '../src/run.js';
import { environment, fixtureFetch, ROUTES } from '../test/helpers.js';

const fonts = loadFonts();
const renderer = { measure: createMeasure(fonts), render: (svg: string) => renderPng(svg, fonts) };

const fetchImpl = fixtureFetch({
  [ROUTES.qChit]: { file: 'live/research-q-chit.json' },
  [ROUTES.addressCopycat]: { file: 'live/research-address-copycat.json' },
  [ROUTES.scanCopycat]: { file: 'live/scan-copycat.json' },
});

const examples: [string[], string][] = [
  [['$CHIT', '--out', 'docs/example-chit.png'], 'docs/example-chit.png'],
  [
    ['0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8', '--out', 'docs/example-copycat.png'],
    'docs/example-copycat.png',
  ],
];

for (const [argv, path] of examples) {
  const { io, out } = environment(fetchImpl, { cardRenderer: () => renderer });
  const code = await run(argv, io);
  if (code !== 0 && code !== 4) {
    process.stderr.write(out.stdout + out.stderr);
    throw new Error(`example ${path} failed with exit code ${code}`);
  }
  process.stdout.write(`wrote ${path}\n`);
}
