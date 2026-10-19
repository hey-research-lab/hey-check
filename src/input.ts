import { CHAIN_ID } from './chain.js';
import { usageError } from './errors.js';
import { ADDRESS_RE, DEAD_ADDRESS, ZERO_ADDRESS } from './evm.js';

/**
 * What a reader typed, validated before any request. An address is sent to HEY as `address=`;
 * everything else as `q=`, which HEY matches against published names, tickers, slugs and
 * handles (and answers `ambiguous` rather than guess).
 */
export type CheckInput =
  | { kind: 'address'; raw: string; address: string }
  | { kind: 'ticker' | 'handle' | 'x_profile' | 'name'; raw: string; q: string };

export const MAX_INPUT_LENGTH = 200;

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const TICKER = /^\$[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
/** A project name or slug: letters and digits in any script, with a few joining characters. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+-]{0,79}$/u;
/** Paths on x.com that are not profiles. */
const X_RESERVED = new Set([
  'home',
  'i',
  'intent',
  'share',
  'search',
  'explore',
  'hashtag',
  'settings',
  'messages',
  'notifications',
  'login',
  'signup',
  'tos',
  'privacy',
]);
const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'mobile.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

const HELP =
  'hey-check takes a Robinhood Chain contract address (0x + 40 hex), a $TICKER, a project name or slug, an @handle, or an x.com profile URL.';

/** An empty argument is what a shell leaves of an unquoted or double-quoted `$CHIT`. */
const EMPTY_HINT =
  "A $TICKER must be quoted with single quotes in a shell ('$CHIT'): unquoted or in double quotes, the shell replaces it with nothing.";

/**
 * Quotes that reached hey-check as part of the input: cmd.exe, for one, passes single quotes
 * through. The input is still refused (exit 2); the message says why.
 */
const WRAPPED_IN_QUOTES = /^(['"\u2018\u2019\u201C\u201D]).+(['"\u2018\u2019\u201C\u201D])$/u;

function handleFromXUrl(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw usageError('invalid_input', `That is not a URL hey-check can read. ${HELP}`);
  }
  if (!X_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    throw usageError(
      'invalid_input',
      `hey-check reads x.com and twitter.com profile URLs only. ${HELP}`,
    );
  }
  const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
  if (!HANDLE.test(first) || X_RESERVED.has(first.toLowerCase())) {
    throw usageError('invalid_input', 'That x.com URL does not name a profile (x.com/<handle>).');
  }
  return first;
}

export function parseInput(value: string | undefined): CheckInput {
  if (value === undefined) throw usageError('missing_argument', `Nothing to check. ${HELP}`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/.test(value)) {
    throw usageError('invalid_input', 'The input carries control or invisible characters.');
  }
  const raw = value.trim();
  if (raw === '') throw usageError('missing_argument', `Nothing to check. ${EMPTY_HINT}`);
  if (raw.length > MAX_INPUT_LENGTH) {
    throw usageError('invalid_input', `The input is longer than ${MAX_INPUT_LENGTH} characters.`);
  }
  if (WRAPPED_IN_QUOTES.test(raw)) {
    throw usageError(
      'invalid_input',
      `The input arrived with its quotes (${raw}). Your shell passed them on as part of it — cmd.exe does — so leave them out there: hey-check ${raw.slice(1, -1)}`,
    );
  }

  // CAIP-10 on Robinhood Chain: eip155:4663:0x…
  const caip = /^eip155:(\d+):(.+)$/i.exec(raw);
  if (caip) {
    if (Number(caip[1]) !== CHAIN_ID || caip[1] !== String(CHAIN_ID)) {
      throw usageError(
        'unsupported_chain',
        `HEY supports Robinhood Chain (4663) only; chain ${caip[1]} is not supported.`,
      );
    }
    return parseAddress(raw, caip[2] ?? '');
  }
  if (/^0x/i.test(raw)) return parseAddress(raw, raw);

  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(x|twitter)\.com(\/|$)/i.test(raw)) {
    const handle = handleFromXUrl(raw);
    return { kind: 'x_profile', raw, q: `@${handle}` };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.includes('/')) {
    throw usageError('invalid_input', `hey-check does not read that kind of URL. ${HELP}`);
  }
  if (raw.startsWith('@')) {
    const handle = raw.slice(1);
    if (!HANDLE.test(handle)) {
      throw usageError('invalid_input', 'An @handle is 1–15 letters, digits or underscores.');
    }
    return { kind: 'handle', raw, q: `@${handle}` };
  }
  if (raw.startsWith('$')) {
    if (!TICKER.test(raw)) {
      throw usageError('invalid_input', 'A $TICKER is $ followed by 1–20 letters or digits.');
    }
    return { kind: 'ticker', raw, q: raw };
  }
  if (!NAME.test(raw)) throw usageError('invalid_input', `That does not look like a name. ${HELP}`);
  return { kind: 'name', raw, q: raw };
}

function parseAddress(raw: string, candidate: string): CheckInput {
  const normalised = /^0X/.test(candidate) ? `0x${candidate.slice(2)}` : candidate;
  if (!ADDRESS_RE.test(normalised)) {
    throw usageError(
      'invalid_address',
      'A contract address is 0x followed by exactly 40 hexadecimal characters.',
    );
  }
  const address = normalised.toLowerCase();
  if (address === ZERO_ADDRESS || address === DEAD_ADDRESS) {
    throw usageError(
      'not_a_contract_identity',
      'The zero and burn addresses are not a contract identity.',
    );
  }
  return { kind: 'address', raw, address };
}

/** The query HEY receives for an input, as one `key=value`. */
export function queryFor(input: CheckInput): { key: 'address' | 'q'; value: string } {
  return input.kind === 'address'
    ? { key: 'address', value: input.address }
    : { key: 'q', value: input.q };
}
