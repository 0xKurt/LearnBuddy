// The guards' own tests, and the ratchet that keeps every Ausnahmeliste honest (issue #313,
// docs/engineering-guards.md). Run by `pnpm guards` (part of `pnpm lint` and the pre-commit
// hook) with node's own test runner.
//
// "Only shrinks" has two halves: the code may not get worse than the list (the lint rules,
// clones.mjs, knip.mjs), and the list may not stay worse than the code — an entry that was
// fixed has to go, or the debt could come back unnoticed. The second half is here.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ESLint, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

import plugin from './eslint-plugin.mjs';
import { MAX_AGE_HOURS, staleHours } from './fresh-base.mjs';
import { mergeBaselines } from './merge-baseline.mjs';
import { growth, TRAILER } from './no-growth.mjs';
import { prBodyProblems } from './pr-body.mjs';
import { scratchRepo } from './scratch-repo.mjs';
import { fileOf, isWeak, SOURCE_LISTS, sourceList } from './source-lists.mjs';
import {
  MAX_LINES,
  REPO_ROOT,
  UI_DIRS,
  countedLines,
  importsRawPressable,
  readBaseline,
  sourceFiles,
} from './measure.mjs';

const exists = (/** @type {string} */ f) => existsSync(join(REPO_ROOT, f));
const sum = (/** @type {Record<string, number>} */ o) =>
  Object.values(o).reduce((a, b) => a + b, 0);

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
  const style = /** @type {{ files: Record<string, number> }} */ (
    readBaseline('style-numbers.json')
  );
  const [listed, allowed] = Object.entries(style.files).sort((a, b) => a[1] - b[1])[0] ?? ['', 0];
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
      // A file on the Ausnahmeliste may keep exactly its count.
      { filename: join(REPO_ROOT, listed), code: numbers(allowed) },
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
      // One more than the list allows: all of the file's numbers are shown.
      {
        filename: join(REPO_ROOT, listed),
        code: numbers(allowed + 1),
        errors: Array.from({ length: allowed + 1 }, () => ({ messageId: 'raw' })),
      },
      // Fewer than the list allows: the list has to come down with the code.
      {
        filename: join(REPO_ROOT, listed),
        code: numbers(allowed - 1),
        errors: [{ messageId: 'stale' }],
      },
    ],
  });
});

describe('Ausnahmelisten only shrink: no entry may stay worse than the code', () => {
  it('style numbers: every listed file exists, sits in app/ or components/, and the total adds up', () => {
    const style = /** @type {{ total: number, files: Record<string, number> }} */ (
      readBaseline('style-numbers.json')
    );
    for (const [file, count] of Object.entries(style.files)) {
      assert.ok(
        exists(file),
        `${file} gibt es nicht mehr — Eintrag streichen (pnpm guards:shrink)`,
      );
      assert.ok(
        UI_DIRS.some((d) => file.startsWith(`${d}/`)),
        `${file} liegt nicht unter ${UI_DIRS.join(', ')}`,
      );
      assert.ok(Number.isInteger(count) && count > 0, `${file}: ${count}`);
    }
    assert.equal(style.total, sum(style.files), 'total ist die Summe der Einträge');
  });

  it('max-lines: every listed file is still over the limit, and exactly at its listed size', () => {
    const lines = /** @type {{ files: Record<string, number> }} */ (readBaseline('max-lines.json'));
    for (const [file, limit] of Object.entries(lines.files)) {
      assert.ok(
        exists(file),
        `${file} gibt es nicht mehr — Eintrag streichen (pnpm guards:shrink)`,
      );
      const dir = Object.entries(MAX_LINES).find(([d]) => file.startsWith(`${d}/`));
      assert.ok(dir !== undefined, `${file}: keine Zeilengrenze für diesen Ort`);
      assert.ok(limit > dir[1], `${file}: ${limit} liegt nicht über ${dir[1]} — Eintrag streichen`);
      const now = countedLines(file);
      assert.ok(
        now >= limit,
        `${file} hat jetzt ${now} Zeilen, die Liste erlaubt ${limit} — die Grenze sinkt mit (pnpm guards:shrink)`,
      );
    }
  });

  it('Pressable: every listed file still imports a raw pressable, none is in components/lb', () => {
    const pressable = /** @type {{ files: string[] }} */ (readBaseline('pressable.json'));
    assert.deepEqual(
      pressable.files,
      [...new Set(pressable.files)].sort(),
      'sortiert, ohne Doppel',
    );
    for (const file of pressable.files) {
      assert.ok(
        !file.startsWith('apps/mobile/components/lb/'),
        `${file}: components/lb darf das ohnehin`,
      );
      assert.ok(
        exists(file) && importsRawPressable(file),
        `${file} importiert kein rohes Pressable mehr — Eintrag streichen (pnpm guards:shrink)`,
      );
    }
  });

  it('clones and knip: the headline numbers match the entries', () => {
    const clones = /** @type {{ lines: number, pairs: Record<string, number> }} */ (
      readBaseline('clones.json')
    );
    assert.equal(clones.lines, sum(clones.pairs));
    const knip = /** @type {{ total: number, findings: string[] }} */ (readBaseline('knip.json'));
    assert.equal(knip.total, knip.findings.length);
    assert.deepEqual(knip.findings, [...new Set(knip.findings)].sort(), 'sortiert, ohne Doppel');
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

describe('merge driver: an Ausnahmeliste conflict resolves itself (issue #328)', () => {
  it('takes the larger number per entry and the union of lists', () => {
    const ours = { $comment: 'c', total: 5, files: { a: 3, b: 9 }, findings: ['x', 'y'] };
    const theirs = { $comment: 'c', total: 7, files: { a: 4, c: 1 }, findings: ['y', 'z'] };
    assert.deepEqual(mergeBaselines(ours, theirs), {
      $comment: 'c',
      total: 7,
      files: { a: 4, b: 9, c: 1 },
      findings: ['x', 'y', 'z'],
    });
  });

  it('resolves a real git conflict in max-lines.json without a hand', () => {
    const driver = join(REPO_ROOT, 'tools', 'guards', 'merge-baseline.mjs');
    const {
      dir: repo,
      git,
      remove,
    } = scratchRepo('lb-merge-', [`merge.lb-baseline.driver=node ${driver} %O %A %B`]);
    const list = 'tools/guards/baselines/max-lines.json';
    const write = (/** @type {Record<string, number>} */ files) => {
      mkdirSync(join(repo, 'tools', 'guards', 'baselines'), { recursive: true });
      writeFileSync(join(repo, list), `${JSON.stringify({ files }, null, 2)}\n`);
    };
    try {
      writeFileSync(join(repo, '.gitattributes'), readFileSync(join(REPO_ROOT, '.gitattributes')));
      write({ 'a.ts': 900, 'b.ts': 850 });
      git('add', '-A');
      git('commit', '-qm', 'base');
      git('checkout', '-qb', 'feature');
      write({ 'a.ts': 880, 'b.ts': 850 });
      git('commit', '-qam', 'feature shrinks a');
      git('checkout', '-q', 'main');
      write({ 'a.ts': 900, 'b.ts': 820 });
      git('commit', '-qam', 'main shrinks b');
      git('merge', '-q', '--no-edit', 'feature');
      const merged = JSON.parse(readFileSync(join(repo, list), 'utf8'));
      // The larger side per entry: safe for lint; `pnpm guards:shrink` then tightens it.
      assert.deepEqual(merged.files, { 'a.ts': 900, 'b.ts': 850 });
    } finally {
      remove();
    }
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
