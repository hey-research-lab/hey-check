/* eslint-disable no-control-regex -- the tests look for escape and control characters */
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardModel } from '../src/card/model.js';
import { createMeasure, loadFonts, renderPng } from '../src/card/render.js';
import { buildCardSvg, cardText, escapeXml, wrap, type CardModel } from '../src/card/svg.js';
import { writeCard } from '../src/card/write.js';
import { CheckError } from '../src/errors.js';
import { EXIT } from '../src/exit-codes.js';
import { check, type Answered } from '../src/hey.js';
import { HeyHttp } from '../src/http.js';
import { parseInput } from '../src/input.js';
import { type CheckDocument } from '../src/json.js';
import { run } from '../src/run.js';
import { renderTerminal } from '../src/terminal.js';
import { plainStyle } from '../src/text.js';
import { tweetLength, tweetText, TWEET_LIMIT } from '../src/tweet.js';
import {
  environment,
  fixture,
  fixtureFetch,
  RECORDED_NOW,
  ROUTES,
  stubRenderer,
} from './helpers.js';

/** Words that would make the output about a token's market, safety or a trade. */
const MARKET_WORDS =
  /\b(price|prices|market ?cap|valuation|fdv|liquidity|volume|usd|pump|moon|buy|sell|bullish|bearish|rug|scam|safe|unsafe|whale|smart money|dev wallet|undervalued|guaranteed|100x|alpha|audited)\b|\$\s?\d/i;

const allRoutes = {
  [ROUTES.qChit]: { file: 'live/research-q-chit.json' },
  [ROUTES.qLoom]: { file: 'live/research-q-loom.json' },
  [ROUTES.addressCopycat]: { file: 'live/research-address-copycat.json' },
  [ROUTES.scanCopycat]: { file: 'live/scan-copycat.json' },
  '/api/agent/research_project?q=sample-builder-pepe-on-robinhood-chain': {
    file: 'live/research-q-dormant.json',
  },
  '/api/agent/research_project?q=zzqqxxnotathing': { file: 'live/research-q-not-found.json' },
};
const INPUTS = [
  '$CHIT',
  'loom',
  '0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8',
  'sample-builder-pepe-on-robinhood-chain',
  'zzqqxxnotathing',
];

async function resultFor(raw: string) {
  const input = parseInput(raw);
  return { input, result: await check(input, new HeyHttp(fixtureFetch(allRoutes))) };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hey-check-out-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('JSON (hey.check/v1)', () => {
  it('has a stable shape built from the answer, with no market or usage field', async () => {
    const { io, out } = environment(fixtureFetch(allRoutes), { cwd: dir });
    expect(await run(['$CHIT', '--json', '--tweet'], io)).toBe(EXIT.OK);
    const doc = JSON.parse(out.stdout) as CheckDocument;
    expect(Object.keys(doc)).toEqual([
      'schema',
      'ok',
      'outcome',
      'chain',
      'input',
      'answer',
      'project',
      'builder',
      'latestShip',
      'contract',
      'unknowns',
      'candidates',
      'candidatesTotal',
      'notFound',
      'citation',
      'page',
      'card',
      'tweet',
      'boundary',
      'disclaimer',
      'error',
      'source',
    ]);
    expect(doc).toMatchObject({
      schema: 'hey.check/v1',
      ok: true,
      outcome: 'answered',
      chain: { name: 'Robinhood Chain', chainId: 4663, caip2: 'eip155:4663' },
      input: { raw: '$CHIT', kind: 'ticker', sent: { q: '$CHIT' } },
      answer:
        'Chit is shipping consistently: 4 meaningful events in 30 days; latest ship 3 days ago.',
      project: {
        slug: 'chit',
        name: 'Chit',
        symbol: 'CHIT',
        url: 'https://heyresearch.xyz/project/chit',
        researchLevel: 'VERIFIED_BUILDER',
        catalogStatus: 'VERIFIED_BUILDER',
      },
      builder: {
        activityStatus: 'SHIPPING',
        activityLabel: 'Shipping',
        activityMeasured: true,
        lastMeaningfulShipAt: '2026-10-14T08:20:49.000Z',
        meaningfulEvents30d: 4,
      },
      latestShip: {
        id: 'ship:74a69137-9a47-401b-b18d-62d4e778d069',
        title: 'Code changes, week starting 2026-10-12 (to 2026-10-17)',
        occurredAt: '2026-10-14T08:20:49.000Z',
        precision: 'WEEK',
        sourceUrl: 'https://github.com/example-builder/chit-app',
      },
      contract: { address: '0xd523a627030509021cc39b6d7c8543417d3e50d8', verification: 'VERIFIED' },
      candidates: null,
      notFound: null,
      page: 'https://heyresearch.xyz/project/chit',
      card: { path: './hey-check-chit.png' },
      boundary: 'Builder evidence, not a safety verdict or investment advice.',
      error: null,
      source: {
        requests: [
          {
            url: 'https://heyresearch.xyz/api/agent/research_project?q=%24CHIT',
            status: 200,
            requestId: 'test-request-id',
          },
        ],
        asOf: '2026-10-17T22:58:21.063Z',
        fetchedAt: RECORDED_NOW.toISOString(),
      },
    });
    expect(doc.unknowns).toHaveLength(2);
    expect(doc.citation).toMatch(/^Source: HEY Research Lab/);
    expect(typeof doc.tweet).toBe('string');
    const keys = JSON.stringify(doc).match(/"[A-Za-z0-9]+":/g) ?? [];
    expect(keys.join(' ')).not.toMatch(/market|valuation|liquidity|volume|price|usage|fdv/i);
  });

  it('prints an error document on bad input', async () => {
    const { io, out } = environment(fixtureFetch({}), { cwd: dir });
    expect(await run(['$', '--json'], io)).toBe(EXIT.USAGE);
    const doc = JSON.parse(out.stdout) as CheckDocument;
    expect(doc).toMatchObject({ ok: false, outcome: null, input: null, card: null });
    expect(doc.error?.code).toBe('invalid_input');
    expect(doc.source.requests).toEqual([]);
  });
});

describe('the card', () => {
  it('escapes hostile names and strips bidi and control characters', () => {
    const model: CardModel = {
      title: '<script>alert("x")</script> \u202Egnp.exe\u202C & co',
      ticker: "$<b>'",
      pill: { label: 'Shipping', tone: 'lime' },
      headline: 'Last shipped 3 days ago',
      detail: '</text><image href="https://example.org/x.png"/>',
      facts: ['4 meaningful events in 30 days'],
      notice: null,
      footerUrl: 'heyresearch.xyz/project/x',
      checkedOn: 'Checked 17 Oct 2026 UTC',
    };
    const svg = buildCardSvg(model, stubRenderer().measure);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(svg).toContain('&amp; co');
    expect(svg).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u0000-\u0008]/);
    // Still exactly one root element: nothing broke out of a <text>.
    expect(svg.match(/<svg /g)).toHaveLength(1);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });

  it('drops glyphs the bundled font cannot draw and keeps the rest', () => {
    expect(cardText('Pepe 🐸 漢字 Ёлка')).toBe('Pepe Ёлка');
    expect(cardText('\u202Eabc\u200B')).toBe('abc');
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;');
  });

  it('falls back to the slug when the name has nothing the font can draw', async () => {
    const { input, result } = await resultFor('$CHIT');
    const answered = result as Answered;
    answered.project.name = '🐸🐸🐸';
    expect(cardModel(answered, input, RECORDED_NOW)?.title).toBe('chit');
  });

  it('wraps long text into at most the lines it is given, with an ellipsis', () => {
    const measure = stubRenderer().measure;
    const lines = wrap('word '.repeat(80).trim(), 400, 20, 400, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/…$/);
    for (const line of lines) expect(measure(line, 20, 400)).toBeLessThanOrEqual(400);
    const one = wrap('x'.repeat(200), 300, 20, 400, 1, measure);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatch(/…$/);
  });

  it('never carries a market field or market words, for every outcome', async () => {
    for (const raw of INPUTS) {
      const { input, result } = await resultFor(raw);
      const model = cardModel(result, input, RECORDED_NOW);
      expect(model).not.toBeNull();
      expect(Object.keys(model!).sort()).toEqual(
        [
          'checkedOn',
          'detail',
          'facts',
          'footerUrl',
          'headline',
          'notice',
          'pill',
          'ticker',
          'title',
        ].sort(),
      );
      const svg = buildCardSvg(model!, stubRenderer().measure);
      const visible = svg.replace(/<[^>]+>/g, ' ');
      expect(visible).not.toMatch(MARKET_WORDS);
    }
  });

  it('marks only HEY’s building states in lime', async () => {
    const { input, result } = await resultFor('$CHIT');
    const answered = result as Answered;
    expect(cardModel(answered, input, RECORDED_NOW)?.pill).toEqual({
      label: 'Shipping',
      tone: 'lime',
    });
    for (const [code, tone] of [
      ['ACTIVE', 'lime'],
      ['RESUMED', 'lime'],
      ['QUIET', 'grey'],
      ['DORMANT', 'grey'],
      ['UNKNOWN', 'grey'],
    ] as const) {
      answered.builder.activityStatus = code;
      expect(cardModel(answered, input, RECORDED_NOW)?.pill?.tone).toBe(tone);
    }
  });

  it('draws the namesake notice in amber, as facts', async () => {
    const { input, result } = await resultFor('0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8');
    const model = cardModel(result, input, RECORDED_NOW)!;
    expect(model.title).toBe('0xdcfe…50d8');
    expect(model.headline).toBe('Not a published project on HEY');
    expect(model.notice?.body).toBe(
      'Chit is published on HEY on a different contract, 0xd523…50d8; this token carries the same name and ticker, and its address ends in the same four characters.',
    );
    expect(model.footerUrl).toBe('heyresearch.xyz/scan/0xdcfe58b38ee3eb3c1b27856b7353bed7bc9550d8');
    const svg = buildCardSvg(model, stubRenderer().measure);
    expect(svg).toContain('#f2b84b');
    expect(svg).not.toContain('#c2fb03"/><circle'); // no lime status pill
  });

  it('renders a 1200×675 PNG with the bundled font only', async () => {
    const fonts = loadFonts();
    const { input, result } = await resultFor('$CHIT');
    const png = renderPng(
      buildCardSvg(cardModel(result, input, RECORDED_NOW)!, createMeasure(fonts)),
      fonts,
    );
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(675);
  });
});

describe('terminal words', () => {
  it('never prints market words, for every outcome', async () => {
    for (const raw of INPUTS) {
      const { input, result } = await resultFor(raw);
      const text = renderTerminal(result, {
        input,
        now: RECORDED_NOW,
        style: plainStyle,
        cardPath: null,
      }).join('\n');
      expect(text).not.toMatch(MARKET_WORDS);
    }
  });
});

describe('--tweet', () => {
  it('counts a URL as 23 and other scripts as 2', () => {
    expect(tweetLength('https://heyresearch.xyz/project/a-very-long-slug-indeed-yes')).toBe(23);
    expect(tweetLength('abc')).toBe(3);
    expect(tweetLength('漢字')).toBe(4);
    expect(tweetLength('🐸')).toBe(2);
  });

  it('states the builder fact and the page, under 280, for every outcome', async () => {
    for (const raw of INPUTS) {
      const { input, result } = await resultFor(raw);
      const text = tweetText(result, input, RECORDED_NOW)!;
      expect(tweetLength(text)).toBeLessThanOrEqual(TWEET_LIMIT);
      expect(text).toContain('https://heyresearch.xyz');
      expect(text).not.toMatch(MARKET_WORDS);
    }
    const { input, result } = await resultFor('$CHIT');
    expect(tweetText(result, input, RECORDED_NOW)).toBe(
      'Dev check on Chit ($CHIT), Robinhood Chain: Shipping. Last shipped 3 days ago; 4 meaningful events in 30 days.\n\nBuilder evidence from HEY Research Lab, not a safety verdict: https://heyresearch.xyz/project/chit',
    );
  });

  it('shortens a very long name to fit', async () => {
    const { input, result } = await resultFor('$CHIT');
    (result as Answered).project.name = 'Long Name '.repeat(40);
    const text = tweetText(result, input, RECORDED_NOW)!;
    expect(tweetLength(text)).toBeLessThanOrEqual(TWEET_LIMIT);
    expect(text).toContain('…');
  });

  it('prints only the post on stdout', async () => {
    const { io, out } = environment(fixtureFetch(allRoutes), { cwd: dir });
    expect(await run(['$CHIT', '--tweet', '--no-card'], io)).toBe(EXIT.OK);
    expect(out.stdout.startsWith('Dev check on Chit ($CHIT)')).toBe(true);
    expect(out.stdout).not.toContain('Status');
  });
});

describe('writing the card', () => {
  const png = Buffer.from('png-bytes');

  it('writes exactly the given path', () => {
    const written = writeCard('card.png', png, dir);
    expect(written).toBe(join(dir, 'card.png'));
    expect(readFileSync(written, 'utf8')).toBe('png-bytes');
    writeCard('card.png', Buffer.from('again'), dir);
    expect(readFileSync(written, 'utf8')).toBe('again');
  });

  it('refuses to write through a symlink', () => {
    const victim = join(dir, 'victim.txt');
    writeFileSync(victim, 'keep me');
    symlinkSync(victim, join(dir, 'card.png'));
    expect(() => writeCard('card.png', png, dir)).toThrow(CheckError);
    try {
      writeCard('card.png', png, dir);
    } catch (error) {
      expect((error as CheckError).exitCode).toBe(EXIT.CARD_FAILED);
      expect((error as CheckError).message).toContain('symbolic link');
    }
    expect(readFileSync(victim, 'utf8')).toBe('keep me');
    expect(lstatSync(join(dir, 'card.png')).isSymbolicLink()).toBe(true);
  });

  it('refuses a dangling symlink, a directory, a missing parent and a non-.png path', () => {
    symlinkSync(join(dir, 'nowhere.png'), join(dir, 'dangling.png'));
    expect(() => writeCard('dangling.png', png, dir)).toThrow(/symbolic link/);
    expect(() => writeCard('.', png, dir)).toThrow(/\.png/);
    expect(() => writeCard('no/such/dir/card.png', png, dir)).toThrow(/does not exist/);
    expect(() => writeCard('card.svg', png, dir)).toThrow(/\.png/);
  });

  it('uses a safe default name', async () => {
    const { io, out } = environment(fixtureFetch(allRoutes), { cwd: dir });
    await run(['zzqqxxnotathing'], io);
    expect(out.stdout).toContain('./hey-check-zzqqxxnotathing.png');
    expect(fixture('live/scan-copycat.json')).toBeTruthy();
  });
});
