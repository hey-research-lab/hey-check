# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
