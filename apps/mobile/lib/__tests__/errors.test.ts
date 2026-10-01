// The promise behind every failure the learner ever reads: one messageFor(), no codes, no
// blame, no English (issue #183 — `The stream is not in a state that permits close`, raised by
// the fetch polyfill, stood on a child's screen in the engine's own words).
//
// So this does not test the one error that got through. It walks a pile of realistic
// throwables — engine TypeErrors, a bare string, null, something that only looks like an
// ApiError — and holds every answer against the German locale files themselves: the result
// must be a text someone wrote for her, character for character. Anything passed through
// instead of translated fails here, whether or not anyone thought of that case.
//
// Only the two Expo seams i18n needs are replaced (the device's language list, the key-value
// store a chosen language is kept in); i18next, the resources and the locale JSON are the real
// ones, so what this asserts is what she would read.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'de' }] }));
vi.mock('../api/outboxStorage.js', () => ({
  readItem: () => Promise.resolve(null),
  writeItem: () => Promise.resolve(),
}));

const { messageFor, turnFailureText } = await import('../errors.js');
const { ApiError } = await import('../api/apiError.js');
const { AuthFailure, AUTH_FAILURE_REASONS } = await import('../auth/authFailure.js');

const LOCALES = join(__dirname, '../../locales/de');

type Tree = { [key: string]: string | Tree };

/** Every text in a namespace, flat — what the app is allowed to say. */
function texts(file: string): string[] {
  const walk = (tree: Tree): string[] =>
    Object.values(tree).flatMap((v) => (typeof v === 'string' ? [v] : walk(v)));
  return walk(JSON.parse(readFileSync(join(LOCALES, file), 'utf8')) as Tree);
}

/** Written for her, in her language: the only strings a failure may ever become. */
const OWN_WORDS = new Set([...texts('errors.json'), ...texts('auth.json')]);

const ENGINE_ERROR = 'The stream is not in a state that permits close';

/**
 * What really gets thrown at a `catch (err)` in this app. Anything here must come out as one
 * of her texts; the names are what the failure would look like in the owner's hands.
 */
const THROWN: readonly [string, unknown][] = [
  // The one from issue #183: raised inside the fetch polyfill, in English, in jargon.
  ['a stream TypeError from the fetch polyfill', new TypeError(ENGINE_ERROR)],
  ['a plain Error with an English sentence', new Error('Network request failed')],
  ['an Error with no message at all', new Error()],
  ['a RangeError from a library', new RangeError('Maximum call stack size exceeded')],
  ['an AggregateError', new AggregateError([new Error(ENGINE_ERROR)], 'All promises rejected')],
  // Not everything thrown is an Error.
  ['a bare string', ENGINE_ERROR],
  ['null', null],
  ['undefined', undefined],
  ['a number', 500],
  ['an object that merely has a message', { message: ENGINE_ERROR }],
  ['an object that merely looks like an ApiError', { code: 'internal', message: ENGINE_ERROR }],
  ['an object with a reason the locales happen to know', { reason: 'wrong_pin' }],
  ['an Error whose message is a locale key', new Error('errors:code.internal')],
  // The API envelope, as the server really answers it.
  ['an ApiError with a known code', new ApiError('rate_limited', 'Too many requests', 429)],
  ['an ApiError with a code nobody wrote a text for', new ApiError('teapot', 'I am a teapot', 418)],
  ['an ApiError whose message is the engine sentence', new ApiError('internal', ENGINE_ERROR, 500)],
  [
    'an ApiError with a known reason',
    new ApiError('conflict', 'Changed', 409, { reason: 'stream_lost' }),
  ],
  [
    'an ApiError with a reason nobody wrote a text for',
    new ApiError('internal', 'Boom', 500, { reason: 'nobody_wrote_this' }),
  ],
  [
    'an ApiError whose reason is the engine sentence',
    new ApiError('internal', 'Boom', 500, { reason: ENGINE_ERROR }),
  ],
  ['an ApiError with a non-string reason', new ApiError('internal', 'Boom', 500, { reason: 7 })],
];

describe('messageFor says only what the app itself wrote', () => {
  it.each(THROWN)('%s', (_name, thrown) => {
    const said = messageFor(thrown);
    expect(OWN_WORDS.has(said), `not one of the app's own texts: ${JSON.stringify(said)}`).toBe(
      true,
    );
  });

  it.each(AUTH_FAILURE_REASONS)('an AuthFailure (%s) has its own text', (reason) => {
    expect(OWN_WORDS.has(messageFor(new AuthFailure(reason)))).toBe(true);
  });

  it('never repeats the engine, the code or the key', () => {
    for (const [, thrown] of THROWN) {
      const said = messageFor(thrown);
      expect(said).not.toContain(ENGINE_ERROR);
      expect(said).not.toContain('errors:');
      expect(said).not.toContain('auth:');
      // Nothing the thrown value itself carries: not its message, not its own string form.
      expect(said).not.toBe(String(thrown));
      if (thrown instanceof Error && thrown.message) expect(said).not.toContain(thrown.message);
    }
  });

  it('a failed turn says one of her texts too, whatever code the server sends', () => {
    for (const code of [null, 'model_unavailable', 'budget_exhausted', 'something_new', '']) {
      expect(OWN_WORDS.has(turnFailureText(code))).toBe(true);
    }
  });
});

// ─────────────── and no second way in ───────────────

/**
 * messageFor() only keeps the promise while it is the only door. Read from the source, the way
 * lib/__tests__/wiring.test.ts does: every message the app puts in the toast comes from the
 * locale files (`t(…)`, `i18n.t(…)`) or from messageFor(…) — never from a caught error.
 *
 * Two places hand on a text their caller already translated; they are named here with where it
 * comes from, so the list stays shorter than the temptation to add to it.
 */
const TRANSLATED_BY_THE_CALLER: Record<string, readonly string[]> = {
  // change(m, body, done, undo) — `done` is t('memory:…') at every call site.
  'app/memory.tsx': ['done'],
  // copyMessage(text, said) — `said` is { copied: t(…), failed: t(…) } from the menu.
  'components/buddy/MessageMenu.tsx': ['said.copied', 'said.failed'],
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The first argument of a call, by balancing brackets — "t('a', { b: c })" stays one piece. */
function firstArgument(code: string, from: number): string {
  let depth = 0;
  let i = from;
  let start = from;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) break;
    } else if (c === ',' && depth === 1) break;
  }
  return code.slice(start, i);
}

const MOBILE = join(__dirname, '../..');

describe('nothing else reaches the toast', () => {
  it('every toast text comes from the locale files or from messageFor', () => {
    const raw: string[] = [];
    let seen = 0;
    for (const dir of ['app', 'components', 'lib']) {
      for (const file of sources(join(MOBILE, dir))) {
        const code = readFileSync(file, 'utf8');
        const where = file.slice(MOBILE.length + 1);
        for (const m of code.matchAll(/toast\.show\(/g)) {
          seen++;
          const arg = firstArgument(code, (m.index ?? 0) + 'toast.show'.length);
          const flat = arg.replace(/\s+/g, ' ').trim();
          const translated =
            /\bt\(/.test(flat) || /\bmessageFor\(/.test(flat) || /\bi18n\.t\(/.test(flat);
          const allowed = (TRANSLATED_BY_THE_CALLER[where] ?? []).includes(flat);
          // …and a text that is translated may still have something raw stitched into it:
          // `${t('…')} ${err.message}` would read as half German, half engine.
          const raws = /\.message\b|\bString\(|\.stack\b|\btoString\(/.test(flat);
          if ((!translated && !allowed) || raws) raw.push(`${where}: toast.show(${flat})`);
        }
      }
    }
    // The scan itself must keep working: a rename that finds nothing would pass silently.
    expect(seen).toBeGreaterThan(50);
    expect(raw).toEqual([]);
  });
});
