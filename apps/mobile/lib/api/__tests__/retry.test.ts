// One rule for "is trying again worth it" (issue #315, audit #311 D9). The practice screen and
// the speaking panel each had a copy, and they disagreed on HTTP 429: the panel offered
// "Nochmal senden" after a "slow down", the screen offered no retry at all when loading the
// session hit the limit — only the way back. A limit is passed by waiting; a day's model
// budget (also 429) is not.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ApiError, isOutdated, isRetryable } from '../apiError';

const MOBILE = join(__dirname, '../../..');

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}

describe('isRetryable', () => {
  it('tries again after a rate limit, the network or the server', () => {
    expect(isRetryable(new ApiError('rate_limited', 'slow down', 429))).toBe(true);
    expect(isRetryable(new ApiError('internal', 'oops', 500))).toBe(true);
    expect(isRetryable(new ApiError('model_unavailable', 'down', 503))).toBe(true);
    expect(isRetryable(new TypeError('Network request failed'))).toBe(true);
  });

  it('does not offer the same request again when it cannot get better', () => {
    // The day's model budget is a 429 too, but waiting a moment does not lift it.
    expect(isRetryable(new ApiError('budget_exhausted', 'today is used up', 429))).toBe(false);
    expect(isRetryable(new ApiError('invalid_input', 'bad', 422))).toBe(false);
    expect(isRetryable(new ApiError('forbidden', 'no', 403))).toBe(false);
    expect(isRetryable(new ApiError('conflict', 'closed', 409))).toBe(false);
  });
});

describe('isOutdated', () => {
  it('is a conflict or a gone session, nothing else', () => {
    expect(isOutdated(new ApiError('conflict', 'closed', 409))).toBe(true);
    expect(isOutdated(new ApiError('not_found', 'gone', 404))).toBe(true);
    expect(isOutdated(new ApiError('rate_limited', 'slow down', 429))).toBe(false);
    expect(isOutdated(new Error('x'))).toBe(false);
  });
});

describe('one copy of the rule', () => {
  it('no screen or component keeps a retry rule of its own', () => {
    const copies: string[] = [];
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of sources(join(MOBILE, dir))) {
        if (/function (retryable|outdated)\(/.test(readFileSync(file, 'utf8'))) {
          copies.push(relative(MOBILE, file));
        }
      }
    }
    expect(copies).toEqual([]);
  });
});
