/* eslint-disable no-control-regex -- the tests look for escape and control characters */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXIT } from '../src/exit-codes.js';
import { USER_AGENT } from '../src/http.js';
import { type CheckDocument } from '../src/json.js';
import { run } from '../src/run.js';
import { environment, fixture, fixtureFetch, ROUTES, type Route } from './helpers.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hey-check-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function go(argv: string[], routes: Record<string, Route>, overrides = {}) {
  const calls: string[] = [];
  const { io, out } = environment(fixtureFetch(routes, calls), { cwd: dir, ...overrides });
  const code = await run(argv, io);
  return { code, out, calls };
}

const json = (stdout: string) => JSON.parse(stdout) as CheckDocument;

describe('answered (status ok)', () => {
  it('prints the answer first, then the builder facts, and writes the card', async () => {
    const { code, out, calls } = await go(['$CHIT'], {
      [ROUTES.qChit]: { file: 'live/research-q-chit.json' },
    });
    expect(code).toBe(EXIT.OK);
    expect(calls).toEqual([ROUTES.qChit]);
    const lines = out.stdout.split('\n');
    expect(lines[0]).toBe(
      'Chit is shipping consistently: 4 meaningful events in 30 days; latest ship 3 days ago.',
    );
    expect(out.stdout).toContain('  Chit  $CHIT');
    expect(out.stdout).toMatch(/Status\s+Shipping/);
    expect(out.stdout).toMatch(
      /Last ship\s+3 days ago \(2026-10-14\) — Code changes, week starting 2026-10-12 \(to 2026-10-17\)/,
    );
    expect(out.stdout).toContain('https://github.com/example-builder/chit-app');
    expect(out.stdout).toMatch(/Last 30 days\s+4 meaningful events\n/);
    expect(out.stdout).toContain(
      '0xd523a627030509021cc39b6d7c8543417d3e50d8 · token verified (VERIFIED)',
    );
    expect(out.stdout).toContain('NOT_MEASURED — HEY read its website and found no link to docs.');
    expect(out.stdout).toContain('Source: HEY Research Lab, builder research for Robinhood Chain');
    expect(out.stdout).toContain('Builder evidence, not a safety verdict or investment advice.');
    expect(out.stdout).toContain('Card          ./hey-check-chit.png');
    expect(out.stdout).not.toMatch(/\u001b\[/);
    // The stub renderer writes the SVG text, so the file exists where the report says.
    expect(readFileSync(join(dir, 'hey-check-chit.png'), 'utf8')).toMatch(/^<svg /);
  });

  it('shows at most two unknowns and says how many more there are', async () => {
    const { out } = await go(['sample-builder-pepe-on-robinhood-chain'], {
      '/api/agent/research_project?q=sample-builder-pepe-on-robinhood-chain': {
        file: 'live/research-q-dormant.json',
      },
    });
    expect(out.stdout).toMatch(/Status\s+Dormant/);
    expect(out.stdout).toContain('Last ship     76 days ago (2026-08-01)');
    expect(out.stdout).toMatch(/Last 30 days\s+0 meaningful events\n/);
    expect(out.stdout).toContain('no token on HEY’s record for this project');
    expect(out.stdout.match(/NOT_VERIFIED —|NOT_MEASURED —/g)).toHaveLength(2);
    // Five unknowns, three of them the same sentence: three distinct, two shown.
    expect(out.stdout).toContain('+1 more (--json lists them all)');
  });

  it('keeps going when HEY has no latest change for a project that shipped', async () => {
    const { code, out } = await go(['loomdesk-hq-mcp', '--no-card'], {
      '/api/agent/research_project?q=loomdesk-hq-mcp': {
        file: 'live/research-q-no-latest-change.json',
      },
    });
    expect(code).toBe(EXIT.OK);
    expect(out.stdout).toMatch(/Last ship\s+10 days ago \(2026-10-07\)\n/);
    expect(out.stdout).not.toContain('$');
    expect(out.stdout).not.toContain('Card ');
  });

  it('colours only on a terminal and never with NO_COLOR', async () => {
    const routes = { [ROUTES.qChit]: { file: 'live/research-q-chit.json' } };
    const tty = await go(['$CHIT', '--no-card'], routes, { isTTY: true });
    expect(tty.out.stdout).toMatch(/\u001b\[1m/);
    const noColor = await go(['$CHIT', '--no-card'], routes, {
      isTTY: true,
      env: { NO_COLOR: '1' },
    });
    expect(noColor.out.stdout).not.toMatch(/\u001b\[/);
    const flag = await go(['$CHIT', '--no-card', '--no-color'], routes, { isTTY: true });
    expect(flag.out.stdout).not.toMatch(/\u001b\[/);
  });

  it('maps every activity status to HEY’s word, and anything else to Unknown', async () => {
    const base = fixture('live/research-q-chit.json') as {
      data: { builderState: Record<string, unknown> };
    };
    const cases: [unknown, string][] = [
      ['SHIPPING', 'Shipping'],
      ['ACTIVE', 'Active'],
      ['RESUMED', 'Resumed'],
      ['QUIET', 'Quiet'],
      ['DORMANT', 'Dormant'],
      ['UNKNOWN', 'Unknown'],
      ['SOMETHING_NEW', 'Unknown'],
      [null, 'Unknown'],
    ];
    for (const [status, label] of cases) {
      const body = structuredClone(base);
      body.data.builderState.activityStatus = status;
      const { out } = await go(['$CHIT', '--json', '--no-card'], {
        [ROUTES.qChit]: { body: JSON.stringify(body) },
      });
      expect(json(out.stdout).builder?.activityLabel).toBe(label);
    }
  });

  it('strips control and bidi characters from HEY’s text', async () => {
    const body = fixture('live/research-q-chit.json') as {
      answer: { text: string };
      data: { identity: { name: { text: string } } };
    };
    body.answer.text = 'Evil\u001b[31m red\u202E txt. Next.';
    body.data.identity.name.text = 'Ch\u202Eit\u0007\u200B';
    const { out } = await go(['$CHIT', '--no-card'], {
      [ROUTES.qChit]: { body: JSON.stringify(body) },
    });
    expect(out.stdout.split('\n')[0]).toBe('Evil[31m red txt.');
    expect(out.stdout).toContain('  Chit  $CHIT');
    expect(out.stdout).not.toMatch(/[\u0000-\u0008\u001b\u200B\u202E]/);
  });

  it('asks HEY by slug only when the input is exactly one candidate’s slug', async () => {
    const ambiguous = fixture('live/research-q-handle-ambiguous.json');
    const { code, calls, out } = await go(['loomdesk-hq-mcp', '--no-card'], {
      '/api/agent/research_project?q=loomdesk-hq-mcp': { body: JSON.stringify(ambiguous) },
      '/api/agent/research_project?project=loomdesk-hq-mcp': {
        file: 'live/research-q-no-latest-change.json',
      },
    });
    expect(code).toBe(EXIT.OK);
    expect(calls).toHaveLength(2);
    expect(out.stdout).toMatch(/Status\s+Active/);
  });
});

describe('ambiguous (invalid_request, code ambiguous)', () => {
  it('lists the candidates, picks none and exits 7', async () => {
    const { code, out, calls } = await go(['pepe'], {
      [ROUTES.qPepe]: { file: 'live/research-q-pepe-ambiguous.json' },
    });
    expect(code).toBe(EXIT.AMBIGUOUS);
    expect(calls).toEqual([ROUTES.qPepe]);
    expect(out.stdout).toContain('More than one published project matches. HEY does not guess.');
    expect(out.stdout).toMatch(/pepes\s+Pepes \(\$Pepes\) · Shipping · 0xe2c4…5644/);
    expect(out.stdout).toContain('Showing 8 of 19 matches.');
    expect(out.stdout).toContain('Pick one: hey-check pepes');
  });

  it('writes no card and no tweet', async () => {
    const { code, out } = await go(['@loomdesktrade', '--tweet'], {
      [ROUTES.qHandle]: { file: 'live/research-q-handle-ambiguous.json' },
    });
    expect(code).toBe(EXIT.AMBIGUOUS);
    expect(out.stdout).toBe('');
    expect(out.stderr).toContain('nothing to post');
    expect(out.stderr).toContain('loomdesk-hq-mcp');
  });

  it('carries the candidates in JSON', async () => {
    const { out } = await go(['https://x.com/loomdesktrade', '--json'], {
      [ROUTES.qHandle]: { file: 'live/research-q-handle-ambiguous.json' },
    });
    const doc = json(out.stdout);
    expect(doc.ok).toBe(true);
    expect(doc.outcome).toBe('ambiguous');
    expect(doc.input).toEqual({
      raw: 'https://x.com/loomdesktrade',
      kind: 'x_profile',
      sent: { q: '@loomdesktrade' },
    });
    expect(doc.candidates?.map((c) => c.slug)).toEqual(['loom', 'loomdesk-hq-mcp']);
    expect(doc.candidatesTotal).toEqual({ count: 2, atLeast: false });
    expect(doc.card).toBeNull();
  });
});

describe('not found (not_found)', () => {
  it('names the published namesake on another contract, as facts', async () => {
    const { code, out, calls } = await go(['0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8'], {
      [ROUTES.addressCopycat]: { file: 'live/research-address-copycat.json' },
      [ROUTES.scanCopycat]: { file: 'live/scan-copycat.json' },
    });
    expect(code).toBe(EXIT.NOT_FOUND);
    expect(calls).toEqual([ROUTES.addressCopycat, ROUTES.scanCopycat]);
    expect(out.stdout).toContain(
      '0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8 is not a published project on HEY.',
    );
    expect(out.stdout).toContain('Same name or ticker on another contract');
    expect(out.stdout).toContain(
      'Chit ($CHIT) · 0xd523a627030509021cc39b6d7c8543417d3e50d8 · https://heyresearch.xyz/project/chit',
    );
    expect(out.stdout).toContain(
      'https://heyresearch.xyz/scan/0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8',
    );
    expect(out.stdout).toContain('On chain a token is its contract, never its name or ticker.');
    const svg = readFileSync(join(dir, 'hey-check-0xdcfe-50d8.png'), 'utf8');
    expect(svg).toContain('Chit is published on HEY on a different contract, 0xd523…50d8;');
    expect(svg).toContain('SAME NAME ON ANOTHER CONTRACT');
  });

  it('says the namesake list was not read when the scan card fails, never "none"', async () => {
    const { code, out } = await go(
      ['0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8', '--json', '--no-card'],
      {
        [ROUTES.addressCopycat]: { file: 'live/research-address-copycat.json' },
        [ROUTES.scanCopycat]: { status: 503, body: '{}' },
      },
    );
    expect(code).toBe(EXIT.NOT_FOUND);
    const doc = json(out.stdout);
    expect(doc.notFound?.namesakesRead).toBe(false);
    expect(doc.notFound?.namesakes).toBeNull();
    expect(doc.notFound?.message).toContain('"chit" on 0xd523a627030509021cc39b6d7c8543417d3e50d8');
  });

  it('answers a name HEY does not hold without a second request', async () => {
    const { code, out, calls } = await go(['zzqqxxnotathing'], {
      '/api/agent/research_project?q=zzqqxxnotathing': { file: 'live/research-q-not-found.json' },
    });
    expect(code).toBe(EXIT.NOT_FOUND);
    expect(calls).toHaveLength(1);
    expect(out.stdout).toContain('zzqqxxnotathing is not a published project on HEY.');
    expect(out.stdout).toContain('That is a statement about HEY’s index, not about the project.');
    expect(readFileSync(join(dir, 'hey-check-zzqqxxnotathing.png'), 'utf8')).toMatch(/^<svg/);
  });
});

describe('errors', () => {
  it('refuses bad input before any request (exit 2)', async () => {
    const { code, out, calls } = await go(['0x123'], {});
    expect(code).toBe(EXIT.USAGE);
    expect(calls).toHaveLength(0);
    expect(out.stderr).toContain('(invalid_address)');
  });

  it('refuses a chain or network option', async () => {
    const { code, out } = await go(['$CHIT', '--chain', '1'], {});
    expect(code).toBe(EXIT.USAGE);
    expect(out.stderr).toContain('unsupported_chain');
  });

  it('refuses --out that is not a .png, and --out with --no-card', async () => {
    expect((await go(['$CHIT', '--out', 'card.svg'], {})).code).toBe(EXIT.USAGE);
    expect((await go(['$CHIT', '--out', 'a.png', '--no-card'], {})).code).toBe(EXIT.USAGE);
  });

  it('maps another invalid_request to exit 3 with HEY’s message', async () => {
    const body = {
      status: 'invalid_request',
      error: { code: 'invalid_request', message: { text: 'q: too long.' } },
    };
    const { code, out } = await go(['loom'], {
      [ROUTES.qLoom]: { status: 400, body: JSON.stringify(body) },
    });
    expect(code).toBe(EXIT.REFUSED);
    expect(out.stderr).toContain('q: too long. (invalid_request)');
  });

  it('maps 429 to exit 5 with the retry delay', async () => {
    const { code, out } = await go(['loom', '--json'], {
      [ROUTES.qLoom]: {
        status: 429,
        body: '{"error":"rate_limited"}',
        headers: { 'retry-after': '42' },
      },
    });
    expect(code).toBe(EXIT.RATE_LIMITED);
    const doc = json(out.stdout);
    expect(doc.ok).toBe(false);
    expect(doc.error).toMatchObject({
      code: 'rate_limited',
      retryable: true,
      retryAfterSeconds: 42,
      requestId: 'test-request-id',
    });
  });

  it('maps 5xx, a redirect, a non-JSON body and a forbidden key to exit 6', async () => {
    const cases: Route[] = [
      { status: 502, body: 'bad gateway' },
      { status: 301, body: '', headers: { location: 'https://example.org/' } },
      { status: 200, body: '<html>' },
      { status: 200, body: '{"status":"ok","__proto__":{"x":1}}' },
    ];
    for (const route of cases) {
      const { code } = await go(['loom'], { [ROUTES.qLoom]: route });
      expect(code).toBe(EXIT.NETWORK);
    }
  });

  it('maps a network failure to exit 6', async () => {
    const { io, out } = environment(
      async () => {
        throw new TypeError('fetch failed');
      },
      { cwd: dir },
    );
    expect(await run(['loom'], io)).toBe(EXIT.NETWORK);
    expect(out.stderr).toContain('Could not reach heyresearch.xyz');
  });

  it('sends one GET to heyresearch.xyz with hey-check’s user agent and no redirect', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const { io } = environment(
      async (url, init) => {
        seen = { url, ...(init ? { init } : {}) };
        return new Response(JSON.stringify(fixture('live/research-q-chit.json')), { status: 200 });
      },
      { cwd: dir },
    );
    await run(['$CHIT', '--no-card'], io);
    const s = seen as unknown as { url: string; init: RequestInit };
    expect(s.url).toBe('https://heyresearch.xyz/api/agent/research_project?q=%24CHIT');
    expect(s.init.method).toBe('GET');
    expect(s.init.redirect).toBe('manual');
    expect((s.init.headers as Record<string, string>)['user-agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(
      /^hey-check\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hey-research-lab\/hey-check\)$/,
    );
  });

  it('reports a card that could not be written with exit 1, after the answer', async () => {
    const { code, out } = await go(['$CHIT', '--out', 'missing-dir/card.png'], {
      [ROUTES.qChit]: { file: 'live/research-q-chit.json' },
    });
    expect(code).toBe(EXIT.CARD_FAILED);
    expect(out.stdout).toContain('Chit is shipping consistently');
    expect(out.stderr).toContain('card_not_written');
  });

  it('--help and --version answer without a request', async () => {
    const help = await go(['--help'], {});
    expect(help.code).toBe(EXIT.OK);
    expect(help.out.stdout).toContain('hey-check <input>');
    const version = await go(['--version'], {});
    expect(version.out.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});
