import { type CheckResult } from './hey.js';
import { type CheckInput } from './input.js';
import { eventsLine, lastShipLine, shortAddress, statusLabel } from './words.js';

export const TWEET_LIMIT = 280;
/** X shortens every link to t.co: a URL counts as 23 characters, whatever its length. */
export const TWEET_URL_WEIGHT = 23;

const URL_RE = /https?:\/\/\S+/g;

/** X's weighted length: a URL is 23, most Latin text 1 per character, other scripts and emoji 2. */
export function tweetLength(text: string): number {
  let total = 0;
  const rest = text.replace(URL_RE, () => {
    total += TWEET_URL_WEIGHT;
    return '';
  });
  for (const ch of rest) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    total += light ? 1 : 2;
  }
  return total;
}

function fit(build: (name: string) => string, name: string): string {
  let n = [...name];
  let out = build(name);
  while (tweetLength(out) > TWEET_LIMIT && n.length > 4) {
    n = n.slice(0, -1);
    out = build(`${n.join('').trimEnd()}…`);
  }
  return out;
}

/**
 * A post that states the builder fact and links HEY's page: no price, no valuation, no call to
 * act. Null when there is nothing to post (an ambiguous match).
 */
export function tweetText(result: CheckResult, input: CheckInput, now: Date): string | null {
  switch (result.outcome) {
    case 'answered': {
      const { project, builder } = result;
      const sym = project.symbol ? ` ($${project.symbol.replace(/^\$/, '')})` : '';
      const label = statusLabel(builder.activityStatus);
      const facts = `${lastShipLine(builder, now)}; ${eventsLine(builder.meaningfulEvents30d)}.`;
      return fit(
        (name) =>
          `Dev check on ${name}${sym}, Robinhood Chain: ${label}. ${facts}\n\nBuilder evidence from HEY Research Lab, not a safety verdict: ${result.page}`,
        project.name,
      );
    }
    case 'not_found': {
      if (result.address) {
        const n = result.namesakes?.items[0];
        const namesake = n
          ? ` ${n.name} is published on a different contract${n.contractAddress ? `, ${shortAddress(n.contractAddress)}` : ''}. On chain a token is its contract, never its name or ticker.`
          : '';
        const url = result.scanUrl ?? `https://heyresearch.xyz/scan/${result.address}`;
        return fit(
          (name) =>
            `Dev check on ${shortAddress(result.address!)}, Robinhood Chain: not a published project on HEY Research Lab.${name}\n\n${url}`,
          namesake,
        );
      }
      return fit(
        (name) =>
          `Dev check on "${name}", Robinhood Chain: no published project on HEY Research Lab matches it. That is a statement about HEY's index, not a verdict.\n\nhttps://heyresearch.xyz`,
        input.raw,
      );
    }
    case 'ambiguous':
      return null;
  }
}
