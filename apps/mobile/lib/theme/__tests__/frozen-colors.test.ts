// Theme colours must be read at render time (issue #84). `applyPalette` mutates the live
// token objects (LB, TYPE, SHADOW, TONE_*, FIGURE); a module-scope constant that captures a
// value from them keeps the start palette forever — the tree remounts on a theme change,
// but modules are not re-evaluated. That is how pastel-dark ink ended up invisible on the
// night background. Two guards:
//   1. applyPalette really refills TYPE and SHADOW in place (identity preserved).
//   2. No source file captures a live token value in a module-scope constant.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyPalette, LB } from '../colors.js';
import { DEFAULT_THEME, paletteOf } from '../palettes.js';
import { SHADOW } from '../shadow.js';
import { TYPE } from '../type.js';

describe('theme tokens stay live across a palette change', () => {
  it('refills TYPE and SHADOW in place when the palette changes', () => {
    const body = TYPE.body; // a held reference, like a component module would hold
    const soft = SHADOW.soft;
    try {
      applyPalette('pastellDark');
      const night = paletteOf('pastellDark');
      expect(LB.ink).toBe(night.ink);
      expect(TYPE.body.color).toBe(night.ink);
      expect(TYPE.label.color).toBe(night.ink2);
      // The very same objects, not replacements: held references must see the new colours.
      expect(body.color).toBe(night.ink);
      expect(soft.shadowColor).toBe(night.shadowColor);
    } finally {
      applyPalette(DEFAULT_THEME);
    }
    expect(TYPE.body.color).toBe(paletteOf(DEFAULT_THEME).ink);
  });
});

// ─────────────── the scanner ───────────────

const ROOTS = ['app', 'components', 'lib'];
const LIVE_TOKENS = /\b(LB|SHADOW|TYPE|TONE_BG|TONE_DEEP|FIGURE)\./;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Column-0 const initializers that read a live token: they freeze the start palette. */
function frozenCaptures(path: string): string[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  const hits: string[] = [];
  const depthOf = (l: string) =>
    (l.match(/[{([]/g)?.length ?? 0) - (l.match(/[})\]]/g)?.length ?? 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!/^(export )?const \w/.test(line)) continue;
    const block = [line];
    let depth = depthOf(line);
    let j = i + 1;
    // A declaration whose type annotation spans lines (`const X: Record<\n …\n> = {`)
    // reaches its opening brace only later: keep consuming until the initializer opens
    // or the statement ends — this exact shape hid Btn's frozen VARIANT_STYLE (issue #84).
    while (j < lines.length && depth <= 0 && !/;\s*$/.test(block[block.length - 1]!)) {
      block.push(lines[j]!);
      depth += depthOf(lines[j]!);
      j++;
    }
    // An initializer that is itself a function reads at call time — that is the fix. The
    // arrow may sit lines below the `const` when the return type spans lines, so this is
    // checked on everything up to the opening brace, not on the first line alone.
    if (block.some((l) => /=>|\bfunction\b/.test(l))) {
      i = j - 1;
      continue;
    }
    while (j < lines.length && depth > 0) {
      block.push(lines[j]!);
      depth += depthOf(lines[j]!);
      j++;
    }
    if (LIVE_TOKENS.test(block.join('\n'))) hits.push(`${path}:${i + 1}: ${line.trim()}`);
    i = j - 1;
  }
  return hits;
}

describe('no module-scope capture of live theme tokens', () => {
  it('every LB/TYPE/SHADOW/TONE/FIGURE read happens at render time', () => {
    const root = join(__dirname, '../../..');
    const hits = ROOTS.flatMap((r) => sourceFiles(join(root, r))).flatMap(frozenCaptures);
    expect(hits, 'convert these to functions read at render time (issue #84)').toEqual([]);
  });
});

// The provider must not remount the tree on a palette change (issue #148). It used to,
// with `key={name}`, and that threw away every screen's state — the onboarding jumped back
// to its first card, a half-typed message would have gone the same way. The two guards
// above are what makes the remount unnecessary; this keeps someone from putting it back
// without reading why.
describe('a palette change keeps the screen it is on', () => {
  it('has no key on the provider that would remount its children', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'ThemeProvider.tsx'), 'utf8');
    expect(src).not.toMatch(/<\w+\s+key=\{name\}/);
    expect(src).toMatch(/issue #148/);
  });
});
