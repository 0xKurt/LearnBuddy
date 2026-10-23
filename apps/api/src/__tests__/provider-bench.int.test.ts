// requires live verification in Claude Code session (real Postgres; external services scripted).
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerLearning } from '../modules/learning/register.js';
import { OPENAI_PROFILE } from '../llm/openai.js';
import { schemaProperties } from '../llm/schemaBudget.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { seed, worksheetJpeg } from '../testing/bench/workloads.js';

registerLearning();
const hasDb = await testDatabaseAvailable();
describe.skipIf(!hasDb)('provider benchmark workloads', () => {
  it('rejects an unknown candidate before starting the comparison', () => {
    const root = resolve('test-results');
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(resolve(root, 'provider-cli-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/bench-azure-vs-gemini.ts',
          '--provider',
          'openai',
          '--dry',
          '--models',
          'unknown-model',
          '--out',
          resolve(dir, 'report.md'),
        ],
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unknown or empty --models');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 35_000);

  it('records actual app-built conversations, photos, exercises and tutoring', async () => {
    const workloads = await seed(OPENAI_PROFILE, await worksheetJpeg(), []);
    expect(workloads.map((w) => w.id)).toEqual(
      expect.arrayContaining([
        'buddy_turn:question',
        'buddy_turn:practise',
        'buddy_turn:maths',
        'explain',
        'extraction',
        'tutor',
      ]),
    );
    const turn = workloads.find((w) => w.id === 'buddy_turn:question')!;
    expect(schemaProperties(turn.req.schema)).toBeGreaterThan(100);
    for (const purpose of ['explain', 'extraction']) {
      const request = workloads.find((w) => w.purpose === purpose)!.req;
      expect(request.validateOutput).toBeTypeOf('function');
      expect(request.validateOutput?.({})).toBe(false);
    }
    expect(
      workloads
        .find((w) => w.purpose === 'extraction')!
        .req.contents.flatMap((m) => m.parts)
        .some((p) => 'inlineData' in p && p.inlineData.mimeType === 'image/jpeg'),
    ).toBe(true);
  }, 30_000);
});
