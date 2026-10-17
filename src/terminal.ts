import { type Answered, type Ambiguous, type CheckResult, type NotFound } from './hey.js';
import { type CheckInput } from './input.js';
import { type Style } from './text.js';
import {
  BOUNDARY,
  CONTRACT_IS_IDENTITY,
  ago,
  isoDay,
  lastShipLine,
  namesakeSentence,
  shortAddress,
  statusLabel,
  verificationWords,
} from './words.js';

export type TerminalContext = {
  input: CheckInput;
  now: Date;
  style: Style;
  /** Where the card was written, or null when it was not. */
  cardPath: string | null;
};

const LABEL_WIDTH = 14;
const row = (s: Style, label: string, value: string) =>
  `  ${s.dim(label.padEnd(LABEL_WIDTH))}${value}`;
const more = (value: string) => `  ${' '.repeat(LABEL_WIDTH)}${value}`;

function answered(r: Answered, ctx: TerminalContext): string[] {
  const s = ctx.style;
  const lines: string[] = [];
  if (r.answer) lines.push(s.strong(r.answer), '');
  const ticker = r.project.symbol ? `  $${r.project.symbol.replace(/^\$/, '')}` : '';
  lines.push(`  ${s.strong(r.project.name)}${ticker}`);
  lines.push(row(s, 'Status', s.strong(statusLabel(r.builder.activityStatus))));

  const at = r.builder.lastMeaningfulShipAt;
  if (at) {
    const title = r.latestShip?.title ? ` — ${r.latestShip.title}` : '';
    lines.push(row(s, 'Last ship', `${ago(at, ctx.now)} (${isoDay(at)})${title}`));
    if (r.latestShip?.sourceUrl) lines.push(more(s.dim(r.latestShip.sourceUrl)));
  } else {
    lines.push(row(s, 'Last ship', lastShipLine(r.builder, ctx.now)));
  }
  const n = r.builder.meaningfulEvents30d;
  lines.push(
    row(
      s,
      'Last 30 days',
      n === null ? 'not measured' : `${n} meaningful event${n === 1 ? '' : 's'}`,
    ),
  );

  if (r.contract) {
    const v = r.contract.verification;
    lines.push(
      row(s, 'Contract', `${r.contract.address} · ${verificationWords(v)}${v ? ` (${v})` : ''}`),
    );
  } else {
    lines.push(row(s, 'Contract', 'no token on HEY’s record for this project'));
  }
  if (r.askedAddress) lines.push(row(s, 'You asked', r.askedAddress));

  const shown = r.unknowns.slice(0, 2);
  shown.forEach((u, i) => {
    const value = `${u.category} — ${u.text}`;
    lines.push(i === 0 ? row(s, 'Unknowns', value) : more(value));
  });
  if (r.unknowns.length > shown.length) {
    lines.push(more(s.dim(`+${r.unknowns.length - shown.length} more (--json lists them all)`)));
  }
  lines.push(row(s, 'Page', r.page));
  if (ctx.cardPath) lines.push(row(s, 'Card', ctx.cardPath));
  lines.push('');
  if (r.citation) lines.push(s.dim(r.citation));
  lines.push(s.dim(BOUNDARY));
  return lines;
}

function ambiguous(r: Ambiguous, ctx: TerminalContext): string[] {
  const s = ctx.style;
  const lines = [s.strong('More than one published project matches. HEY does not guess.'), ''];
  const width = Math.min(44, Math.max(12, ...r.candidates.map((c) => c.slug.length)));
  for (const c of r.candidates) {
    const name = c.name ?? c.slug;
    const sym = c.symbol ? ` ($${c.symbol.replace(/^\$/, '')})` : '';
    const status = c.activityStatus ? ` · ${statusLabel(c.activityStatus)}` : '';
    const token = c.tokenAddress ? ` · ${shortAddress(c.tokenAddress)}` : '';
    lines.push(`  ${s.strong(c.slug.padEnd(width))}  ${name}${sym}${status}${token}`);
  }
  const total = r.candidatesTotal;
  if (total && total.count > r.candidates.length) {
    lines.push(
      '',
      s.dim(
        `  Showing ${r.candidates.length} of ${total.atLeast ? 'at least ' : ''}${total.count} matches.`,
      ),
    );
  }
  const example = r.candidates[0]?.slug ?? '<slug>';
  lines.push(
    '',
    `Pick one: hey-check ${example}   (or pass the token's 0x contract address)`,
    '',
    s.dim(BOUNDARY),
  );
  return lines;
}

function notFound(r: NotFound, ctx: TerminalContext): string[] {
  const s = ctx.style;
  const subject = r.address ?? ctx.input.raw;
  const lines = [s.strong(`${subject} is not a published project on HEY.`), '', `  ${r.message}`];
  if (r.namesakes && r.namesakes.items.length > 0) {
    lines.push('', `  ${s.strong('Same name or ticker on another contract')}`);
    // HEY's not-found answer usually says this already, in its own words; say it once.
    if (!/different contract/i.test(r.message)) {
      lines.push(`  ${r.namesakes.line ?? namesakeSentence(r.namesakes.items[0]!)}`);
    }
    for (const n of r.namesakes.items) {
      const sym = n.symbol ? ` ($${n.symbol.replace(/^\$/, '')})` : '';
      const addr = n.contractAddress ? ` · ${n.contractAddress}` : '';
      lines.push(`    ${n.name}${sym}${addr}${n.url ? ` · ${n.url}` : ''}`);
    }
    if (r.namesakes.total > r.namesakes.items.length) {
      lines.push(`    ${s.dim(`+${r.namesakes.total - r.namesakes.items.length} more`)}`);
    }
  } else if (r.address && !r.namesakesRead) {
    lines.push('', s.dim('  HEY’s list of published namesakes could not be read this time.'));
  }
  lines.push('');
  if (r.scanUrl) lines.push(row(s, 'Scan', r.scanUrl));
  if (ctx.cardPath) lines.push(row(s, 'Card', ctx.cardPath));
  if (r.scanUrl || ctx.cardPath) lines.push('');
  if (r.address && !r.message.includes(CONTRACT_IS_IDENTITY))
    lines.push(s.dim(CONTRACT_IS_IDENTITY));
  lines.push(s.dim(BOUNDARY));
  return lines;
}

export function renderTerminal(result: CheckResult, ctx: TerminalContext): string[] {
  switch (result.outcome) {
    case 'answered':
      return answered(result, ctx);
    case 'ambiguous':
      return ambiguous(result, ctx);
    case 'not_found':
      return notFound(result, ctx);
  }
}

/** --quiet: one line. */
export function quietLine(result: CheckResult, now: Date): string {
  switch (result.outcome) {
    case 'answered':
      return `${result.project.slug}\t${statusLabel(result.builder.activityStatus)}\t${lastShipLine(result.builder, now)}`;
    case 'ambiguous':
      return result.candidates.map((c) => c.slug).join('\n');
    case 'not_found':
      return 'not_published';
  }
}
