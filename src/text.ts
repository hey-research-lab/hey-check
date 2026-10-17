/**
 * Safe text. Everything HEY relays from a source (a project name, a release title) is data from
 * that source, so before it reaches a terminal, a JSON document or the card it is stripped of
 * control characters (which also removes ANSI escape sequences' ESC), invisible and
 * bidirectional-override characters and the Unicode tag block, made well-formed (no lone
 * surrogates), folded onto one line and bounded.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
/* eslint-disable no-misleading-character-class -- variation selectors are matched alone, on purpose */
const INVISIBLE =
  /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
/* eslint-enable no-misleading-character-class */
const WHITESPACE = /\s+/g;

export function cleanText(value: string, max = 280): string {
  const folded = value
    .toWellFormed()
    .replace(/[\t\n\r]/g, ' ')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/\uFFFD/g, '')
    .replace(WHITESPACE, ' ')
    .trim();
  const chars = [...folded];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : folded;
}

/** A URL relayed for a reader to open: https only, cleaned and parseable, else left out. */
export function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 600) return null;
  const cleaned = cleanText(value, 600);
  if (!/^https:\/\/\S+$/.test(cleaned)) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return cleaned;
  } catch {
    return null;
  }
}

/** The first sentence of HEY's answer: the answer, before its detail. */
export function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(?=\s|$)/u.exec(text);
  return (match?.[1] ?? text).trim();
}

export type Style = {
  strong: (s: string) => string;
  dim: (s: string) => string;
};

export const plainStyle: Style = { strong: (s) => s, dim: (s) => s };
export const ansiStyle: Style = {
  strong: (s) => `\u001b[1m${s}\u001b[22m`,
  dim: (s) => `\u001b[2m${s}\u001b[22m`,
};
