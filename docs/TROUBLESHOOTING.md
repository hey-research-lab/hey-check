# Troubleshooting and questions

Answers to the things that go wrong most often, each checked against `hey-check` 0.1.0. Every
problem starts with the exit code: `echo $?` in bash or zsh, `$LASTEXITCODE` in PowerShell,
`echo %ERRORLEVEL%` in cmd.exe. The codes are listed in the [README](../README.md#exit-codes).

## Running it

### `hey-check $CHIT` prints the help, or "Nothing to check"

The shell replaced `$CHIT` with the value of a variable called `CHIT`, which is empty, so
`hey-check` received nothing (exit 2). In bash, zsh and fish, put a ticker in **single** quotes:

```sh
hey-check '$CHIT'
```

Double quotes do not help: `"$CHIT"` is expanded too. PowerShell also expands `$CHIT` unless it
is in single quotes.

### cmd.exe: "The input arrived with its quotes"

cmd.exe does not treat `$` specially and passes single quotes through as part of the argument,
so `hey-check '$CHIT'` sends `'$CHIT'`. In cmd.exe, leave the quotes out:

```bat
hey-check $CHIT
```

### `npx github:hey-research-lab/hey-check` fails with "An unknown git error occurred"

npm installs a `github:` package with git, so git must be on your `PATH`. Install git, or build
from a clone (`pnpm install && pnpm build && node dist/cli.js '$CHIT'`). The first `npx` run
downloads the package and its renderer (a few MB). Later runs use npm's cache.

### "the card renderer (@resvg/resvg-js) could not load"

The card is drawn by `@resvg/resvg-js`, which ships prebuilt native binaries for macOS (x64,
arm64), Windows (x64, ia32, arm64), Linux glibc and musl (x64, arm64), Linux arm (gnueabihf) and
Android (arm64, arm). On any other platform, or when npm skipped optional dependencies
(`--omit=optional`), the renderer cannot load. `hey-check` still prints the answer, then exits 1
because the card was not written. Use `--no-card` for the answer alone (exit 0):

```sh
hey-check '$CHIT' --no-card
```

### Which Node.js does it need?

Node.js 22 or later. CI runs the tests on Node.js 22 and 24. It uses Node's built-in `fetch` and
has one runtime dependency, the card renderer.

## Reading the answer

### Exit 7: "More than one published project matches"

A name or ticker matched several published projects, and HEY does not guess. Run it again with
one of the slugs it lists (`hey-check pepes`) or with the token's `0x` contract. On chain, a token
is its contract, never its name or ticker.

### Exit 4: "not a published project on HEY"

HEY has no published project for that input. That is a statement about HEY's index, not about the
token. For a contract, `hey-check` prints HEY's scan page for it, plus any published project that
has the same name or ticker on a different contract.

### "not measured", "not known to HEY" or an unknown

HEY records only what it could read from a source. A value it did not read is printed as unknown,
never as `0` or "none". The `Unknowns` lines are HEY's own list of what it does not know about the
project, in HEY's words.

### Is a "Shipping" status a reason to trust a token?

No. The status says HEY recorded meaningful development, with a source for each event. It is not a
safety verdict, an audit or investment advice, and `hey-check` never prints a price or a risk
score.

## Network and limits

### Exit 5: rate limited

HEY's public API allows 120 requests a minute per client without a key. `hey-check` sends at
most two requests per run and never retries on its own. Wait for the delay it prints, then run it
again. In a loop, leave a second between checks, as
[`examples/check-many.sh`](../examples/check-many.sh) does.

### Exit 6: network failure, timeout or a HEY 5xx

`hey-check` gives up after 15 seconds, follows no redirect and reads at most 1 MiB of an answer.
A brief outage of heyresearch.xyz or of the CDN in front of it shows up as exit 6. Run it again
later. With `--json`, `error.retryable` says whether a retry can help, and `error.requestId`
identifies the request if you report it.

### Can I point it at another chain or RPC?

No. HEY researches Robinhood Chain (chain id 4663) only, and `hey-check` reads HEY's public API,
never an RPC node. A CAIP-10 address on another chain, or a `--chain` / `--network` flag, is
refused with `unsupported_chain` (exit 2).

## Scripts and agents

### How do I use it in a script?

`--json --no-card` prints exactly one JSON document (`hey.check/v1`) on stdout for every outcome,
errors included. `examples/check-many.sh` turns a list of inputs into a tab-separated table with
`jq`. For other reads (ships, changes, evidence), use
[`@hey-research-lab/cli`](https://github.com/hey-research-lab/hey-cli).

## Still stuck?

Open an issue with the command you ran, the exit code, the `--json --no-card` output (it holds no
secret: `hey-check` sends no key) and your OS, shell and `node --version`. Report a security
problem privately instead, as [SECURITY.md](../SECURITY.md) explains.
