/**
 * Exit codes. 0 and 2–6 are shared by every HEY Research Lab CLI; 1 and 7 say what they mean
 * for hey-check.
 */
export const EXIT = {
  /** HEY answered: a published project, with its builder evidence. */
  OK: 0,
  /** The answer printed, but the card could not be written (bad path, symlink, no permission). */
  CARD_FAILED: 1,
  /** Usage error: a bad flag, input that is not an address/ticker/name/handle, `unsupported_chain`. */
  USAGE: 2,
  /** HEY refused the request (an `invalid_request` other than `ambiguous`, a 4xx other than 404/429). */
  REFUSED: 3,
  /** HEY holds no published project for the input (`not_found`). */
  NOT_FOUND: 4,
  /** Rate limited (429): retry after the printed delay. */
  RATE_LIMITED: 5,
  /** Network failure, timeout, redirect, an unreadable or oversized answer, or a HEY 5xx. */
  NETWORK: 6,
  /** More than one published project matches: HEY lists them and does not guess; pick one. */
  AMBIGUOUS: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
