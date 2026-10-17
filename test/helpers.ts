import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type FetchLike } from '../src/http.js';
import { type CardRenderer, type RunEnvironment } from '../src/run.js';

/** Fixtures are read from the repository root (where vitest and `pnpm card:examples` run). */
const FIXTURES = join(process.cwd(), 'test', 'fixtures');

export const fixtureText = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
export const fixture = (name: string): unknown => JSON.parse(fixtureText(name));

/** The instant the live fixtures were recorded (their `asOf` is 22:58–22:59 UTC that day). */
export const RECORDED_NOW = new Date('2026-10-17T23:00:00.000Z');

export type Route = {
  status?: number;
  file?: string;
  body?: string;
  headers?: Record<string, string>;
};

/** HTTP status HEY sends with each agent answer status. */
const statusFor = (body: string): number => {
  const parsed = JSON.parse(body) as { status?: string; found?: boolean };
  if (parsed.status === 'not_found') return 404;
  if (parsed.status === 'invalid_request') return 400;
  return 200;
};

/**
 * A fetch over saved fixtures: `routes` maps a request's path and query (as hey-check sends it,
 * e.g. `/api/agent/research_project?q=%24CHIT`) to a fixture. Unrouted requests fail the test.
 */
export function fixtureFetch(routes: Record<string, Route>, calls: string[] = []): FetchLike {
  return async (input) => {
    const url = new URL(input);
    const key = `${url.pathname}${url.search}`;
    calls.push(key);
    const route = routes[key];
    if (!route) throw new Error(`No fixture routed for ${key}`);
    const body = route.body ?? (route.file ? fixtureText(route.file) : '');
    return new Response(body, {
      status: route.status ?? (body.startsWith('{') ? statusFor(body) : 200),
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        ...route.headers,
      },
    });
  };
}

export const ROUTES = {
  qChit: '/api/agent/research_project?q=%24CHIT',
  addressChit: '/api/agent/research_project?address=0xd523a627030509021cc39b6d7c8543417d3e50d8',
  addressCopycat: '/api/agent/research_project?address=0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8',
  scanCopycat: '/api/v1/scan?chain=4663&token=0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8',
  qPepe: '/api/agent/research_project?q=pepe',
  qHandle: '/api/agent/research_project?q=%40loomdesktrade',
  qLoom: '/api/agent/research_project?q=loom',
} as const;

/** A card renderer that measures text roughly and draws nothing: for tests that do not rasterise. */
export const stubRenderer = (): CardRenderer => ({
  measure: (text, size) => [...text].length * size * 0.56,
  render: (svg) => Buffer.from(svg, 'utf8'),
});

export type Captured = { stdout: string; stderr: string };

export function environment(
  fetchImpl: FetchLike,
  overrides: Partial<RunEnvironment> = {},
): { io: RunEnvironment; out: Captured } {
  const out: Captured = { stdout: '', stderr: '' };
  const io: RunEnvironment = {
    fetchImpl,
    stdout: (t) => {
      out.stdout += t;
    },
    stderr: (t) => {
      out.stderr += t;
    },
    env: {},
    isTTY: false,
    now: () => RECORDED_NOW,
    cwd: process.cwd(),
    cardRenderer: stubRenderer,
    ...overrides,
  };
  return { io, out };
}
