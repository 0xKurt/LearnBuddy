// The core copy by construction (issue #107, cut 10): what it writes in the domain's place, what
// of the support code it leaves out with the domain, and how `pnpm core-check` counts and
// compares what is left. The whole run against this repository is `pnpm core-check` (CI).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareGaps, countErrors } from '../cli/core-check.js';
import { coreMigrationList, isMigration } from '../baseline.js';
import {
  CONTRACTS_BARREL,
  coreBarrel,
  corePackageJson,
  DOMAIN_MARK,
  namesDomain,
  supportReachingGaps,
} from '../core.js';
import { tmp } from './helpers.js';

describe('the core copy (#107, cut 10)', () => {
  it('keeps the barrel’s exports of copied contracts, drops the domain’s and adds the core’s assembly', () => {
    const dir = CONTRACTS_BARREL.slice(0, CONTRACTS_BARREL.lastIndexOf('/'));
    const barrel = [
      '// API contracts.',
      "export * from './common.js';",
      "export * from './buddy.js';",
      "export * from './buddyLearning.js';",
      "export * from './learning.js';",
      '',
    ].join('\n');
    const copied = new Set([`${dir}/common.ts`, `${dir}/buddy.ts`]);
    expect(coreBarrel(barrel, copied)).toBe(
      [
        '// API contracts.',
        "export * from './common.js';",
        "export * from './buddy.js';",
        "export * from './buddyCore.js';",
        '',
      ].join('\n'),
    );
  });

  it('drops a dependency on a workspace package that stayed out, and leaves the rest as written', () => {
    const pkg = JSON.stringify(
      {
        name: '@learnbuddy/api',
        dependencies: {
          '@learnbuddy/shared-math': 'workspace:*',
          '@learnbuddy/shared-types': 'workspace:*',
          zod: '^3.24.1',
        },
      },
      null,
      2,
    );
    const present = new Set(['packages/shared-types/package.json']);
    expect(JSON.parse(corePackageJson(pkg, present))).toEqual({
      name: '@learnbuddy/api',
      dependencies: { '@learnbuddy/shared-types': 'workspace:*', zod: '^3.24.1' },
    });
    const untouched = '{ "name": "x",\n  "dependencies": { "zod": "^3" } }';
    expect(corePackageJson(untouched, present)).toBe(untouched);
  });

  it('leaves out every test, harness file and eval that reaches the domain, also through another', () => {
    const root = tmp('core-support');
    const files: Record<string, string> = {
      'apps/api/src/modules/buddy/turn.ts': 'export const turn = 1;\n',
      'apps/api/src/modules/buddy/__tests__/turn.test.ts': "import { turn } from '../turn.js';\n",
      // Reaches the domain (not copied) directly …
      'apps/api/src/testing/scenarios/practice.ts':
        "import { drill } from '../../modules/practice/drill.js';\n",
      // … and through the scenario that goes with it.
      'apps/api/src/__tests__/practice.int.test.ts':
        "import { practice } from '../testing/scenarios/practice.js';\n",
      'apps/api/evals/math.ts': "import { solve } from '@learnbuddy/shared-math';\n",
      'apps/api/src/__tests__/turn.int.test.ts':
        "import { turn } from '../modules/buddy/turn.js';\n",
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    expect(supportReachingGaps(root, Object.keys(files))).toEqual([
      'apps/api/evals/math.ts',
      'apps/api/src/__tests__/practice.int.test.ts',
      'apps/api/src/testing/scenarios/practice.ts',
    ]);
  });

  it('counts production errors per file and code, and the support code’s apart', () => {
    const out = [
      "src/modules/buddy/home.ts(16,10): error TS2305: Module has no exported member 'pollAfterMs'.",
      "src/modules/buddy/home.ts(102,19): error TS2339: Property 'now' does not exist.",
      "src/modules/buddy/home.ts(103,23): error TS2339: Property 'working' does not exist.",
      "src/modules/buddy/__tests__/blocks.test.ts(1,1): error TS2353: 'items' does not exist.",
      'Found 4 errors.',
    ].join('\n');
    expect(countErrors(out, 'apps/api')).toEqual({
      gaps: {
        'apps/api/src/modules/buddy/home.ts: TS2305': 1,
        'apps/api/src/modules/buddy/home.ts: TS2339': 2,
      },
      support: 1,
    });
  });

  it('is red on a new gap and on a closed one the list still names, green on the list itself', () => {
    const listed = { 'a.ts: TS2305': 2, 'b.ts: TS2339': 1 };
    expect(compareGaps(listed, listed)).toEqual({ grown: [], gone: [] });
    expect(compareGaps({ ...listed, 'c.ts: TS2305': 1 }, listed).grown).toEqual([
      'c.ts: TS2305 (0 → 1)',
    ]);
    expect(compareGaps({ 'a.ts: TS2305': 2 }, listed).gone).toEqual(['b.ts: TS2339 (1 → 0)']);
  });

  it('tells a spec of the domain by what it names, where no import tells it', () => {
    const signals = { tables: ['materials'], tools: ['prepare_practice'], routes: ['/practice'] };
    expect(namesDomain('await l.api.post(`/practice/sessions/${id}/finish`, {})', signals)).toBe(
      true,
    );
    expect(namesDomain("env.llm.script('buddy_turn', { tool: 'prepare_practice' })", signals)).toBe(
      true,
    );
    expect(namesDomain('select id from materials where learner_id = $1', signals)).toBe(true);
    expect(namesDomain(`// ${DOMAIN_MARK}: its foreign keys`, signals)).toBe(true);
    // The core's own: another route, a word in a sentence, a table of the core.
    expect(namesDomain("await l.api.post('/buddy/messages', body)", signals)).toBe(false);
    expect(namesDomain('// her materials stay out of the core', signals)).toBe(false);
    expect(namesDomain('select * from buddy_goals', signals)).toBe(false);
  });

  it('gives a core copy its one baseline in place of the migrations', () => {
    expect(isMigration('infra/supabase/migrations/0042_scan.sql')).toBe(true);
    expect(isMigration('infra/supabase/migrations/README.md')).toBe(false);
    const list =
      "export const EXPECTED_MIGRATIONS: readonly string[] = [\n  '0001_baseline',\n  '0002_scheduler',\n];\n";
    expect(coreMigrationList(list)).toBe(
      "export const EXPECTED_MIGRATIONS: readonly string[] = ['0001_baseline'];\n",
    );
  });
});
