# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Fixed

- `--no-card` (and `--json --no-card`, `--quiet --no-card`) answers on a platform the card
  renderer has no prebuilt binary for. `@resvg/resvg-js` is loaded when a card is drawn, not at
  start-up; before, a missing binary crashed every run with a stack trace. Drawing a card there
  now fails as `card_not_written` (exit 1) after the answer, and the message says to use
  `--no-card`.
- An empty input (what bash and zsh leave of an unquoted or double-quoted `$CHIT`) says to quote
  the ticker in single quotes, and an input that arrives wrapped in quotes (cmd.exe passes them
  on) says to leave them out. Both still exit 2; nothing new is accepted.

### Added

- `examples/check-many.sh`: run `hey-check --json --no-card` over a list of inputs and print a
  tab-separated table.
- `docs/TROUBLESHOOTING.md`, an issue form for bugs, and Discussion category forms (Q&A, Ideas,
  Show and tell) that take effect if Discussions are enabled.
- CI runs on Node.js 22 and 24 and fails when the committed `dist/` differs from a fresh build.

### Changed

- README: install notes (single quotes for a ticker, cmd.exe, git for `npx github:`, the card
  renderer's platforms), the `candidatesTotal` shape (`{ count, atLeast }`), and links to Hey
  Research Lab's other open tools. SECURITY.md leads with the e-mail contact.

## 0.1.0 — 2026-10-18

### Added

- `hey-check <input>`: a dev check for a Robinhood Chain token or project from HEY Research Lab's
  public API — HEY's answer first, then the activity status in HEY's words, the last meaningful
  ship with its title and source, meaningful events in 30 days, the token contract and its
  verification, up to two unknowns and HEY's citation.
- Input: a contract address (or CAIP-10 on chain 4663), a `$TICKER`, a project name or slug, an
  `@handle`, or an x.com / twitter.com profile URL; validated before any request.
- A 1200×675 PNG card drawn with the bundled Geist font (`--out`, `--no-card`).
- The same-name notice: for a contract HEY has not published, the published project that
  carries its name or ticker on a different contract, from HEY's scan card.
- `--json` (schema `hey.check/v1`), `--tweet`, `--quiet`, `--no-color`.
- Exit codes 0–7, including 7 for an ambiguous match (HEY does not guess).
- The `hey-check` Agent Skill (`skills/hey-check/SKILL.md`) for Claude Code, Codex and Cursor.
