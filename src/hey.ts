import { CHAIN_ID } from './chain.js';
import { CheckError, networkError } from './errors.js';
import { ADDRESS_RE } from './evm.js';
import { EXIT } from './exit-codes.js';
import { type HeyHttp } from './http.js';
import { queryFor, type CheckInput } from './input.js';
import { cleanText, cleanUrl, firstSentence } from './text.js';

/**
 * Reads HEY's answer and keeps only the builder evidence. HEY's agent answer also carries market
 * and usage context; hey-check never reads those fields, so nothing about a token's price,
 * valuation, liquidity or volume can reach the terminal, the JSON or the card.
 */

export const RESEARCH_PATH = '/api/agent/research_project';
export const SCAN_PATH = '/api/v1/scan';
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export type Project = {
  slug: string;
  name: string;
  symbol: string | null;
  url: string;
  researchLevel: string | null;
  catalogStatus: string | null;
};

export type Builder = {
  activityStatus: string;
  activityMeasured: boolean | null;
  lastMeaningfulShipAt: string | null;
  meaningfulEvents30d: number | null;
};

export type LatestShip = {
  id: string | null;
  title: string | null;
  occurredAt: string | null;
  precision: string | null;
  sourceUrl: string | null;
  receiptUrl: string | null;
};

export type Contract = { address: string; verification: string | null };

export type Unknown = {
  category: string;
  dimension: string | null;
  text: string;
  reason: string | null;
};

export type Candidate = {
  slug: string;
  name: string | null;
  symbol: string | null;
  url: string | null;
  activityStatus: string | null;
  catalogStatus: string | null;
  tokenAddress: string | null;
};

export type Namesake = {
  name: string;
  slug: string | null;
  symbol: string | null;
  contractAddress: string | null;
  shares: string | null;
  sharesAddressEnding: boolean | null;
  url: string | null;
};

export type Namesakes = { total: number; items: Namesake[]; line: string | null };

export type Answered = {
  outcome: 'answered';
  answer: string | null;
  project: Project;
  builder: Builder;
  latestShip: LatestShip | null;
  contract: Contract | null;
  /** The contract the reader asked about, when it is not the project's token. */
  askedAddress: string | null;
  unknowns: Unknown[];
  citation: string | null;
  page: string;
  asOf: string | null;
  disclaimer: string | null;
};

export type Ambiguous = {
  outcome: 'ambiguous';
  message: string;
  candidates: Candidate[];
  candidatesTotal: { count: number; atLeast: boolean } | null;
  asOf: string | null;
  disclaimer: string | null;
};

export type NotFound = {
  outcome: 'not_found';
  message: string;
  /** The contract asked about, when the input was an address. */
  address: string | null;
  scanUrl: string | null;
  namesakes: Namesakes | null;
  /** Whether HEY's scan card (which lists published namesakes) was read: unread is not "none". */
  namesakesRead: boolean;
  asOf: string | null;
  disclaimer: string | null;
};

export type CheckResult = Answered | Ambiguous | NotFound;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rawStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** A HEY text object (`{ text, contentOrigin }`) or a plain string, cleaned. */
const text = (v: unknown, max = 280): string | null => {
  const s = rawStr(v) ?? rawStr(obj(v)?.text);
  if (s === null) return null;
  const cleaned = cleanText(s, max);
  return cleaned === '' ? null : cleaned;
};
/** A state word as HEY sends it (`SHIPPING`, `VERIFIED` …): upper snake case only. */
const code = (v: unknown): string | null =>
  typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/.test(v) ? v : null;
const lowerCode = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z][a-z0-9_]{0,60}$/.test(v) ? v : null;
const instant = (v: unknown): string | null =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/.test(v) &&
  !Number.isNaN(Date.parse(v))
    ? v
    : null;
const address = (v: unknown): string | null =>
  typeof v === 'string' && ADDRESS_RE.test(v) ? v.toLowerCase() : null;
const slug = (v: unknown): string | null => (typeof v === 'string' && SLUG.test(v) ? v : null);
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
const evidenceId = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z0-9]{2,20}:[A-Za-z0-9:._-]{1,200}$/.test(v) ? v : null;

function disclaimerOf(body: Obj): string | null {
  return text(obj(body.boundaries)?.disclaimer, 600);
}

function parseAnswered(body: Obj, input: CheckInput): Answered {
  const data = obj(body.data);
  const identity = obj(data?.identity);
  const subject = obj(obj(body.subject)?.project);
  const projectSlug = slug(identity?.slug) ?? slug(subject?.slug);
  if (!data || !identity || !projectSlug) {
    throw networkError('invalid_response', "HEY's answer did not carry the project it names.", {
      retryable: false,
    });
  }
  const page =
    cleanUrl(obj(body.links)?.page) ??
    cleanUrl(identity.url) ??
    `https://heyresearch.xyz/project/${projectSlug}`;
  const state = obj(data.builderState);
  const change = obj(data.latestMeaningfulChange);
  const evidence = obj(arr(change?.evidence)[0]);
  const token = obj(obj(data.contractIdentity)?.token);
  const tokenAddress = address(token?.address);

  const seen = new Set<string>();
  const unknowns: Unknown[] = [];
  for (const entry of arr(body.unknowns)) {
    const u = obj(entry);
    const category = code(u?.category);
    const statement = text(u?.statement);
    if (!u || !category || !statement) continue;
    const key = `${category}|${statement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unknowns.push({
      category,
      dimension: rawStr(u.dimension) ? cleanText(String(u.dimension), 60) : null,
      text: statement,
      reason: lowerCode(u.reason),
    });
  }

  const asked = input.kind === 'address' ? input.address : null;
  const answerText = text(body.answer, 1200);
  return {
    outcome: 'answered',
    answer: answerText ? firstSentence(answerText) : null,
    project: {
      slug: projectSlug,
      name: text(identity.name, 120) ?? text(subject?.name, 120) ?? projectSlug,
      symbol: text(identity.symbol, 24),
      url: cleanUrl(identity.url) ?? page,
      researchLevel: code(identity.researchLevel),
      catalogStatus: code(identity.catalogStatus),
    },
    builder: {
      activityStatus: code(state?.activityStatus) ?? 'UNKNOWN',
      activityMeasured:
        typeof state?.activityMeasured === 'boolean' ? state.activityMeasured : null,
      lastMeaningfulShipAt: instant(state?.lastMeaningfulShipAt),
      meaningfulEvents30d: count(state?.meaningfulEvents30d),
    },
    latestShip: change
      ? {
          id: evidenceId(change.id),
          title: text(change.summary, 200),
          occurredAt: instant(change.occurredAt),
          precision: code(change.precision),
          sourceUrl: cleanUrl(evidence?.sourceUrl) ?? cleanUrl(obj(change.summary)?.sourceUrl),
          receiptUrl: cleanUrl(evidence?.receiptUrl),
        }
      : null,
    contract: tokenAddress
      ? { address: tokenAddress, verification: code(token?.verification) }
      : null,
    askedAddress: asked && asked !== tokenAddress ? asked : null,
    unknowns,
    citation: text(obj(body.citation)?.text, 400),
    page,
    asOf: instant(body.asOf),
    disclaimer: disclaimerOf(body),
  };
}

function parseAmbiguous(body: Obj, error: Obj): Ambiguous {
  const candidates: Candidate[] = [];
  for (const entry of arr(error.candidates)) {
    const c = obj(entry);
    const s = slug(c?.slug);
    if (!c || !s) continue;
    const token = obj(c.token);
    candidates.push({
      slug: s,
      name: text(c.name, 120),
      symbol: text(c.symbol, 24),
      url: cleanUrl(c.url),
      activityStatus: code(c.activityStatus),
      catalogStatus: code(c.catalogStatus),
      tokenAddress: token && token.chainId === CHAIN_ID ? address(token.address) : null,
    });
  }
  const total = obj(error.candidatesTotal);
  const totalCount = count(total?.count);
  return {
    outcome: 'ambiguous',
    message:
      text(error.message, 1200) ??
      'More than one published project matches. HEY does not guess: pick one.',
    candidates,
    candidatesTotal:
      totalCount === null ? null : { count: totalCount, atLeast: total?.atLeast === true },
    asOf: instant(body.asOf),
    disclaimer: disclaimerOf(body),
  };
}

function parseNamesakes(scan: unknown): Namesakes | null {
  const block = obj(obj(scan)?.publishedNamesakes);
  if (!block) return null;
  const items: Namesake[] = [];
  for (const entry of arr(block.items)) {
    const n = obj(entry);
    const name = text(n?.name, 120);
    if (!n || !name) continue;
    items.push({
      name,
      slug: slug(n.slug),
      symbol: text(n.symbol, 24),
      contractAddress: address(n.contractAddress),
      shares: lowerCode(n.shares),
      sharesAddressEnding:
        typeof n.sharesAddressEnding === 'boolean' ? n.sharesAddressEnding : null,
      url: cleanUrl(n.url),
    });
  }
  const total = count(block.total) ?? items.length;
  if (total === 0 && items.length === 0) return null;
  return { total, items, line: text(block.line, 600) };
}

function bodyOf(answer: { body: unknown }): Obj {
  const body = obj(answer.body);
  if (!body || typeof body.status !== 'string') {
    throw networkError('invalid_response', "HEY's answer was not an agent answer.", {
      retryable: false,
    });
  }
  return body;
}

/** One question to HEY, at most two requests: the answer, plus a follow-up it calls for. */
export async function check(input: CheckInput, http: HeyHttp): Promise<CheckResult> {
  const first = queryFor(input);
  let body = bodyOf(await http.getJson(RESEARCH_PATH, { [first.key]: first.value }));

  // An exact slug among the candidates is that project, not a guess: ask for it by slug.
  if (body.status === 'invalid_request' && obj(body.error)?.code === 'ambiguous') {
    const typed = input.kind === 'name' ? input.q.toLowerCase() : null;
    const exact =
      typed && SLUG.test(typed)
        ? arr(obj(body.error)?.candidates).some((c) => obj(c)?.slug === typed)
        : false;
    if (typed && exact) {
      body = bodyOf(await http.getJson(RESEARCH_PATH, { project: typed }));
    }
  }

  const error = obj(body.error);
  switch (body.status) {
    case 'ok':
      return parseAnswered(body, input);
    case 'invalid_request':
      if (error?.code === 'ambiguous') return parseAmbiguous(body, error);
      throw new CheckError(
        lowerCode(error?.code) ?? 'invalid_request',
        text(error?.message, 600) ?? 'HEY refused the request.',
        EXIT.REFUSED,
      );
    case 'not_found': {
      const message =
        text(error?.message, 1200) ??
        text(body.answer, 1200) ??
        'HEY holds no published project for that.';
      if (input.kind !== 'address') {
        return {
          outcome: 'not_found',
          message,
          address: null,
          scanUrl: null,
          namesakes: null,
          namesakesRead: false,
          asOf: instant(body.asOf),
          disclaimer: disclaimerOf(body),
        };
      }
      // The scan card names any published project carrying this token's name or ticker on
      // another contract. If it cannot be read, HEY's own answer above still says so in words.
      let scanBody: Obj | null = null;
      try {
        const scan = await http.getJson(SCAN_PATH, {
          chain: String(CHAIN_ID),
          token: input.address,
        });
        scanBody = scan.status < 400 ? obj(scan.body) : null;
      } catch {
        scanBody = null;
      }
      return {
        outcome: 'not_found',
        message,
        address: input.address,
        scanUrl: cleanUrl(scanBody?.scan_url) ?? `https://heyresearch.xyz/scan/${input.address}`,
        namesakes: parseNamesakes(scanBody),
        namesakesRead: scanBody !== null,
        asOf: instant(body.asOf),
        disclaimer: disclaimerOf(body),
      };
    }
    case 'unavailable':
      throw networkError(
        'unavailable',
        text(error?.message, 600) ?? 'HEY could not answer right now. Try again shortly.',
      );
    case 'moved':
      throw new CheckError(
        'moved',
        text(body.answer, 600) ?? 'HEY says this project moved; check its new name or slug.',
        EXIT.REFUSED,
      );
    default:
      throw networkError('invalid_response', `HEY answered an unknown status.`, {
        retryable: false,
      });
  }
}
