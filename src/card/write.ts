import { closeSync, constants, lstatSync, openSync, statSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CheckError } from '../errors.js';
import { EXIT } from '../exit-codes.js';
import { type CheckResult } from '../hey.js';
import { type CheckInput } from '../input.js';

const cardError = (message: string) =>
  new CheckError('card_not_written', message, EXIT.CARD_FAILED);

/** `hey-check-<slug>.png`, `hey-check-0xdcfe-50d8.png` or `hey-check-<query>.png`: one safe name. */
export function defaultCardName(result: CheckResult, input: CheckInput): string {
  let stem: string;
  if (result.outcome === 'answered') stem = result.project.slug;
  else if (input.kind === 'address')
    stem = `${input.address.slice(0, 6)}-${input.address.slice(-4)}`;
  else {
    stem = input.q
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
  return `hey-check-${stem || 'result'}.png`;
}

/**
 * Writes the PNG to exactly `path` and nowhere else: no temporary files, no directories
 * created. A symlink (or anything but a regular file) at the path is refused, and on systems
 * that support it the file is opened with O_NOFOLLOW so a symlink swapped in at the last moment
 * is refused too. The parent directory must exist.
 */
export function writeCard(path: string, png: Buffer, cwd: string): string {
  if (!path.toLowerCase().endsWith('.png')) throw cardError('The card path must end in .png.');
  const target = resolve(cwd, path);
  let parent;
  try {
    parent = statSync(dirname(target));
  } catch {
    throw cardError(`The directory ${dirname(target)} does not exist.`);
  }
  if (!parent.isDirectory()) throw cardError(`${dirname(target)} is not a directory.`);
  let existing;
  try {
    existing = lstatSync(target);
  } catch {
    existing = null;
  }
  if (existing?.isSymbolicLink()) {
    throw cardError(`${target} is a symbolic link; hey-check does not write through links.`);
  }
  if (existing && !existing.isFile()) throw cardError(`${target} exists and is not a file.`);

  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  let fd: number;
  try {
    fd = openSync(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow,
      0o644,
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP')
      throw cardError(`${target} is a symbolic link; hey-check does not write through links.`);
    throw cardError(`Could not write ${target}${code ? ` (${code})` : ''}.`);
  }
  try {
    writeSync(fd, png);
  } finally {
    closeSync(fd);
  }
  return target;
}
