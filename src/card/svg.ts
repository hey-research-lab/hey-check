/**
 * The card, built as SVG in code: 1200×675, near-black, one lime accent for HEY's building
 * states and amber only for a namesake notice. Every piece of text passes through `cardText`
 * (control, invisible and bidi characters removed, glyphs the bundled font lacks dropped) and
 * `escapeXml` before it enters the document. The card draws only what `CardModel` holds, and
 * `CardModel` has no field for a price, valuation, liquidity or volume.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;
export const CARD_FONT_FAMILY = 'Geist';

export const COLOR = {
  background: '#07080b',
  frame: '#1b1f26',
  rule: '#1f242c',
  ink: '#f1f3f6',
  secondary: '#a2a9b4',
  lime: '#c2fb03',
  amber: '#f2b84b',
} as const;

export type Tone = 'lime' | 'grey';

export type CardModel = {
  title: string;
  ticker: string | null;
  /** HEY's activity status; null when there is none (not a published project). */
  pill: { label: string; tone: Tone } | null;
  headline: string;
  detail: string | null;
  facts: string[];
  notice: { heading: string; body: string; foot: string } | null;
  footerUrl: string;
  checkedOn: string;
};

/** Width in px of `text` at `size` and `weight` in the card font. */
export type Measure = (
  text: string,
  size: number,
  weight: number,
  letterSpacing?: number,
) => number;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* eslint-disable no-control-regex, no-misleading-character-class -- control characters and variation selectors are matched alone, on purpose */
const NOT_DRAWN =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF]/g;
/* eslint-enable no-control-regex, no-misleading-character-class */
/**
 * Scripts the bundled Geist draws: Latin (with its extensions), Greek, Cyrillic, general
 * punctuation, currency signs and a few symbols. Anything else (emoji, CJK, Arabic …) would draw
 * as nothing, so it is left out of the card; the terminal and JSON keep the full text.
 */
const DRAWN =
  /[ -~\u00A0-\u024F\u0259\u02B0-\u02FF\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2010-\u2027\u2030-\u205E\u20A0-\u20C0\u2100-\u214F\u2190-\u2199\u2212]/u;

/** Card-safe text: invisible and bidi characters removed, undrawable glyphs dropped. */
export function cardText(value: string): string {
  let out = '';
  for (const ch of value.toWellFormed().replace(NOT_DRAWN, '')) if (DRAWN.test(ch)) out += ch;
  return out.replace(/\s+/g, ' ').trim();
}

/** Greedy word wrap into at most `maxLines`; the last line ends with an ellipsis if cut. */
export function wrap(
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
  maxLines: number,
  measure: Measure,
  letterSpacing = 0,
): string[] {
  const fits = (s: string) => measure(s, size, weight, letterSpacing) <= maxWidth;
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (fits(next)) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
      if (lines.length === maxLines) break;
    }
    // A single word wider than the line is cut by characters.
    if (fits(word)) current = word;
    else {
      let part = '';
      for (const ch of word) {
        if (fits(part + ch)) part += ch;
        else {
          lines.push(part);
          if (lines.length === maxLines) break;
          part = ch;
        }
      }
      if (lines.length === maxLines) break;
      current = part;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
    current = '';
  }
  const cut = i < words.length || current !== '';
  if (cut && lines.length > 0) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && !fits(`${last}…`)) last = [...last].slice(0, -1).join('').trimEnd();
    lines[lines.length - 1] = `${last.replace(/[\s,;:.·—-]+$/u, '')}…`;
  }
  return lines;
}

/** The largest size (from `sizes`) at which `text` fits in one line, else null. */
function sizeToFit(
  text: string,
  maxWidth: number,
  sizes: number[],
  weight: number,
  measure: Measure,
  ls: (s: number) => number,
) {
  for (const size of sizes) if (measure(text, size, weight, ls(size)) <= maxWidth) return size;
  return null;
}

type TextOpts = {
  x: number;
  y: number;
  size: number;
  weight: number;
  fill: string;
  anchor?: 'start' | 'end';
  letterSpacing?: number;
};

function textEl(content: string, o: TextOpts): string {
  const anchor = o.anchor === 'end' ? ' text-anchor="end"' : '';
  const ls = o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : '';
  return `<text x="${o.x}" y="${o.y}" font-family="${CARD_FONT_FAMILY}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}"${anchor}${ls} xml:space="preserve">${escapeXml(content)}</text>`;
}

const PAD = 80;
const RIGHT = CARD_WIDTH - PAD;
const CONTENT = RIGHT - PAD;

export function buildCardSvg(model: CardModel, measure: Measure): string {
  const parts: string[] = [];
  const titleLs = (s: number) => -Math.round(s * 0.03);

  // Frame and mark.
  parts.push(
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.background}"/>`,
    `<rect x="24" y="24" width="${CARD_WIDTH - 48}" height="${CARD_HEIGHT - 48}" rx="28" fill="none" stroke="${COLOR.frame}" stroke-width="2"/>`,
    `<rect x="${PAD}" y="77" width="14" height="14" rx="3" fill="${COLOR.lime}"/>`,
    textEl('HEY RESEARCH LAB · DEV CHECK', {
      x: PAD + 28,
      y: 91,
      size: 22,
      weight: 600,
      fill: COLOR.secondary,
      letterSpacing: 2.4,
    }),
    textEl('Robinhood Chain', {
      x: RIGHT,
      y: 91,
      size: 22,
      weight: 400,
      fill: COLOR.secondary,
      anchor: 'end',
    }),
  );

  // Title: one line as large as fits, else two lines.
  const title = cardText(model.title) || 'Untitled';
  let y: number;
  const one = sizeToFit(title, CONTENT, [92, 84, 76, 68], 700, measure, titleLs);
  if (one !== null) {
    y = 196;
    parts.push(
      textEl(title, {
        x: PAD,
        y,
        size: one,
        weight: 700,
        fill: COLOR.ink,
        letterSpacing: titleLs(one),
      }),
    );
  } else {
    const lines = wrap(title, CONTENT, 64, 700, 2, measure, titleLs(64));
    y = 176;
    lines.forEach((line, i) =>
      parts.push(
        textEl(line, {
          x: PAD,
          y: y + i * 70,
          size: 64,
          weight: 700,
          fill: COLOR.ink,
          letterSpacing: titleLs(64),
        }),
      ),
    );
    y += (lines.length - 1) * 70;
  }
  const twoLineTitle = one === null;

  // Ticker and the status pill.
  const ticker = model.ticker ? cardText(model.ticker) : '';
  const hasRow = ticker !== '' || model.pill !== null;
  if (hasRow) {
    y += 70;
    let x = PAD;
    if (ticker) {
      const t = wrap(ticker, 360, 36, 600, 1, measure)[0] ?? '';
      parts.push(textEl(t, { x, y, size: 36, weight: 600, fill: COLOR.secondary }));
      x += measure(t, 36, 600) + 28;
    }
    if (model.pill) {
      const pillLabel = cardText(model.pill.label);
      const pillText = 26;
      const pillW = measure(pillLabel, pillText, 600) + 30 + 26 + 26;
      const pillH = 50;
      const pillY = y - 37;
      const lime = model.pill.tone === 'lime';
      const pillFill = lime ? 'rgba(194,251,3,0.10)' : 'rgba(162,169,180,0.08)';
      const pillStroke = lime ? COLOR.lime : '#3a404a';
      const pillInk = lime ? COLOR.lime : COLOR.secondary;
      parts.push(
        `<rect x="${x}" y="${pillY}" width="${Math.round(pillW)}" height="${pillH}" rx="${pillH / 2}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="2"/>`,
        `<circle cx="${x + 28}" cy="${pillY + pillH / 2}" r="7" fill="${pillInk}"/>`,
        textEl(pillLabel, { x: x + 48, y: pillY + 34, size: pillText, weight: 600, fill: pillInk }),
      );
    }
  }

  // The big line.
  y += hasRow ? (twoLineTitle ? 88 : 96) : 98;
  const headline = cardText(model.headline);
  const hSize =
    sizeToFit(headline, CONTENT, [62, 56, 50, 44], 700, measure, (s) => -Math.round(s * 0.02)) ??
    44;
  const hLines = wrap(headline, CONTENT, hSize, 700, 1, measure, -Math.round(hSize * 0.02));
  parts.push(
    textEl(hLines[0] ?? '', {
      x: PAD,
      y,
      size: hSize,
      weight: 700,
      fill: COLOR.ink,
      letterSpacing: -Math.round(hSize * 0.02),
    }),
  );

  // Footer (fixed at the bottom).
  const ruleY = 562;
  parts.push(
    `<line x1="${PAD}" y1="${ruleY}" x2="${RIGHT}" y2="${ruleY}" stroke="${COLOR.rule}" stroke-width="2"/>`,
  );
  const checked = cardText(model.checkedOn);
  const checkedW = measure(checked, 22, 400);
  const urlMax = CONTENT - checkedW - 32;
  const url = cardText(model.footerUrl);
  const urlSize = sizeToFit(url, urlMax, [26, 24, 22, 20], 600, measure, () => 0) ?? 20;
  parts.push(
    textEl(wrap(url, urlMax, urlSize, 600, 1, measure)[0] ?? '', {
      x: PAD,
      y: 606,
      size: urlSize,
      weight: 600,
      fill: COLOR.ink,
    }),
    textEl(checked, {
      x: RIGHT,
      y: 606,
      size: 22,
      weight: 400,
      fill: COLOR.secondary,
      anchor: 'end',
    }),
    textEl('Builder evidence, not a safety verdict or investment advice.', {
      x: PAD,
      y: 640,
      size: 22,
      weight: 400,
      fill: COLOR.secondary,
    }),
  );

  // Facts sit just above the rule; the detail and notice fill the space between.
  const facts = model.facts.map(cardText).filter(Boolean);
  const factsY = ruleY - 34;
  const bottom = facts.length > 0 ? factsY - 44 : ruleY - 22;
  if (facts.length > 0) {
    const joined = facts.join('   ·   ');
    const fSize = sizeToFit(joined, CONTENT, [28, 26, 24], 400, measure, () => 0) ?? 22;
    const line = wrap(joined, CONTENT, fSize, 400, 1, measure)[0] ?? '';
    parts.push(textEl(line, { x: PAD, y: factsY, size: fSize, weight: 400, fill: COLOR.ink }));
  }

  if (model.notice) {
    const top = y + 36;
    const inner = CONTENT - 56;
    const lineH = 36;
    const foot = cardText(model.notice.foot);
    const footH = foot ? 40 : 0;
    const room = Math.max(1, Math.floor((bottom - top - 54 - footH) / lineH));
    const body = wrap(cardText(model.notice.body), inner, 26, 400, Math.min(3, room), measure);
    const boxH = 54 + body.length * lineH + footH + (foot ? 14 : 6);
    parts.push(
      `<rect x="${PAD}" y="${top}" width="${CONTENT}" height="${boxH}" rx="18" fill="rgba(242,184,75,0.08)" stroke="${COLOR.amber}" stroke-width="2"/>`,
      textEl(cardText(model.notice.heading).toUpperCase(), {
        x: PAD + 28,
        y: top + 40,
        size: 20,
        weight: 700,
        fill: COLOR.amber,
        letterSpacing: 2,
      }),
    );
    body.forEach((line, i) =>
      parts.push(
        textEl(line, {
          x: PAD + 28,
          y: top + 80 + i * lineH,
          size: 26,
          weight: 400,
          fill: COLOR.ink,
        }),
      ),
    );
    if (foot) {
      parts.push(
        textEl(wrap(foot, inner, 22, 400, 1, measure)[0] ?? '', {
          x: PAD + 28,
          y: top + 80 + (body.length - 1) * lineH + 40,
          size: 22,
          weight: 400,
          fill: COLOR.secondary,
        }),
      );
    }
  } else if (model.detail) {
    const detail = cardText(model.detail);
    const first = y + 56;
    const lineH = 42;
    const room = Math.max(0, Math.floor((bottom - first) / lineH) + 1);
    const lines = wrap(detail, CONTENT, 31, 400, Math.min(2, room), measure);
    lines.forEach((line, i) =>
      parts.push(
        textEl(line, {
          x: PAD,
          y: first + i * lineH,
          size: 31,
          weight: 400,
          fill: COLOR.secondary,
        }),
      ),
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${parts.join('')}</svg>`;
}
