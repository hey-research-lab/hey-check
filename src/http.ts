import { CheckError, networkError } from './errors.js';
import { EXIT } from './exit-codes.js';
import { CHECK_VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://heyresearch.xyz';
/** HEY's agent answers are bounded at 64 KB; anything past 1 MiB is not read. */
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const TIMEOUT_MS = 15_000;
/** A run makes at most two requests (an answer, plus one follow-up HEY's answer calls for). */
export const MAX_REQUESTS = 2;
export const USER_AGENT = `hey-check/${CHECK_VERSION} (+https://github.com/hey-research-lab/hey-check)`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RequestRecord = { url: string; status: number | null; requestId: string | null };

export type JsonAnswer = { status: number; body: unknown; requestId: string | null };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** The path of the first `__proto__`, `constructor` or `prototype` key, or null. */
export function forbiddenKeyPath(value: unknown, path = '$', depth = 0): string | null {
  if (depth > 64) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = forbiddenKeyPath(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const hit = forbiddenKeyPath(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        depth + 1,
      );
      if (hit) return hit;
    }
  }
  return null;
}

async function readCapped(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw tooLarge(max);
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(max);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

const tooLarge = (max: number) =>
  new CheckError(
    'response_too_large',
    `HEY's answer was larger than ${max} bytes; hey-check does not read it.`,
    EXIT.NETWORK,
    { retryable: false },
  );

/**
 * The base URL override exists for tests and local mocks only and is not documented in the
 * help: it is not network switching. https origins, or http on localhost/127.0.0.1.
 */
export function parseBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CheckError('invalid_base_url', 'The base URL is not a URL.', EXIT.USAGE);
  }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  const bare = url.pathname === '/' && !url.search && !url.hash && !raw.includes('#');
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || !bare) {
    throw new CheckError(
      'invalid_base_url',
      'The base URL must be an https origin (or http on localhost) with no path or query.',
      EXIT.USAGE,
    );
  }
  return url.origin;
}

/**
 * GETs JSON from HEY: HTTPS, a fixed host, a 15-second timeout, a 1 MiB cap, no cookies, no
 * credentials, and no redirect followed (a 3xx is a failure). A 4xx with a JSON body is an
 * answer (HEY's agent contract carries its status in the body); 429 and 5xx are errors.
 */
export class HeyHttp {
  readonly requests: RequestRecord[] = [];

  constructor(
    private readonly fetchImpl: FetchLike,
    readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async getJson(path: string, params: Record<string, string>): Promise<JsonAnswer> {
    if (this.requests.length >= MAX_REQUESTS) {
      throw new CheckError(
        'request_budget',
        'hey-check makes at most two requests a run.',
        EXIT.NETWORK,
      );
    }
    const url = `${this.baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    const record: RequestRecord = { url, status: null, requestId: null };
    this.requests.push(record);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          'x-hey-integration': `hey-check/${CHECK_VERSION}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw networkError('timeout', `HEY did not answer within ${TIMEOUT_MS / 1000} seconds.`);
      }
      throw networkError('network', 'Could not reach heyresearch.xyz. Check your connection.');
    }
    record.status = response.status;
    record.requestId = response.headers.get('x-request-id');
    const requestId = record.requestId ?? undefined;
    const details = requestId ? { requestId } : {};

    if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
      throw networkError('redirect', 'HEY answered with a redirect; hey-check follows none.', {
        ...details,
        retryable: false,
      });
    }
    if (response.status === 429) {
      const header = Number(response.headers.get('retry-after'));
      const retryAfterSeconds = Number.isFinite(header) && header > 0 ? Math.ceil(header) : 60;
      throw new CheckError(
        'rate_limited',
        `HEY is rate limiting requests from here. Wait ${retryAfterSeconds} seconds and try again.`,
        EXIT.RATE_LIMITED,
        { ...details, retryable: true, retryAfterSeconds },
      );
    }
    if (response.status >= 500) {
      throw networkError(
        'server_error',
        `HEY answered ${response.status}. Try again shortly.`,
        details,
      );
    }
    const text = await readCapped(response, MAX_RESPONSE_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw networkError('invalid_response', `HEY's answer (${response.status}) was not JSON.`, {
        ...details,
        retryable: false,
      });
    }
    const bad = forbiddenKeyPath(body);
    if (bad) {
      throw networkError('invalid_response', `HEY's answer carries a forbidden key at ${bad}.`, {
        ...details,
        retryable: false,
      });
    }
    return { status: response.status, body, requestId: record.requestId };
  }
}
