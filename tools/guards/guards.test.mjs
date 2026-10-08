// The guards' own tests (issue #313, docs/engineering-guards.md). Run by `pnpm guards` (part of
// `pnpm lint` and the pre-commit hook) with node's own test runner.
//
// "Only shrinks" has two halves: the code may not get worse than main (the lint rules,
// clones.mjs, knip.mjs — all against main's measurement, base.mjs), and what got better stays
// better, because main's measurement IS the list (issue #452). Both are tested here.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ESLint, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

import { activeGrants, baseSha, GROWTH_DIR, measureFiles, withGrants } from './base.mjs';
import plugin from './eslint-plugin.mjs';
import { MAX_AGE_HOURS, staleHours } from './fresh-base.mjs';
import { growth, LISTS, TRAILER } from './no-growth.mjs';
import { prBodyProblems } from './pr-body.mjs';
import { fileOf, isWeak, SOURCE_LISTS, sourceList } from './source-lists.mjs';
import { REPO_ROOT, UI_DIRS, sourceFiles } from './measure.mjs';

const exists = (/** @type {string} */ f) => existsSync(join(REPO_ROOT, f));

/**
 * A throwaway repository with `main` (inside the pre-commit hook git exports GIT_DIR,
 * GIT_INDEX_FILE … — inherited, they point a throwaway repository's commands at the REAL one;
 * it happened: commits and config written into the project's .git). So: none of the hook's
 * GIT_* variables, no global or system config, every setting passed with -c.
 */
function playground() {
  const repo = mkdtempSync(join(tmpdir(), 'lb-guards-'));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  );
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  const git = (/** @type {string[]} */ ...args) =>
    execFileSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=t', ...args], {
      cwd: repo,
      env,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  const write = (/** @type {string} */ file, /** @type {string} */ text) => {
    mkdirSync(join(repo, file, '..'), { recursive: true });
    writeFileSync(join(repo, file), text);
  };
  git('init', '-q', '-b', 'main');
  // The guard against the leak itself: this must be the throwaway repository.
  assert.equal(git('rev-parse', '--show-toplevel').trim(), realpathSync(repo));
  return { repo, git, write, done: () => rmSync(repo, { recursive: true, force: true }) };
}

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

describe('lb/no-raw-style-number (rule 5: tokens only)', () => {
  const tester = new RuleTester({
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
  const fresh = join(REPO_ROOT, 'apps/mobile/components/new/Fresh.tsx');
  // A file with free numbers on main keeps their count there (option `allowed`, base.mjs).
  const listed = 'apps/mobile/components/old/Listed.tsx';
  const allowed = 3;
  const onMain = [{ allowed: { [listed]: allowed } }];
  const numbers = (/** @type {number} */ n) =>
    `const s = {\n${Array.from({ length: n }, (_, i) => `  m${i}: { padding: ${i + 1} },`).join('\n')}\n};`;

  tester.run('no-raw-style-number', plugin.rules['no-raw-style-number'], {
    valid: [
      { filename: fresh, code: 'const s = { padding: SPACE.md, fontSize: TYPE.body.fontSize };' },
      { filename: fresh, code: 'const s = { margin: 0, gap: SPACE.sm, width: 12, flex: 1 };' },
      {
        filename: fresh,
        code: 'const s = { paddingTop: 3 }; // token-exempt: optical centre of the 17 pt glyph',
      },
      {
        filename: fresh,
        code: 'const s = {\n  // token-exempt: hairline under the tab bar\n  borderRadius: 1,\n};',
      },
      { filename: fresh, code: '<Svg width={24} height={24} />' },
      // A file may keep what it has on main …
      { filename: join(REPO_ROOT, listed), code: numbers(allowed), options: onMain },
      // … and have fewer: once on main, that is its new count — no list to follow (#452).
      { filename: join(REPO_ROOT, listed), code: numbers(allowed - 1), options: onMain },
    ],
    invalid: [
      {
        filename: fresh,
        code: 'const s = { padding: 8 };',
        errors: [{ messageId: 'raw', data: { prop: 'padding', value: '8', count: '' } }],
      },
      { filename: fresh, code: 'const s = { marginTop: -4 };', errors: [{ messageId: 'raw' }] },
      {
        filename: fresh,
        code: 'const s = { gap: wide ? 8 : 12 };',
        errors: [{ messageId: 'raw' }, { messageId: 'raw' }],
      },
      {
        filename: fresh,
        code: 'const s = { lineHeight: SPACE.md + 2 };',
        errors: [{ messageId: 'raw' }],
      },
      { filename: fresh, code: "const s = { 'fontSize': 14 };", errors: [{ messageId: 'raw' }] },
      {
        filename: fresh,
        code: 'const s = { borderTopLeftRadius: 6 };',
        errors: [{ messageId: 'raw' }],
      },
      {
        filename: fresh,
        code: 'const s = { rowGap: Math.max(8, inset) };',
        errors: [{ messageId: 'raw' }],
      },
      { filename: fresh, code: '<Text fontSize={12}>x</Text>', errors: [{ messageId: 'raw' }] },
      // An exemption needs a reason.
      {
        filename: fresh,
        code: 'const s = { padding: 8 }; // token-exempt:',
        errors: [{ messageId: 'raw' }],
      },
      // One more than main has: all of the file's numbers are shown.
      {
        filename: join(REPO_ROOT, listed),
        code: numbers(allowed + 1),
        options: onMain,
        errors: Array.from({ length: allowed + 1 }, () => ({ messageId: 'raw' })),
      },
    ],
  });
});

describe('Ausnahmelisten are measured on main, not kept in files (issue #452)', () => {
  const BIG = 'apps/api/src/big.ts';
  const HUGE = 'apps/api/src/huge.ts';
  const CARD = 'apps/mobile/components/x/Card.tsx';
  // Umlauts first: main's files are read as bytes, one file after the other — a size counted in
  // characters would shift every file after this one.
  const lines = (/** @type {number} */ n) =>
    '// Größe, Übung, Schlüssel\n' +
    Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') +
    '\n';
  const card = (/** @type {number} */ n) =>
    `export const s = {\n${Array.from({ length: n }, (_, i) => `  m${i}: { padding: ${i + 1} },`).join('\n')}\n};\n`;

  it('two branches that shrink entries of the same list merge without a conflict, and main measures both', () => {
    const { repo, git, write, done } = playground();
    try {
      write(BIG, lines(820));
      write(HUGE, lines(900));
      write(CARD, card(4));
      git('add', '-A');
      git('commit', '-qm', 'main: two files over the limit, a card with free numbers');
      assert.deepEqual(measureFiles(baseSha(repo, 'main'), repo), {
        maxLines: { [BIG]: 820, [HUGE]: 900 },
        styleNumbers: { [CARD]: 4 },
        pressable: [],
      });

      // Two parallel branches shrink two entries of the same list. Before #452 both wrote
      // max-lines.json, and GitHub, which runs no merge driver, saw a conflict and ran no CI.
      git('checkout', '-qb', 'a');
      write(BIG, lines(810));
      git('commit', '-qam', 'a: shrinks big.ts');
      git('checkout', '-q', 'main');
      git('checkout', '-qb', 'b');
      write(HUGE, lines(850));
      write(CARD, card(2));
      git('commit', '-qam', 'b: shrinks huge.ts and the card');
      // Each touched only its code: no list file in either diff, nothing to meet in.
      assert.equal(git('diff', '--name-only', 'main', 'a'), `${BIG}\n`);
      assert.equal(git('diff', '--name-only', 'main', 'b'), `${HUGE}\n${CARD}\n`);

      git('checkout', '-q', 'main');
      git('merge', '-q', '--no-edit', 'a');
      git('merge', '-q', '--no-edit', 'b');
      // On main the shrinks ARE the measure — nobody wrote them down.
      const after = measureFiles(baseSha(repo, 'main'), repo);
      assert.deepEqual(after.maxLines, { [BIG]: 810, [HUGE]: 850 });
      assert.deepEqual(after.styleNumbers, { [CARD]: 2 });

      // A branch from there stands on the new main: growing back is more than main has.
      git('checkout', '-qb', 'c');
      write(CARD, card(3));
      git('commit', '-qam', 'c: one free number more');
      assert.equal(baseSha(repo, 'main'), git('rev-parse', 'main').trim());
      assert.equal(measureFiles('HEAD', repo).styleNumbers[CARD], 3);
    } finally {
      done();
    }
  });

  it('while main is merged in, main is the base — its own growth is not this branch’s', () => {
    const { repo, git, write, done } = playground();
    try {
      write(BIG, lines(810));
      git('add', '-A');
      git('commit', '-qm', 'main');
      git('checkout', '-qb', 'feature');
      write(CARD, card(1));
      git('add', '-A');
      git('commit', '-qm', 'feature');
      git('checkout', '-q', 'main');
      write(BIG, lines(815));
      git('commit', '-qam', 'main grows, with its own reason');
      git('checkout', '-q', 'feature');
      git('merge', '-q', '--no-commit', 'main');
      assert.equal(baseSha(repo, 'main'), git('rev-parse', 'main').trim());
      git('merge', '--abort');
      assert.equal(baseSha(repo, 'main'), git('merge-base', 'HEAD', 'main').trim());
    } finally {
      done();
    }
  });

  it('a grant counts on the branch that adds it, and no more once it is on main', () => {
    const { repo, git, write, done } = playground();
    const grant = `${GROWTH_DIR}/297-big.json`;
    try {
      write(BIG, lines(810));
      git('add', '-A');
      git('commit', '-qm', 'main');
      git('checkout', '-qb', 'feature');
      write(
        grant,
        JSON.stringify({ issue: '#297', reason: 'Owner-Entscheid', maxLines: { [BIG]: 830 } }),
      );
      assert.deepEqual(
        activeGrants(baseSha(repo, 'main'), repo).map((g) => g.issue),
        ['#297'],
      );
      git('add', '-A');
      git('commit', '-qm', 'feature: grant');
      git('checkout', '-q', 'main');
      git('merge', '-q', '--no-edit', 'feature');
      assert.deepEqual(activeGrants(baseSha(repo, 'main'), repo), [], 'auf main: im Maß');
      write(grant, JSON.stringify({ issue: '#297', reason: 'Owner-Entscheid', maxLine: {} }));
      assert.throws(() => activeGrants(baseSha(repo, 'main'), repo), /maxLine/);
      write(grant, JSON.stringify({ reason: 'ohne Issue' }));
      assert.throws(() => activeGrants(baseSha(repo, 'main'), repo), /issue/);
    } finally {
      done();
    }
  });

  it('a grant adds to the measure: the larger number per entry, the union of entries', () => {
    const base = {
      maxLines: { a: 900 },
      styleNumbers: { c: 2 },
      pressable: ['p'],
      clones: { 'x <-> y': 10 },
      knip: ['exports: f: g'],
    };
    assert.deepEqual(
      withGrants(base, [
        { issue: '#1', reason: 'r', maxLines: { a: 880, b: 820 }, knip: ['exports: f: h'] },
      ]),
      { ...base, maxLines: { a: 900, b: 820 }, knip: ['exports: f: g', 'exports: f: h'] },
    );
    assert.deepEqual(base.maxLines, { a: 900 }, 'the measure itself stays untouched');
  });

  it('no list is kept in a file a parallel shrink would have to edit', () => {
    // What is left in baselines/ is kept by hand and compared by no-growth.mjs.
    assert.deepEqual(readdirSync(join(REPO_ROOT, 'tools', 'guards', 'baselines')), [
      'bundle-budget.json',
    ]);
    for (const file of readdirSync(join(REPO_ROOT, 'tools', 'guards', 'baselines'))) {
      assert.ok(`tools/guards/baselines/${file}` in LISTS, `${file}: no-growth.mjs vergleicht sie`);
    }
  });
});

describe('drawing components (rule 1: library before own build)', () => {
  const registry = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tools', 'guards', 'drawing-registry.json'), 'utf8'),
  );
  /** @type {Record<string, string>} */
  const bestand = registry.bestand;
  /** @type {Record<string, { issue: string, libraryCheck: string }>} */
  const geprueft = registry.geprueft;
  const isTest = (/** @type {string} */ f) => /__tests__|\.test\.tsx?$/.test(f);

  /** Every file in components/math or a `figures` folder, and every UI file drawing with SVG. */
  const drawing = UI_DIRS.flatMap((d) => sourceFiles(d))
    .filter((f) => !isTest(f))
    .filter(
      (f) =>
        f.startsWith('apps/mobile/components/math/') ||
        f.split('/').includes('figures') ||
        /from ['"]react-native-svg['"]/.test(readFileSync(join(REPO_ROOT, f), 'utf8')),
    );

  it('finds the drawing components at all', () => {
    assert.ok(drawing.includes('apps/mobile/components/math/FigureView.tsx'));
    assert.ok(drawing.includes('apps/mobile/components/lb/Glow.tsx'));
  });

  it('every drawing component is registered with the issue that holds its library check', () => {
    const missing = drawing.filter((f) => !(f in bestand) && !(f in geprueft));
    assert.deepEqual(
      missing,
      [],
      'Neue Zeichenkomponente ohne Eintrag. Erst der Bibliotheks-Check im Issue (Lizenz, React-Native-Weg, ' +
        'Größe, Pflege, A11y — CLAUDE.md Engineering-Regel 1), dann ein Eintrag unter `geprueft` in ' +
        'tools/guards/drawing-registry.json: { "issue": "#…", "libraryCheck": "Ergebnis und Begründung" }.',
    );
  });

  it('every checked entry names an issue and the outcome of the check', () => {
    for (const [file, entry] of Object.entries(geprueft)) {
      assert.match(entry.issue, /^#\d+$/, `${file}: issue als "#123"`);
      assert.ok(
        entry.libraryCheck.trim().length >= 20,
        `${file}: libraryCheck nennt Ergebnis und Grund`,
      );
      assert.ok(!(file in bestand), `${file} steht in bestand und geprueft`);
    }
  });

  it('the registry lists only files that exist (it shrinks with the code)', () => {
    for (const file of [...Object.keys(bestand), ...Object.keys(geprueft)]) {
      assert.ok(exists(file), `${file} gibt es nicht mehr — Eintrag streichen`);
    }
  });
});

describe('no-growth: the lists are compared with the base branch', () => {
  it('reports new entries and larger sizes, nothing else', () => {
    assert.deepEqual(growth({ a: 3, b: 2 }, { a: 3, b: 1 }), []);
    assert.deepEqual(growth({ a: 3 }, { a: 4, c: 1 }), ['größer: a (3 → 4)', 'neu: c (1)']);
  });

  it('accepts growth only with a reasoned trailer naming an issue', () => {
    assert.ok(TRAILER.test('fix\n\nAusnahmeliste-Zuwachs: #306 Formeln fertig vor den Wächtern'));
    assert.ok(!TRAILER.test('Ausnahmeliste-Zuwachs: #306'));
    assert.ok(!TRAILER.test('Ausnahmeliste-Zuwachs: weil'));
  });
});

describe('forbidden code shapes: every guard fires where the guards overlap', () => {
  // As `no-restricted-syntax` lists, the last config block for a file replaced the others and a
  // guard went silent without any error (tools/guards/syntax-rules.mjs). This lints one screen
  // that all four cover through the real eslint.config.mjs and expects each of them.
  const probe = [
    'const zone = "Europe/Berlin";',
    'const sql = `update learner set context_version = context_version + 1`;',
    'const key = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY;',
    'const h = useWindowDimensions().height;',
    'export { zone, sql, key, h };',
  ].join('\n');

  it('a screen gets the zone, context, secret and window-height guards at once', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintText(probe, {
      filePath: join(REPO_ROOT, 'apps/mobile/app/__guard-probe__.tsx'),
    });
    const fired = new Set(result?.messages.map((m) => m.ruleId));
    for (const rule of [
      'lb/no-default-zone',
      'lb/no-context-bump',
      'lb/no-public-secret',
      'lb/no-window-height',
    ]) {
      assert.ok(fired.has(rule), `${rule} schweigt auf einem Screen`);
    }
  });

  it('the exemptions stay narrow: plan.ts may bump, a test may name a zone', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [plan] = await eslint.lintText(probe, {
      filePath: join(REPO_ROOT, 'apps/api/src/modules/buddy/plan.ts'),
    });
    const planRules = new Set(plan?.messages.map((m) => m.ruleId));
    assert.ok(!planRules.has('lb/no-context-bump'));
    assert.ok(planRules.has('lb/no-default-zone'));
    const [test] = await eslint.lintText(probe, {
      filePath: join(REPO_ROOT, 'apps/api/src/__tests__/guard-probe.test.ts'),
    });
    const testRules = new Set(test?.messages.map((m) => m.ruleId));
    assert.ok(!testRules.has('lb/no-default-zone'));
    assert.ok(testRules.has('lb/no-context-bump'));
  });
});

describe('lb/one-text-field: the app has one text field (issue #365)', () => {
  const probe = [
    "import { TextInput, View } from 'react-native';",
    'export const Field = () => <View><TextInput /></View>;',
  ].join('\n');
  const hits = async (/** @type {string} */ file) => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintText(probe, { filePath: join(REPO_ROOT, file) });
    return (result?.messages ?? []).filter((m) => m.ruleId === 'lb/one-text-field').length;
  };

  it('fires on the import and the element anywhere in the app', async () => {
    assert.equal(await hits('apps/mobile/components/practice/__guard-probe__.tsx'), 2);
    assert.equal(await hits('apps/mobile/app/__guard-probe__.tsx'), 2);
  });

  it('stays quiet in the one field itself', async () => {
    assert.equal(await hits('apps/mobile/components/lb/LbTextInput.tsx'), 0);
  });
});

describe('fresh base: a PR does not lag main by more than a day (issue #328)', () => {
  const now = 1_800_000_000;
  it('is fresh when it contains main, or misses only recent commits', () => {
    assert.equal(staleHours([], now), null);
    assert.ok((staleHours([now - 3600], now) ?? 0) <= MAX_AGE_HOURS);
  });
  it('is stale when the oldest missing main commit is older than the limit', () => {
    const hours = staleHours([now - 3600, now - 30 * 3600], now);
    assert.ok(hours !== null && hours > MAX_AGE_HOURS);
  });
});

describe('lb/no-early-script-report: a test reads the model report only after background work', () => {
  const probe = [
    'const a = env.llm.unexpected.length;',
    'const b = env.llm.scriptErrors;',
    'const c = env.llm.pending();',
    'export { a, b, c };',
  ].join('\n');

  it('fires on each of the three in an integration test', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintText(probe, {
      filePath: join(REPO_ROOT, 'apps/api/src/__tests__/guard-probe.int.test.ts'),
    });
    const hits = (result?.messages ?? []).filter((m) => m.ruleId === 'lb/no-early-script-report');
    assert.equal(hits.length, 3);
  });

  it('stays quiet in the harness, the one place that builds the report', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const [result] = await eslint.lintText(probe, {
      filePath: join(REPO_ROOT, 'apps/api/src/testing/harness-probe.ts'),
    });
    const hits = (result?.messages ?? []).filter((m) => m.ruleId === 'lb/no-early-script-report');
    assert.equal(hits.length, 0);
  });
});

describe('source lists: the Ausnahmelisten a source test keeps are compared with main too (#296)', () => {
  it('reads every registered list today, and none is empty while it is registered', () => {
    for (const [list, entries] of Object.entries(SOURCE_LISTS)) {
      const found = entries(readFileSync(join(REPO_ROOT, fileOf(list)), 'utf8'));
      assert.ok(
        Object.keys(found).length > 0,
        `${list} ist leer — die Schuld ist abgebaut: Liste und Eintrag in source-lists.mjs streichen`,
      );
    }
  });

  it('reads counts, keys in any spelling, and only the WEAK routes', () => {
    const src = [
      'const OTHER = { a: 1 };',
      'export const LIST: Record<string, { count: number; why: string }> = {',
      "  'A.tsx': { count: 2, why: 'x' },",
      '  B: { why: "y", count: 1 },',
      "  '[id].tsx': 'plain',",
      '};',
      'const ROUTES = {',
      "  home: 'the chat itself, a real reason',",
      "  extra: 'WEAK: the chat could carry this',",
      '  more: `WEAK: as a template`,',
      '} as const;',
    ].join('\n');
    assert.deepEqual(sourceList(src, 'LIST'), { 'A.tsx': 2, B: 1, '[id].tsx': 1 });
    assert.deepEqual(sourceList(src, 'ROUTES', isWeak), { extra: 1, more: 1 });
  });

  it('throws when a list is gone or not a literal, instead of reading it as empty', () => {
    assert.throws(() => sourceList('const OWN = {};', 'OWN_BAR'), /nicht gefunden/);
    assert.throws(() => sourceList('const OWN_BAR = make();', 'OWN_BAR'), /kein Objekt-Literal/);
    assert.throws(() => sourceList('const OWN_BAR = { ...rest };', 'OWN_BAR'), /einfache/);
  });

  it('turns a new entry or a larger count into growth', () => {
    const before = sourceList("const L = { 'A.tsx': { count: 1 } };", 'L');
    const after = sourceList("const L = { 'A.tsx': { count: 2 }, 'B.tsx': { count: 1 } };", 'L');
    assert.deepEqual(growth(before, after), ['größer: A.tsx (1 → 2)', 'neu: B.tsx (1)']);
  });
});

describe('PR text: USP point, library check, reuse (CLAUDE.md rule 16, #296)', () => {
  const filled = [
    '**Dient USP-Punkt:** 4 Ein ruhiger Screen',
    '**Wiederverwendet / entfernt:** InputBar, AnswerShell; entfernt: eigene Leiste in X',
    '- [x] **Bibliotheks-Check:** keiner',
  ].join('\n');

  it('the untouched template is red on all three lines', () => {
    const template = readFileSync(join(REPO_ROOT, '.github', 'pull_request_template.md'), 'utf8');
    assert.equal(prBodyProblems(template).length, 3);
  });

  it('a filled text is green', () => {
    assert.deepEqual(prBodyProblems(filled), []);
    assert.deepEqual(
      prBodyProblems(
        filled.replace(
          '4 Ein ruhiger Screen',
          'keiner — reine Wartung der Wächter, kein Verhalten',
        ),
      ),
      [],
    );
  });

  it('is red without a USP point, with a bare „keiner“, or with a missing line', () => {
    assert.equal(prBodyProblems(filled.replace('4 Ein ruhiger Screen', 'wichtig')).length, 1);
    assert.equal(prBodyProblems(filled.replace('4 Ein ruhiger Screen', 'keiner')).length, 1);
    assert.equal(prBodyProblems(filled.replace('4 Ein ruhiger Screen', '7')).length, 1);
    assert.equal(prBodyProblems(filled.replace(/^.*Wiederverwendet.*$/m, '')).length, 1);
    assert.equal(prBodyProblems(null).length, 3);
  });
});
