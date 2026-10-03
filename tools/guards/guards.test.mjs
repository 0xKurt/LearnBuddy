// The guards' own tests, and the ratchet that keeps every Ausnahmeliste honest (issue #313,
// docs/engineering-guards.md). Run by `pnpm guards` (part of `pnpm lint` and the pre-commit
// hook) with node's own test runner.
//
// "Only shrinks" has two halves: the code may not get worse than the list (the lint rules,
// clones.mjs, knip.mjs), and the list may not stay worse than the code — an entry that was
// fixed has to go, or the debt could come back unnoticed. The second half is here.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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

import plugin from './eslint-plugin.mjs';
import { MAX_AGE_HOURS, staleHours } from './fresh-base.mjs';
import { mergeBaselines } from './merge-baseline.mjs';
import { growth, TRAILER } from './no-growth.mjs';
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
    const repo = mkdtempSync(join(tmpdir(), 'lb-merge-'));
    const driver = join(REPO_ROOT, 'tools', 'guards', 'merge-baseline.mjs');
    // Inside the pre-commit hook git exports GIT_DIR, GIT_INDEX_FILE … — inherited, they point
    // this throwaway repo's commands at the REAL repository (it happened: commits and config
    // written into the project's .git). So: none of the hook's GIT_* variables, no global or
    // system config, and every setting passed with -c, never written anywhere.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
    );
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
    const git = (/** @type {string[]} */ ...args) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.email=t@example.test',
          '-c',
          'user.name=t',
          '-c',
          `merge.lb-baseline.driver=node ${driver} %O %A %B`,
          ...args,
        ],
        { cwd: repo, env, encoding: 'utf8', stdio: 'pipe' },
      );
    const list = 'tools/guards/baselines/max-lines.json';
    const write = (/** @type {Record<string, number>} */ files) => {
      mkdirSync(join(repo, 'tools', 'guards', 'baselines'), { recursive: true });
      writeFileSync(join(repo, list), `${JSON.stringify({ files }, null, 2)}\n`);
    };
    try {
      git('init', '-q', '-b', 'main');
      // The guard against the leak itself: this must be the throwaway repository.
      assert.equal(git('rev-parse', '--show-toplevel').trim(), realpathSync(repo));
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
      rmSync(repo, { recursive: true, force: true });
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
