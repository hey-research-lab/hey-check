import { EXIT, type ExitCode } from './exit-codes.js';

export type ErrorDetails = {
  retryable?: boolean;
  requestId?: string;
  retryAfterSeconds?: number;
};

/** An error with a stable machine code, a human message and the exit code it ends the run with. */
export class CheckError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: ExitCode,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = 'CheckError';
  }
}

export const usageError = (code: string, message: string) =>
  new CheckError(code, message, EXIT.USAGE);

export const networkError = (code: string, message: string, details: ErrorDetails = {}) =>
  new CheckError(code, message, EXIT.NETWORK, { retryable: true, ...details });
