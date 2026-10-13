// One head on every screen (owner rule 1, #599; design components/buddy/Header.jsx, HANDOFF §4):
// Buddy's orb sits in the head, the head carries the Vorlesen switch and ⋯, and no page draws a
// second Buddy in its content. Read from the source, like `oneVoice.test.ts`:
//
//   · every route renders the shared head (`Screen` with a title or a way back, or the chat's
//     `Header`) — unless it stands in HEADLESS with the reason the design gives;
//   · a `<Screen>` without a head is only the shell of one of those pages;
//   · the orb is drawn by the head and by the few pages whose stage it is, nowhere else;
//   · ⋯ is left out, and the head's right end replaced, only where the lists below say why.
//
// What a browser alone can measure — the moon clear of the title, the switch and ⋯ whole at
// 360 — is tests/web/header.spec.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

/** The router's own files: no screen is drawn by them. */
const NOT_SCREENS = new Set(['_layout', '+native-intent', '+not-found']);

/**
 * Routes that render without the shared head, and why. Only shrinks: `tools/guards/no-growth.mjs`
 * compares it with main (`tools/guards/source-lists.mjs`).
 */
const HEADLESS: Record<string, string> = {
  welcome: 'sign-in: before there is a Buddy to talk to, his large orb is the page (HANDOFF §4)',
  'reset-password': 'opened from an e-mail without a session: the sign-in page’s shape',
  consent: 'setup step (`SetupStep`): the orb stands left above the headline (Onboarding.jsx)',
  profile: 'setup step (`SetupStep`): the orb stands left above the headline (Onboarding.jsx)',
  onboarding: 'setup step (`SetupStep`): the orb stands left above the headline (Onboarding.jsx)',
  talk: 'the conversation: the large orb is the stage (HANDOFF §4, ui_kits/app/Talk.jsx)',
  update: 'design `SystemState`: no head, the page’s own orb waits (States.jsx `StateScreen`)',
  deleting: 'design `SystemState`: no head, the page’s own orb thinks (States.jsx `StateScreen`)',
  index: 'the gate: it redirects; its one error page has no head and no orb yet (open on #599)',
};

/** Files that draw `<Screen>` without a head: the shells of the headless pages above. */
const BARE_SHELL = [
  'app/deleting.tsx',
  'app/index.tsx',
  'app/update.tsx',
  'components/auth/SetupStep.tsx',
];

/** Who draws Buddy. The head, the stages of the headless pages, and the app's own loading. */
const ORB_HOLDERS = [
  'app/reset-password.tsx',
  'app/welcome.tsx',
  'components/auth/SetupStep.tsx',
  // "Buddy arbeitet" in the conversation (issue #258) — a chat part, not this guard's to move.
  'components/buddy/WorkingNote.tsx',
  'components/lb/BuddyHeader.tsx',
  'components/lb/EmptyState.tsx',
  'components/lb/LoadingState.tsx',
  'components/lb/SplashHandoff.tsx',
  'components/voice/TalkOrb.tsx',
];

/** The one head without ⋯: `menu={null}` on its `<Screen>`. */
const NO_MENU = ['app/pin.tsx'];

/**
 * Heads whose right end is not yet the shared one. Only shrinks
 * (`tools/guards/source-lists.mjs`):
 *  · `right` — the switch and ⋯ replaced by a right end of the screen's own;
 *  · `menu={{ own }}` — a ⋯ the screen draws itself, with its own sheet.
 */
const OWN_END: Record<string, string> = {
  'app/practice/[id].tsx':
    '`own`: a question’s "Frage passt nicht" / "Einspruch" has its own ⋯ sheet until `MenuSheet` can carry a screen’s action with its hint',
};

type Source = { file: string; text: string };

function sources(dir: string): Source[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name)
      ? [{ file: relative(ROOT, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];
const holders = (pattern: RegExp) =>
  app
    .filter((s) => pattern.test(s.text))
    .map((s) => s.file)
    .sort();

/** Every `<tag …>` in a file, with the names of the props it is given (`...` for a spread). */
function elements(source: Source, tag: string): Array<{ line: number; props: Set<string> }> {
  const out: Array<{ line: number; props: Set<string> }> = [];
  if (!source.text.includes(`<${tag}`)) return out;
  const tree = ts.createSourceFile(
    source.file,
    source.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  (function walk(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === tag
    ) {
      const props = new Set<string>();
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute)) {
          const value = attribute.initializer;
          // `menu={null}` and `menu={{ own: … }}` are told apart from the shared menu: the
          // guards below read them.
          const given =
            value !== undefined && ts.isJsxExpression(value) ? value.expression : undefined;
          const name = attribute.name.getText();
          if (given?.kind === ts.SyntaxKind.NullKeyword) props.add(`${name}=null`);
          else if (
            given !== undefined &&
            ts.isObjectLiteralExpression(given) &&
            given.properties.some((p) => p.name?.getText() === 'own')
          )
            props.add(`${name}=own`);
          else props.add(name);
        } else props.add('...');
      }
      out.push({ line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1, props });
    }
    node.forEachChild(walk);
  })(tree);
  return out;
}

/** A `<Screen>` draws the head as soon as it has one of these (components/lb/Screen.tsx). */
const HEAD_PROPS = ['title', 'back', 'leading', '...'];
const headed = (props: Set<string>) => HEAD_PROPS.some((p) => props.has(p));

const routeOf = (file: string) => file.replace(/^app\//, '').replace(/\.[^./]+$/, '');
const routes = app.filter((s) => s.file.startsWith('app/') && !NOT_SCREENS.has(routeOf(s.file)));

describe('every screen has the one head, with Buddy in it (owner rule 1, #599)', () => {
  it('finds the routes it guards', () => {
    expect(routes.map((r) => routeOf(r.file))).toEqual(
      expect.arrayContaining(['buddy', 'pin', 'practice/[id]', 'settings']),
    );
  });

  it('renders the shared head on every route that is not listed as headless', () => {
    const without = routes
      .filter((r) => !(routeOf(r.file) in HEADLESS))
      .filter((r) => {
        const chat = elements(r, 'Header').length > 0;
        const shell = elements(r, 'Screen');
        return !chat && !shell.some((s) => headed(s.props));
      })
      .map((r) => r.file);
    expect(
      without,
      'A route without the shared head. Give its <Screen> a title (and the state its orb shows), ' +
        'or — if the design draws this page without a head — add it to HEADLESS with that reason.',
    ).toEqual([]);
  });

  it('draws no <Screen> without a head outside the shells of the headless pages', () => {
    const bare = app.flatMap((s) =>
      BARE_SHELL.includes(s.file)
        ? []
        : elements(s, 'Screen')
            .filter((e) => !headed(e.props))
            .map((e) => `${s.file}:${e.line}`),
    );
    expect(
      bare,
      'A state of a screen (loading, an error) drawn without the head: the orb and the way out ' +
        'belong to every state. Pass title and state (design ui_kits/app/Extra.jsx `SystemState`).',
    ).toEqual([]);
  });

  it('has no entry for a route or a shell that is gone, and gives each a reason', () => {
    const known = routes.map((r) => routeOf(r.file));
    expect(Object.keys(HEADLESS).filter((r) => !known.includes(r))).toEqual([]);
    for (const file of [...BARE_SHELL, ...ORB_HOLDERS, ...NO_MENU, ...Object.keys(OWN_END)])
      expect(
        app.some((s) => s.file === file),
        file,
      ).toBe(true);
    for (const [entry, reason] of Object.entries({ ...HEADLESS, ...OWN_END }))
      expect(reason.trim().length, entry).toBeGreaterThanOrEqual(30);
  });
});

describe('Buddy is drawn once per screen (HANDOFF §4)', () => {
  it('only by the head and by the pages whose stage he is', () => {
    expect(holders(/<BuddyOrb\b/)).toEqual(ORB_HOLDERS);
  });

  it('under a head, a wait says its line without a second orb', () => {
    // `LoadingState` brings an orb for the pages without a head (app start, checking a link).
    const doubled = app.flatMap((s) => {
      if (!elements(s, 'Screen').some((e) => headed(e.props))) return [];
      return elements(s, 'LoadingState')
        .filter((e) => !e.props.has('orb'))
        .map((e) => `${s.file}:${e.line}`);
    });
    expect(doubled, 'Pass orb={false}: the head already shows Buddy thinking.').toEqual([]);
  });
});

describe('the switch and ⋯ are the head’s own (Header.jsx:23–25)', () => {
  it('the head draws both itself; no screen hands it a speaker any more', () => {
    const head = app.find((s) => s.file === 'components/lb/BuddyHeader.tsx')?.text ?? '';
    expect(head).toMatch(/<ReadAloudSwitch\b/);
    expect(head).toMatch(/icon="more"/);
  });

  it('⋯ opens one sheet, wired once', () => {
    expect(holders(/<MenuSheet\b/)).toEqual(['components/buddy/HeaderMenu.tsx']);
    expect(holders(/<HeaderMenu\b/)).toEqual([
      // The home before it has loaded: only the places.
      'app/buddy.tsx',
      // The chat: the ways to start before the places.
      'components/buddy/StartSheets.tsx',
      // Every other screen.
      'components/lb/Screen.tsx',
    ]);
  });

  it('is left out only where a menu would mislead', () => {
    const none = app
      .filter((s) => elements(s, 'Screen').some((e) => e.props.has('menu=null')))
      .map((s) => s.file);
    expect(none).toEqual(NO_MENU);
  });

  it('is replaced by something of the screen’s own only on the list that shrinks', () => {
    const own = app
      .filter((s) =>
        elements(s, 'Screen').some((e) => e.props.has('right') || e.props.has('menu=own')),
      )
      .map((s) => s.file);
    expect(own.sort()).toEqual(Object.keys(OWN_END).sort());
  });
});
