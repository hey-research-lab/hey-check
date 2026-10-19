# Security policy

## Reporting a vulnerability

Please email hi@heyresearch.xyz with "security" in the subject (the contact published at
<https://heyresearch.xyz/.well-known/security.txt>). If this repository's Security tab offers
"Report a vulnerability", you can report there privately instead. Do not open a public issue.
We aim to acknowledge within 3 working days. There is no bug bounty for this repository.

## Scope

`hey-check` is a read-only client of HEY Research Lab's public API that also writes one PNG file.

- **Network:** HTTPS GET requests to `https://heyresearch.xyz` only — at most two a run
  (`/api/agent/research_project`, and `/api/v1/scan` for a contract HEY has not published). No
  redirect is followed (a 3xx is a failure), no cookies or credentials are sent, a request is
  abandoned after 15 seconds and an answer larger than 1 MiB is not read. It never calls
  `POST /api/scan`, an account route or a write route, and never fetches a URL found inside an
  answer.
- **Untrusted input:** the argument is validated before any request: a 0x address of exactly 40
  hex characters (the zero and burn addresses refused), a CAIP-10 address on chain 4663 only, a
  `$TICKER`, an `@handle`, an x.com or twitter.com profile URL (the handle is extracted; any other
  URL is refused), or a name of letters, digits and a few joining characters. Control, invisible
  and bidirectional-override characters are refused.
- **Untrusted output:** HEY's answers are parsed as JSON and refused if they carry a `__proto__`,
  `constructor` or `prototype` key. Project names, ship titles and other source text are stripped
  of control characters (including terminal escape sequences), invisible and
  bidirectional-override characters and lone surrogates, folded onto one line and bounded before
  they reach the terminal, the JSON or the card. In the card's SVG every string is XML-escaped;
  the SVG is built in code and contains no scripts, links or external references. URLs are
  relayed only when they are `https:`.
- **Local files:** the card is written to exactly the path shown (`./hey-check-<slug>.png` or
  `--out`, which must end in `.png`). A symbolic link or anything but a regular file at that path
  is refused, and the file is opened with `O_NOFOLLOW` where the system supports it. No
  directories or temporary files are created. Nothing else is read or written except the bundled
  fonts in `assets/fonts/`, which are loaded by path; system fonts are never loaded.
- **Processes:** none are spawned.
- **Test-only override:** an undocumented base-URL environment variable exists for tests and local
  mocks. It accepts an `https:` origin, or `http:` on `localhost`/`127.0.0.1`, with no path or
  query.

## Handling secrets

This project never needs HEY credentials and reads no API key. It sends no token and stores
nothing. Never commit a `.env` with values.

## Supported versions

The latest 0.x minor receives fixes.
