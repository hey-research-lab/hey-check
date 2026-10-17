import { createMeasure, loadFonts, renderPng } from './card/render.js';
import { run, type CardRenderer } from './run.js';

let renderer: CardRenderer | null = null;

const exitCode = await run(process.argv.slice(2), {
  fetchImpl: (input, init) => fetch(input, init),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: process.env,
  isTTY: process.stdout.isTTY === true,
  now: () => new Date(),
  cwd: process.cwd(),
  cardRenderer: () => {
    if (!renderer) {
      const fonts = loadFonts();
      renderer = { measure: createMeasure(fonts), render: (svg) => renderPng(svg, fonts) };
    }
    return renderer;
  },
});
process.exitCode = exitCode;
