import { type Builder, type Namesake } from './hey.js';

/** HEY's activity statuses in HEY's words. Anything else HEY may add reads as Unknown. */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  SHIPPING: 'Shipping',
  ACTIVE: 'Active',
  RESUMED: 'Resumed',
  QUIET: 'Quiet',
  DORMANT: 'Dormant',
  UNKNOWN: 'Unknown',
};

export const statusLabel = (code: string): string => STATUS_LABEL[code] ?? 'Unknown';

/** Shipping, Active and Resumed are HEY's building states; the card marks only these. */
export const isBuilding = (code: string): boolean =>
  code === 'SHIPPING' || code === 'ACTIVE' || code === 'RESUMED';

export const BOUNDARY = 'Builder evidence, not a safety verdict or investment advice.';

export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "3 days ago", "5 hours ago", "under an hour ago"; a future time (clock skew) is "just now". */
export function ago(at: string, now: Date): string {
  const ms = now.getTime() - Date.parse(at);
  if (!Number.isFinite(ms) || ms < HOUR) return ms < 0 ? 'just now' : 'under an hour ago';
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(ms / DAY);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** `2026-10-14` (UTC). */
export const isoDay = (at: string): string => new Date(Date.parse(at)).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `17 Oct 2026` (UTC). */
export function humanDay(at: Date): string {
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** The one big line: when HEY last recorded a meaningful ship. */
export function lastShipLine(builder: Builder, now: Date): string {
  if (builder.lastMeaningfulShipAt) return `Last shipped ${ago(builder.lastMeaningfulShipAt, now)}`;
  if (builder.meaningfulEvents30d === 0) return 'No meaningful ship recorded in 30 days';
  return 'Last ship not known to HEY';
}

/** "4 meaningful events in 30 days"; HEY's count, or "not measured" when it sent none. */
export function eventsLine(n: number | null): string {
  if (n === null) return 'Meaningful events in 30 days: not measured';
  return `${n} meaningful event${n === 1 ? '' : 's'} in 30 days`;
}

export function verificationWords(v: string | null): string {
  switch (v) {
    case 'VERIFIED':
      return 'token verified';
    case 'UNVERIFIED':
      return 'token not verified';
    case 'MISMATCH':
      return "token mismatch: the project's own site names another contract";
    default:
      return 'token verification unknown';
  }
}

function sharesPhrase(shares: string | null): string {
  switch (shares) {
    case 'name_and_ticker':
      return 'carries the same name and ticker';
    case 'name':
      return 'carries the same name';
    case 'ticker':
      return 'carries the same ticker';
    default:
      return 'carries its name or ticker';
  }
}

/**
 * The namesake notice, as facts: which published project carries this token's name or ticker
 * on another contract. No verdict word: a shared name is a fact, not a finding.
 */
export function namesakeSentence(n: Namesake): string {
  const where = n.contractAddress
    ? `on a different contract, ${shortAddress(n.contractAddress)}`
    : 'on a different contract';
  const ending = n.sharesAddressEnding ? ', and its address ends in the same four characters' : '';
  return `${n.name} is published on HEY ${where}; this token ${sharesPhrase(n.shares)}${ending}.`;
}

export const CONTRACT_IS_IDENTITY = 'On chain a token is its contract, never its name or ticker.';
