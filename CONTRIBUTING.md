# Contributing

Thank you for helping. `hey-check` answers one question — is anyone building this Robinhood Chain
token or project, and what did they ship — from HEY Research Lab's public record. Changes that
keep it that small are welcome.

## Where to start

- **A question or an idea:** if Discussions are open on this repository, start there (Q&A or
  Ideas); otherwise open an issue. Check [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) first.
- **A bug:** the issue form asks for the command, the exit code, the `--json --no-card` output and
  your OS, shell and Node.js version — what it takes to reproduce it.
- **Something to work on:** issues labelled
  [`good first issue`](https://github.com/hey-research-lab/hey-check/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/hey-research-lab/hey-check/labels/help%20wanted). Say in
  the issue that you are taking it, so two people do not do the same work.
- **A security problem:** never in public; see [SECURITY.md](SECURITY.md).

## Setup

```sh
corepack enable
pnpm install
pnpm scan            # leak and attribution scan (scripts/scan.mjs)
pnpm lint
pnpm typecheck
pnpm test            # offline: fixtures only, the network is blocked
pnpm build           # dist/cli.js, committed so `npx github:…` works
pnpm card:examples   # redraws docs/example-*.png from the fixtures
```

Node.js 22+, pnpm 9.15.1. Commit `dist/` and `docs/example-*.png` together with the source change
that moved them: CI rebuilds `dist/` and fails when it differs from what is committed, because
`npx github:hey-research-lab/hey-check` runs the committed bundle. CI runs on Node.js 22 and 24.

To try a change against the live API, run the built CLI: `node dist/cli.js '$CHIT' --no-card`, or
`HEY_CHECK="node dist/cli.js" examples/check-many.sh examples/inputs.txt` for a few at once.

## Rules

- **The builder question only.** No safety verdict, risk score, safety "check", price, market cap,
  valuation, liquidity, volume, buy/sell wording or "dev wallet" — in the terminal, the JSON, the
  tweet or the card. HEY's answer carries market and usage context; `hey-check` never reads it.
  The tests fail on market words in every output.
- **Relay, never invent.** The status words are HEY's (Shipping, Active, Resumed, Quiet, Dormant,
  Unknown). An absent value prints as "not measured" or "not known to HEY", never `0`, `false`, a
  blank or "none". A shared name or ticker is stated as a fact, with no verdict word.
- **HEY does not guess, and neither does hey-check.** An ambiguous match lists the candidates and
  exits 7. The only follow-up is an exact slug match.
- **At most two GET requests to `https://heyresearch.xyz`**, no retries, no other host.
- **Untrusted text stays untrusted:** every string from HEY passes through `cleanText`, and through
  `cardText` and `escapeXml` before it enters the SVG.
- **Words:** "Robinhood Chain" (never "Hood Chain"); never imply Robinhood endorsement.
- **Tests:** every behaviour is tested against fixtures in `test/fixtures/live`, recorded once
  from the live API. Personal account handles in them are replaced with neutral placeholders
  (`example-builder`, `sample-builder`); keep the structure exactly as recorded.
- **No secrets** in code, fixtures, commits or logs; no `.env` with values.
- Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).

## The card

The card is SVG built in code (`src/card/svg.ts`) and rasterised by `@resvg/resvg-js` with the
bundled Geist font only. Text is measured with the same font, so wrapping and ellipses are exact.
After any layout change, run `pnpm card:examples` and look at both PNGs at full size and at phone
size before committing.

## Parity

The chain constants (`src/chain.ts`), the address rules (`src/evm.ts`), exit codes 0 and 2–6 and
the leak scan follow the HEY Research Lab ecosystem conventions shared by every repository in the
organisation. The endpoints and response shapes were last checked against the live API on
2026-10-18.
