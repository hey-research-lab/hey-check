import { CAIP2, CHAIN_ID, CHAIN_NAME } from './chain.js';
import { type CheckError } from './errors.js';
import { type CheckResult } from './hey.js';
import { type RequestRecord } from './http.js';
import { queryFor, type CheckInput } from './input.js';
import { BOUNDARY, statusLabel } from './words.js';

export const JSON_SCHEMA = 'hey.check/v1';

/**
 * The stable machine object (`hey.check/v1`). It is built from HEY's answer, keeps HEY's state
 * words verbatim, and holds builder evidence only: HEY's market and usage context are never
 * read, so no price, valuation, liquidity or volume field exists here. A value HEY did not send
 * is `null`; it is never filled with 0, false or "none".
 */
export type CheckDocument = {
  schema: typeof JSON_SCHEMA;
  ok: boolean;
  outcome: 'answered' | 'ambiguous' | 'not_found' | null;
  chain: { name: string; chainId: number; caip2: string };
  input: { raw: string; kind: string; sent: Record<string, string> } | null;
  answer: string | null;
  project: {
    slug: string;
    name: string;
    symbol: string | null;
    url: string;
    researchLevel: string | null;
    catalogStatus: string | null;
  } | null;
  builder: {
    activityStatus: string;
    activityLabel: string;
    activityMeasured: boolean | null;
    lastMeaningfulShipAt: string | null;
    meaningfulEvents30d: number | null;
  } | null;
  latestShip: {
    id: string | null;
    title: string | null;
    occurredAt: string | null;
    precision: string | null;
    sourceUrl: string | null;
    receiptUrl: string | null;
  } | null;
  contract: { address: string; verification: string | null } | null;
  unknowns:
    { category: string; dimension: string | null; text: string; reason: string | null }[] | null;
  candidates:
    | {
        slug: string;
        name: string | null;
        symbol: string | null;
        url: string | null;
        activityStatus: string | null;
        catalogStatus: string | null;
        tokenAddress: string | null;
      }[]
    | null;
  candidatesTotal: { count: number; atLeast: boolean } | null;
  notFound: {
    message: string;
    address: string | null;
    scanUrl: string | null;
    namesakesRead: boolean;
    namesakes: {
      total: number;
      line: string | null;
      items: {
        name: string;
        slug: string | null;
        symbol: string | null;
        contractAddress: string | null;
        shares: string | null;
        sharesAddressEnding: boolean | null;
        url: string | null;
      }[];
    } | null;
  } | null;
  citation: string | null;
  page: string | null;
  card: { path: string } | null;
  tweet: string | null;
  boundary: string;
  disclaimer: string | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId?: string;
    retryAfterSeconds?: number;
  } | null;
  source: { requests: RequestRecord[]; asOf: string | null; fetchedAt: string };
};

export function emptyDocument(
  now: Date,
  input: CheckInput | null,
  requests: RequestRecord[],
): CheckDocument {
  const sent = input ? queryFor(input) : null;
  return {
    schema: JSON_SCHEMA,
    ok: false,
    outcome: null,
    chain: { name: CHAIN_NAME, chainId: CHAIN_ID, caip2: CAIP2 },
    input:
      input && sent ? { raw: input.raw, kind: input.kind, sent: { [sent.key]: sent.value } } : null,
    answer: null,
    project: null,
    builder: null,
    latestShip: null,
    contract: null,
    unknowns: null,
    candidates: null,
    candidatesTotal: null,
    notFound: null,
    citation: null,
    page: null,
    card: null,
    tweet: null,
    boundary: BOUNDARY,
    disclaimer: null,
    error: null,
    source: { requests, asOf: null, fetchedAt: now.toISOString() },
  };
}

export function resultDocument(
  result: CheckResult,
  base: CheckDocument,
  extra: { cardPath: string | null; tweet: string | null },
): CheckDocument {
  const doc: CheckDocument = {
    ...base,
    ok: true,
    outcome: result.outcome,
    card: extra.cardPath ? { path: extra.cardPath } : null,
    tweet: extra.tweet,
    disclaimer: result.disclaimer,
    source: { ...base.source, asOf: result.asOf },
  };
  switch (result.outcome) {
    case 'answered':
      return {
        ...doc,
        answer: result.answer,
        project: { ...result.project },
        builder: { ...result.builder, activityLabel: statusLabel(result.builder.activityStatus) },
        latestShip: result.latestShip ? { ...result.latestShip } : null,
        contract: result.contract ? { ...result.contract } : null,
        unknowns: result.unknowns.map((u) => ({ ...u })),
        citation: result.citation,
        page: result.page,
      };
    case 'ambiguous':
      return {
        ...doc,
        answer: result.message,
        candidates: result.candidates.map((c) => ({ ...c })),
        candidatesTotal: result.candidatesTotal,
      };
    case 'not_found':
      return {
        ...doc,
        answer: result.message,
        notFound: {
          message: result.message,
          address: result.address,
          scanUrl: result.scanUrl,
          namesakesRead: result.namesakesRead,
          namesakes: result.namesakes
            ? {
                total: result.namesakes.total,
                line: result.namesakes.line,
                items: result.namesakes.items.map((n) => ({ ...n })),
              }
            : null,
        },
        page: result.scanUrl,
      };
  }
}

export function errorDocument(error: CheckError, base: CheckDocument): CheckDocument {
  return {
    ...base,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.details.retryable ?? false,
      ...(error.details.requestId ? { requestId: error.details.requestId } : {}),
      ...(error.details.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.details.retryAfterSeconds }
        : {}),
    },
  };
}
