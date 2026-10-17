---
name: hey-check
description: Runs a dev check on a Robinhood Chain (chain id 4663) token or project with HEY Research Lab's public, source-backed record — is anyone building it, and what did they ship? Use when someone types /devcheck or asks "is the dev still building", "is anyone working on $TICKER", "what did this project ship", or "dev check 0x…" about a Robinhood Chain $TICKER, 0x contract address, project name, @handle or x.com profile. Answers the builder question only — never a safety verdict, risk score, price or trading advice.
compatibility: Needs network access to https://heyresearch.xyz. The CLI path needs Node.js 22 or later (npx). No API key or account.
metadata:
  author: HEY Research Lab
  version: '0.1.0'
  homepage: https://github.com/hey-research-lab/hey-check
---

# Dev check — is anyone building it?

HEY Research Lab (heyresearch.xyz) records, with a source for every fact, which Robinhood Chain
projects are still building and what they shipped. This skill asks HEY that one question about a
token or project and reports HEY's answer. Robinhood Chain is chain id 4663; HEY covers no other
chain.

## 1. Run the check

Pass what the person gave you — a `$TICKER`, a `0x` contract address, a project name or slug, an
`@handle` or an `https://x.com/<handle>` URL — as one argument. Quote a `$TICKER` so the shell
does not expand it.

```sh
npx -y github:hey-research-lab/hey-check '<input>' --json --no-card
```

Add `--out <file.png>` instead of `--no-card` only when the person asks for the shareable card,
and `--tweet` when they want text to post.

If HEY's hosted MCP server is connected (tools such as `research_answer`), you may call
`research_answer({"capability": "research_project", "project": "<slug, name or $TICKER>"})` — or
`{"capability": "research_project", "address": "<0x…>"}` for a contract — instead of the CLI. It
returns the same answer (without the same-name notice for an unpublished contract).

## 2. Read the result

The JSON (`schema: "hey.check/v1"`) and the exit code say what HEY answered:

| Exit | `outcome`   | Say                                                                                                                                                                                                                                                |
| ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `answered`  | `answer`, then `builder.activityLabel`, the last ship (`builder.lastMeaningfulShipAt`, `latestShip.title`, `latestShip.sourceUrl`), `builder.meaningfulEvents30d` and `page`.                                                                      |
| 7    | `ambiguous` | HEY does not guess. List `candidates` (slug, name, status) and ask which one; never pick for the person.                                                                                                                                           |
| 4    | `not_found` | "HEY has no published project for this" — a statement about HEY's index, not about the token. If `notFound.namesakes` has items, say plainly which published project carries the same name or ticker on a different contract, with both addresses. |
| 2    | —           | The input was not an address, ticker, name, handle or x.com URL; ask for one.                                                                                                                                                                      |
| 5, 6 | —           | HEY could not be reached or is rate limiting; say so and suggest trying again.                                                                                                                                                                     |

## 3. Report it

- Lead with HEY's answer and the status in HEY's words (Shipping, Active, Resumed, Quiet, Dormant,
  Unknown). Give the last ship with its date and source link, and the HEY page (`page`).
- Quote `citation` as the source.
- End with the boundary: builder evidence, not a safety verdict or investment advice.
- A `null` or missing value means HEY does not know — say "not known to HEY", never 0 or "none".
- Up to two `unknowns` are worth mentioning with their category (for example `NOT_MEASURED`).

## Never

- Never give a safety verdict on a token, in any words, and never give a risk score.
- Never mention price, market cap, valuation, liquidity or volume, and never suggest buying,
  selling or holding.
- Never call an address a "dev wallet", and never say "Hood Chain" or imply Robinhood endorses
  anything; HEY Research Lab is independent of Robinhood.
- Never guess between several matching projects, and never treat a ticker as identity: on chain a
  token is its contract.
