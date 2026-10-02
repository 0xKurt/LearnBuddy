// `public/index.html` is generated from the palettes (issue #194). This fails when it is
// stale — the one way a colour could silently exist twice (issue #84).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// A plain .mjs generator, deliberately not TypeScript: it has to run with bare node
// during a build, without a transform step.
import { shellHtml } from '../../../scripts/write-web-shell.mjs';
import { GROUNDS } from '../ground.js';
import { DEFAULT_MODE, FAMILIES } from '../palettes.js';

const here = dirname(fileURLToPath(import.meta.url));
const shell = resolve(here, '../../../public/index.html');

describe('the page before the app', () => {
  it('is what the generator writes today', () => {
    const expected = (shellHtml as (g: unknown, f: unknown, m: unknown) => string)(
      GROUNDS,
      [...FAMILIES],
      DEFAULT_MODE,
    );
    expect(readFileSync(shell, 'utf8')).toBe(expected);
  });

  it('carries every palette ground, so no colour is written down twice', () => {
    const html = readFileSync(shell, 'utf8');
    for (const [name, ground] of Object.entries(GROUNDS)) {
      expect(html, name).toContain(`"${name}":"${ground}"`);
    }
  });

  it('runs before anything else in the head', () => {
    const html = readFileSync(shell, 'utf8');
    // A deferred or external script would run after the browser has already painted.
    expect(html).not.toMatch(/<script[^>]+(src|defer|async)/);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
  });
});
