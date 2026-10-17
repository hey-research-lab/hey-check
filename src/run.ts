import { isAbsolute, relative } from 'node:path';
import { parseArgs } from 'node:util';

import { cardModel } from './card/model.js';
import { buildCardSvg, type Measure } from './card/svg.js';
import { defaultCardName, writeCard } from './card/write.js';
import { CheckError, usageError } from './errors.js';
import { EXIT, type ExitCode } from './exit-codes.js';
import { check, type CheckResult } from './hey.js';
import { DEFAULT_BASE_URL, HeyHttp, parseBaseUrl, type FetchLike } from './http.js';
import { parseInput, type CheckInput } from './input.js';
import { emptyDocument, errorDocument, resultDocument } from './json.js';
import { quietLine, renderTerminal } from './terminal.js';
import { ansiStyle, plainStyle } from './text.js';
import { tweetText } from './tweet.js';
import { CHECK_VERSION } from './version.js';

/** The card renderer, injected so tests can run without a rasteriser. */
export type CardRenderer = { measure: Measure; render: (svg: string) => Buffer };

export type RunEnvironment = {
  fetchImpl: FetchLike;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Record<string, string | undefined>;
  isTTY: boolean;
  now: () => Date;
  cwd: string;
  /** Created on first use, so `--no-card`, `--help` and failures never load the font. */
  cardRenderer: () => CardRenderer;
};

const OPTIONS = {
  json: { type: 'boolean' },
  quiet: { type: 'boolean' },
  tweet: { type: 'boolean' },
  'no-card': { type: 'boolean' },
  out: { type: 'string', short: 'o' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const NETWORK_FLAGS = /^--(chain|chain-id|chainid|network|net|rpc|rpc-url)(=|$)/i;

export const HELP = `hey-check — a dev check for a Robinhood Chain token or project

Is anyone building it, and what did they ship? Answered from HEY Research Lab's public record
(heyresearch.xyz), printed here and drawn as a 1200×675 PNG card.

Usage
  hey-check <input> [options]

Input
  0x…                    a token or contract address (0x + 40 hex)
  $TICKER                a ticker, e.g. $CHIT
  name or slug           a project name, e.g. loom
  @handle                an X handle
  https://x.com/<handle> an X profile URL

Options
  --json                 print one JSON document (schema hey.check/v1) on stdout
  --no-card              do not draw the PNG card
  -o, --out <file.png>   where to write the card (default ./hey-check-<slug>.png)
  --tweet                print a ready-to-post text (under 280 characters) instead of the report
  --quiet                print one line
  --no-color             no ANSI styling (also NO_COLOR)
  -h, --help             this help
  -v, --version          the version

Exit codes
  0 answered · 1 card not written · 2 bad input · 3 HEY refused · 4 not published on HEY
  5 rate limited · 6 network or HEY error · 7 more than one match (pick one)

Builder evidence, not a safety verdict or investment advice. Robinhood Chain (4663) only.
HEY Research Lab is independent and not affiliated with Robinhood.`;

/** Runs one invocation and returns its exit code. Never throws. */
export async function run(argv: readonly string[], io: RunEnvironment): Promise<ExitCode> {
  const wantsJson = argv.includes('--json');
  let input: CheckInput | null = null;
  let http: HeyHttp | null = null;

  const fail = (error: CheckError): ExitCode => {
    if (wantsJson) {
      const doc = errorDocument(error, emptyDocument(io.now(), input, http?.requests ?? []));
      io.stdout(`${JSON.stringify(doc, null, 2)}\n`);
    } else {
      io.stderr(`hey-check: ${error.message} (${error.code})\n`);
      if (error.details.requestId) io.stderr(`hey-check: request id ${error.details.requestId}\n`);
      if (error.exitCode === EXIT.USAGE) io.stderr('hey-check: see `hey-check --help`\n');
    }
    return error.exitCode;
  };

  try {
    if (argv.some((a) => NETWORK_FLAGS.test(a))) {
      throw usageError(
        'unsupported_chain',
        'HEY supports Robinhood Chain (4663) only, and it is implicit: hey-check takes no chain or network option.',
      );
    }
    let parsed;
    try {
      parsed = parseArgs({
        args: [...argv],
        options: OPTIONS,
        allowPositionals: true,
        strict: true,
      });
    } catch (error) {
      throw usageError('invalid_option', error instanceof Error ? error.message : String(error));
    }
    const { values, positionals } = parsed;
    if (values.version) {
      io.stdout(`${CHECK_VERSION}\n`);
      return EXIT.OK;
    }
    if (values.help) {
      io.stdout(`${HELP}\n`);
      return EXIT.OK;
    }
    if (positionals.length === 0) {
      if (wantsJson)
        throw usageError('missing_argument', 'Nothing to check; see `hey-check --help`.');
      io.stderr(`${HELP}\n`);
      return EXIT.USAGE;
    }
    if (positionals.length > 1) {
      // A name with spaces arrives as several words; join them back.
      positionals.splice(0, positionals.length, positionals.join(' '));
    }
    if (values.out !== undefined && values['no-card']) {
      throw usageError('invalid_option', '--out and --no-card cannot be used together.');
    }
    if (values.out !== undefined && !values.out.toLowerCase().endsWith('.png')) {
      throw usageError('invalid_option', '--out takes a path ending in .png.');
    }
    input = parseInput(positionals[0]);

    const baseUrl = io.env.HEY_BASE_URL ? parseBaseUrl(io.env.HEY_BASE_URL) : DEFAULT_BASE_URL;
    http = new HeyHttp(io.fetchImpl, baseUrl);
    const now = io.now();
    const result: CheckResult = await check(input, http);

    // The card.
    let cardPath: string | null = null;
    let cardFailure: CheckError | null = null;
    const model = values['no-card'] ? null : cardModel(result, input, now);
    if (model) {
      try {
        const renderer = io.cardRenderer();
        const png = renderer.render(buildCardSvg(model, renderer.measure));
        const written = writeCard(values.out ?? defaultCardName(result, input), png, io.cwd);
        const rel = relative(io.cwd, written);
        cardPath = rel && !rel.startsWith('..') && !isAbsolute(rel) ? `./${rel}` : written;
      } catch (error) {
        cardFailure =
          error instanceof CheckError
            ? error
            : new CheckError(
                'card_not_written',
                `The card could not be drawn: ${error instanceof Error ? error.message : String(error)}`,
                EXIT.CARD_FAILED,
              );
      }
    }
    const tweet = values.tweet ? tweetText(result, input, now) : null;
    const exitCode: ExitCode =
      result.outcome === 'ambiguous'
        ? EXIT.AMBIGUOUS
        : result.outcome === 'not_found'
          ? EXIT.NOT_FOUND
          : cardFailure
            ? EXIT.CARD_FAILED
            : EXIT.OK;

    if (values.json) {
      let doc = resultDocument(result, emptyDocument(now, input, http.requests), {
        cardPath,
        tweet,
      });
      if (cardFailure) doc = { ...errorDocument(cardFailure, doc), ok: true };
      io.stdout(`${JSON.stringify(doc, null, 2)}\n`);
      return exitCode;
    }
    if (cardFailure) io.stderr(`hey-check: ${cardFailure.message} (${cardFailure.code})\n`);

    if (values.tweet) {
      if (tweet) io.stdout(`${tweet}\n`);
      else io.stderr('hey-check: nothing to post until one project is picked.\n');
      if (cardPath) io.stderr(`hey-check: card written to ${cardPath}\n`);
      if (result.outcome === 'ambiguous') {
        io.stderr(
          `${renderTerminal(result, { input, now, style: plainStyle, cardPath }).join('\n')}\n`,
        );
      }
      return exitCode;
    }
    if (values.quiet) {
      io.stdout(`${quietLine(result, now)}\n`);
      return exitCode;
    }
    const colour =
      io.isTTY && !values['no-color'] && !(io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== '');
    const lines = renderTerminal(result, {
      input,
      now,
      style: colour ? ansiStyle : plainStyle,
      cardPath,
    });
    io.stdout(`${lines.join('\n')}\n`);
    return exitCode;
  } catch (error) {
    if (error instanceof CheckError) return fail(error);
    return fail(
      new CheckError(
        'internal_error',
        error instanceof Error ? error.message : String(error),
        EXIT.NETWORK,
        { retryable: false },
      ),
    );
  }
}
