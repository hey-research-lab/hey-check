declare const __CHECK_VERSION__: string | undefined;

/** Stamped by tsup at build time; tests and `tsx` runs see the development marker. */
export const CHECK_VERSION: string =
  typeof __CHECK_VERSION__ === 'string' && __CHECK_VERSION__ !== ''
    ? __CHECK_VERSION__
    : '0.0.0-dev';
