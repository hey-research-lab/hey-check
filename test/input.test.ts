import { describe, expect, it } from 'vitest';

import { CheckError } from '../src/errors.js';
import { EXIT } from '../src/exit-codes.js';
import { parseInput, queryFor } from '../src/input.js';

const codeOf = (raw: string | undefined): string => {
  try {
    parseInput(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(CheckError);
    expect((error as CheckError).exitCode).toBe(EXIT.USAGE);
    return (error as CheckError).code;
  }
  throw new Error(`expected ${String(raw)} to be refused`);
};

describe('parseInput', () => {
  it('reads a contract address in either case and sends it lowercase', () => {
    const input = parseInput('0xD523A627030509021CC39B6D7C8543417D3E50D8');
    expect(input).toEqual({
      kind: 'address',
      raw: '0xD523A627030509021CC39B6D7C8543417D3E50D8',
      address: '0xd523a627030509021cc39b6d7c8543417d3e50d8',
    });
    expect(queryFor(input)).toEqual({
      key: 'address',
      value: '0xd523a627030509021cc39b6d7c8543417d3e50d8',
    });
    expect(parseInput('  0Xd523a627030509021cc39b6d7c8543417d3e50d8 ')).toMatchObject({
      kind: 'address',
      address: '0xd523a627030509021cc39b6d7c8543417d3e50d8',
    });
  });

  it('reads a CAIP-10 address on Robinhood Chain and refuses other chains', () => {
    expect(parseInput('eip155:4663:0xd523a627030509021cc39b6d7c8543417d3e50d8')).toMatchObject({
      kind: 'address',
      address: '0xd523a627030509021cc39b6d7c8543417d3e50d8',
    });
    expect(codeOf('eip155:1:0xd523a627030509021cc39b6d7c8543417d3e50d8')).toBe('unsupported_chain');
    expect(codeOf('eip155:04663:0xd523a627030509021cc39b6d7c8543417d3e50d8')).toBe(
      'unsupported_chain',
    );
  });

  it('refuses malformed addresses and the zero and burn addresses', () => {
    expect(codeOf('0x123')).toBe('invalid_address');
    expect(codeOf('0xd523a627030509021cc39b6d7c8543417d3e50d8aa')).toBe('invalid_address');
    expect(codeOf('0xg523a627030509021cc39b6d7c8543417d3e50d8')).toBe('invalid_address');
    expect(codeOf('0x0000000000000000000000000000000000000000')).toBe('not_a_contract_identity');
    expect(codeOf('0x000000000000000000000000000000000000dEaD')).toBe('not_a_contract_identity');
  });

  it('reads a $TICKER', () => {
    expect(parseInput('$CHIT')).toEqual({ kind: 'ticker', raw: '$CHIT', q: '$CHIT' });
    expect(parseInput('$chit')).toMatchObject({ q: '$chit' });
    expect(codeOf('$')).toBe('invalid_input');
    expect(codeOf('$CH IT')).toBe('invalid_input');
    expect(codeOf('$TOOLONGTICKERTOOLONGTICKER')).toBe('invalid_input');
  });

  it('reads an @handle', () => {
    expect(parseInput('@loomdesktrade')).toEqual({
      kind: 'handle',
      raw: '@loomdesktrade',
      q: '@loomdesktrade',
    });
    expect(codeOf('@')).toBe('invalid_input');
    expect(codeOf('@has-dash')).toBe('invalid_input');
    expect(codeOf('@abcdefghijklmnop')).toBe('invalid_input');
  });

  it('extracts the handle from an x.com or twitter.com profile URL', () => {
    for (const url of [
      'https://x.com/loomdesktrade',
      'https://x.com/loomdesktrade/',
      'https://x.com/loomdesktrade/status/123?s=20',
      'http://twitter.com/loomdesktrade',
      'https://mobile.twitter.com/loomdesktrade',
      'www.x.com/loomdesktrade',
      'x.com/loomdesktrade',
    ]) {
      expect(parseInput(url)).toMatchObject({ kind: 'x_profile', q: '@loomdesktrade' });
    }
    expect(codeOf('https://x.com/')).toBe('invalid_input');
    expect(codeOf('https://x.com/home')).toBe('invalid_input');
    expect(codeOf('https://x.com/i/flow/login')).toBe('invalid_input');
    expect(codeOf('https://x.com/search?q=chit')).toBe('invalid_input');
    expect(codeOf('https://evilx.com/loomdesktrade')).toBe('invalid_input');
    expect(codeOf('https://x.com.example.org/loomdesktrade')).toBe('invalid_input');
    expect(codeOf('https://user:pw@x.com/loomdesktrade')).toBe('invalid_input');
  });

  it('reads a project name or slug', () => {
    expect(parseInput('loom')).toEqual({ kind: 'name', raw: 'loom', q: 'loom' });
    expect(parseInput('loomdesk-hq-mcp')).toMatchObject({ kind: 'name', q: 'loomdesk-hq-mcp' });
    expect(parseInput('Hey Research Lab')).toMatchObject({ kind: 'name', q: 'Hey Research Lab' });
    expect(parseInput('Ёлка')).toMatchObject({ kind: 'name' });
  });

  it('refuses junk before any request', () => {
    expect(codeOf(undefined)).toBe('missing_argument');
    expect(codeOf('   ')).toBe('missing_argument');
    expect(codeOf('https://example.org/x')).toBe('invalid_input');
    expect(codeOf('javascript:alert(1)')).toBe('invalid_input');
    expect(codeOf('../../etc/passwd')).toBe('invalid_input');
    expect(codeOf('<script>')).toBe('invalid_input');
    expect(codeOf('name\u202Eevil')).toBe('invalid_input');
    expect(codeOf('a\u001b[31m')).toBe('invalid_input');
    expect(codeOf('x'.repeat(201))).toBe('invalid_input');
    expect(codeOf('-loom')).toBe('invalid_input');
  });
});
