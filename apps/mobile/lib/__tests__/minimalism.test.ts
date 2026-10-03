// The minimalism guard (CLAUDE.md rule 16, issue #296). Rule 16 was prose; this makes the part
// of it that can be decided mechanically fail the gates:
//
// 1. Every file under app/ (an expo-router route, a layout or a router hook) stands in ROUTES
//    below, with one line on why the chat cannot carry it. A new screen without an entry is red.
//    A reason is a promise to the owner: "nice to have" is not one. Entries marked WEAK have a
//    reason that is thin today — they are listed honestly, not dressed up (issue #296).
// 2. Practice forms never get a picker of their own. The forms are `ItemKind` in the contract;
//    which form a question has is chosen by Buddy or by code, and it appears only inside the
//    existing practice screen. So nothing in the app may offer the forms: no route named
//    after a form, no use of the enum's full list, no list of two or more forms in a screen or
//    component (lib/ may keep a set behind a predicate, see UI_SOURCES). The
//    forms are read from the contract, not from a word list kept here (rule 3).
//    The other half — no request the app can send carries a form — is the contract test
//    packages/shared-types/src/contracts/__tests__/forms.test.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { ItemKind } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

const MOBILE = join(__dirname, '../..');
const APP = join(MOBILE, 'app');

/**
 * Every file under app/, by its path without the extension, and why the chat cannot carry it.
 * One line each. Adding a screen means adding a line here — and being able to write it.
 */
const ROUTES: Record<string, string> = {
  // ── not screens: the router's own files ──
  _layout:
    'not a screen: the one root Stack with the providers, session hydration, notification taps and the offline line',
  '+native-intent':
    'not a screen: rewrites the links the system hands over (iOS share extension) before the router sees them',
  '+not-found':
    'not a screen of its own: an unknown or stale deep link is sent on to the start screen',
  index:
    'not a screen of its own: the gate that sends her to welcome, consent, profile or Buddy, decided from the API',

  // ── PROTOTYPE, only on claude/train2-libs-312, never merged (issue #312) ──
  'proto-312':
    'WEAK: not a learner screen — the side-by-side library comparison of #312 Phase 1, shot for the owner',

  // ── the chat itself ──
  buddy: 'the chat itself — the one screen everything else is measured against',
  talk: 'the same thread hands-free: the microphone may only be on while a screen she opened herself is open, and it ends with that screen',

  // ── before there is a Buddy to talk to ──
  welcome:
    'sign-up and sign-in come before there is a Buddy, and a password never passes through the model',
  'reset-password':
    'opened from the reset e-mail without an app session; there is no conversation yet to carry it',
  consent:
    'explicit consent to a versioned privacy text before anything reaches the model (DSGVO Art. 6/8): a tap on that text, not a chat reply',
  profile:
    "birth date, language and, for a minor, the adult's consent and PIN must exist before Buddy may talk (DSGVO Art. 8, rule 6); the getting-to-know itself is the chat",
  onboarding:
    "WEAK: three skippable cards on how to talk to Buddy plus the colour choice — Buddy's first conversation could say the same; kept by owner request 28.09. and issue #136",

  // ── states in which the chat cannot work at all ──
  deleting:
    'the account is being deleted: nothing can be sent to Buddy any more, only signing out is left (docs/privacy.md)',
  update:
    'the API refuses this build (426): every request, the chat included, would fail until the app is updated',

  // ── things the model must never touch ──
  pin: "the adult's PIN is a secret the model must never see; entered in a modal and checked by the server",
  memory:
    'her right to see and correct everything Buddy keeps (DSGVO Art. 15/16, docs/privacy.md) needs the complete list with sources and versions, not a summary written by the model',
  settings:
    "contact opt-in, the parents' area behind the PIN, export and deletion are explicit controls the code enforces (rule 6), never a model's reading of a sentence",

  // ── the work itself ──
  capture:
    'camera, photo library and files need the full screen; pages go straight to storage and are checked by code, not passed through the chat',
  'practice/[id]':
    'the answer surfaces (typed, boards, staff, fraction bars, speaking) and the server-graded flow of one question at a time do not fit into chat bubbles',

  // ── looking things up (a browsed list may scroll, rule 16) ──
  history:
    'WEAK: the whole thread with what each answer changed, virtualised by day — the home already shows earlier messages one swipe up; the difference is completeness and per-answer changes',
  library:
    'WEAK: owner asked for a place to look things up herself (issue #189) — Buddy can also find a sheet on request; first of three look-up levels',
  'subject/[id]':
    'WEAK: second look-up level of issue #189 (one subject: sheets, exercises, topics) — the same reason as library, one level deeper',
  'material/[id]':
    'WEAK: one sheet with its questions, deleting a question and renaming the sheet by explicit tap — both also exist as Buddy tools (delete_item, rename_material), so the screen is for looking, issue #189',
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else out.push(p);
  }
  return out;
}

/** "app/practice/[id].tsx" → "practice/[id]" (any extension: expo-router reads .ts/.tsx/.js too). */
const routeOf = (file: string) =>
  relative(APP, file)
    .split(sep)
    .join('/')
    .replace(/\.[^./]+$/, '');

const routes = routeFiles(APP).map(routeOf).sort();

describe('every route stands in the allowlist with a reason (rule 16, issue #296)', () => {
  it('finds the routes it guards', () => {
    expect(routes).toContain('buddy');
    expect(routes).toContain('practice/[id]');
  });

  it('has no route that is not in the list', () => {
    const missing = routes.filter((r) => !(r in ROUTES));
    expect(
      missing,
      `New route(s) under apps/mobile/app/ without an entry in ROUTES (${__filename}). ` +
        'Rule 16: a new screen needs a reason the chat cannot carry it — first ask "can Buddy do this in the chat?"',
    ).toEqual([]);
  });

  it('has no entry for a route that is gone', () => {
    expect(Object.keys(ROUTES).filter((r) => !routes.includes(r))).toEqual([]);
  });

  it('gives every entry a one-line reason', () => {
    for (const [route, reason] of Object.entries(ROUTES)) {
      expect(reason.trim().length, route).toBeGreaterThanOrEqual(30);
      expect(reason, route).not.toMatch(/\n/);
    }
  });
});

// ─────────────── practice forms never get a picker ───────────────

const FORMS: readonly string[] = ItemKind.options;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const ALL_SOURCES = ['app', 'components', 'lib'].flatMap((d) => sources(join(MOBILE, d)));
/**
 * Where a picker would be drawn. `lib/` may keep a set of forms behind a predicate (which forms
 * take a worked path, lib/practice/pathEntry.ts) — that decides behaviour inside the one
 * practice screen, it offers nothing; drawing a choice happens in a screen or a component.
 */
const UI_SOURCES = ['app', 'components'].flatMap((d) => sources(join(MOBILE, d)));

/** Array literals (`[ … ]`) of string literals only, with the strings in them. */
function stringArrays(src: string): string[][] {
  const out: string[][] = [];
  for (const m of src.matchAll(
    /\[\s*((?:'[^'\n]*'|"[^"\n]*")(?:\s*,\s*(?:'[^'\n]*'|"[^"\n]*"))*)\s*,?\s*\]/g,
  ))
    out.push([...m[1]!.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((s) => s[1] ?? s[2]!));
  return out;
}

/** The places where two or more practice forms are listed side by side. */
function formLists(src: string): string[][] {
  return stringArrays(src).filter((xs) => new Set(xs.filter((x) => FORMS.includes(x))).size >= 2);
}

describe('practice forms are never offered as a choice (rule 16, issue #296)', () => {
  it('reads the forms from the contract', () => {
    expect(FORMS.length).toBeGreaterThan(3);
  });

  it('has no route named after a form', () => {
    const named = routes.filter((r) => r.split('/').some((seg) => FORMS.includes(seg)));
    expect(named).toEqual([]);
  });

  it('never enumerates the full list of forms', () => {
    const hits = ALL_SOURCES.filter((f) =>
      /\bItemKind\s*\.\s*(options|enum|Enum|Values)\b|\bMULTI_PART_KINDS\b/.test(
        readFileSync(f, 'utf8'),
      ),
    ).map((f) => relative(MOBILE, f));
    expect(hits).toEqual([]);
  });

  it('never lists two or more forms side by side in a screen or component', () => {
    const hits = UI_SOURCES.flatMap((f) =>
      formLists(readFileSync(f, 'utf8')).map((xs) => `${relative(MOBILE, f)}: [${xs.join(', ')}]`),
    );
    expect(hits).toEqual([]);
  });

  it('would catch a picker if one were written', () => {
    expect(formLists(`const FORMS = ['order', 'match', 'table_fill'];`)).toHaveLength(1);
    expect(formLists(`options={["short", "numeric"]}`)).toHaveLength(1);
    // One form, or two words that are no form, is not a list of forms.
    expect(formLists(`if (['order'].includes(k)) {}`)).toHaveLength(0);
    expect(formLists(`const sizes = ['small', 'large'];`)).toHaveLength(0);
  });
});
