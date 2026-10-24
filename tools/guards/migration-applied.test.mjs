// requires live verification in Claude Code session (HTTP evidence is scripted)
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { candidateMigrations, verifyApplied, PRODUCTION_HEALTH_URL } from './migration-applied.mjs';
import { scratchRepo } from './scratch-repo.mjs';

const names = ['0998_first', '0999_second'];
const answer = (body, status = 200, url = PRODUCTION_HEALTH_URL) => ({
  ok: status === 200,
  status,
  url,
  json: async () => body,
});

test('requires exact evidence for every migration from the fixed production endpoint', async () => {
  let called = false;
  await verifyApplied(names, async (url, options) => {
    called = true;
    assert.equal(url.origin + url.pathname, PRODUCTION_HEALTH_URL);
    assert.equal(url.searchParams.get('expect'), names.join(','));
    assert.equal(options.redirect, 'error');
    return answer({ expected: names, applied: names });
  });
  assert.equal(called, true);
});

test('unknown, unreadable, wrong-project, partial and malformed evidence fail closed', async () => {
  for (const response of [
    answer({ ok: true }),
    answer({ expected: names, applied: null }),
    answer({ expected: names, applied: names.slice(0, 1) }),
    answer({ expected: names.slice(0, 1), applied: names }),
    answer({ expected: names, applied: names }, 503),
    answer({ expected: names, applied: names }, 200, 'https://other.example/v1/health'),
    answer({ expected: names, applied: [...names, '0999_other'] }),
    {
      ok: true,
      status: 200,
      url: PRODUCTION_HEALTH_URL,
      json: async () => {
        throw new Error('invalid JSON');
      },
    },
  ])
    await assert.rejects(verifyApplied(names, async () => response));
  await assert.rejects(
    verifyApplied(names, async () => {
      throw new Error('unreachable');
    }),
  );
});

test('batches all candidates within endpoint limits', async () => {
  const many = Array.from({ length: 42 }, (_, i) => `${9000 + i}_migration`);
  const seen = [];
  await verifyApplied(many, async (url) => {
    const expected = url.searchParams.get('expect').split(',');
    assert.ok(expected.length <= 20);
    seen.push(...expected);
    return answer({ expected, applied: expected });
  });
  assert.deepEqual(seen, many);
});

test('diff is pinned to candidate commits, detects collisions and changed history', () => {
  const repo = scratchRepo('lb-migration-gate-');
  const add = (name) =>
    writeFileSync(join(repo.dir, 'infra/supabase/migrations', `${name}.sql`), 'select 1;');
  try {
    mkdirSync(join(repo.dir, 'infra/supabase/migrations'), { recursive: true });
    add('0001_baseline');
    repo.git('add', '.');
    repo.git('commit', '-qm', 'base');
    const base = repo.git('rev-parse', 'HEAD').trim();
    for (const name of names) add(name);
    repo.git('add', '.');
    repo.git('commit', '-qm', 'candidate');
    const head = repo.git('rev-parse', 'HEAD').trim();
    assert.deepEqual(candidateMigrations(base, head, repo.dir, repo.env), names);
    add('0999_collision');
    repo.git('add', '.');
    repo.git('commit', '-qm', 'collision');
    assert.throws(() => candidateMigrations(base, 'HEAD', repo.dir, repo.env), /collision/i);
    assert.deepEqual(candidateMigrations(base, head, repo.dir, repo.env), names);
    repo.git('reset', '--hard', head);
    writeFileSync(join(repo.dir, 'infra/supabase/migrations/0001_baseline.sql'), 'select 2;');
    repo.git('add', '.');
    repo.git('commit', '-qm', 'changed history');
    assert.throws(() => candidateMigrations(base, 'HEAD', repo.dir, repo.env), /immutable/i);
  } finally {
    repo.remove();
  }
});

// Exercise the merge helper without contacting GitHub or performing a merge.
test('merge helper rechecks the head and requires the same guard before merging', () => {
  const repo = scratchRepo('lb-merge-candidate-');
  const head = 'a'.repeat(40);
  const base = 'b'.repeat(40);
  try {
    const bin = join(repo.dir, 'bin');
    mkdirSync(bin);
    const log = join(repo.dir, 'calls');
    const counter = join(repo.dir, 'views');
    const stub = (name, code) =>
      writeFileSync(join(bin, name), `#!/bin/sh\n${code}\n`, { mode: 0o755 });
    stub(
      'git',
      `case "$*" in
      'rev-parse --show-toplevel') echo "$TEST_ROOT" ;;
      'rev-parse FETCH_HEAD') echo "${head}" ;;
      'rev-parse origin/main') echo "${base}" ;;
    esac`,
    );
    stub(
      'gh',
      `echo "gh $*" >> "$TEST_LOG"
      if [ "$2" = view ]; then
        if [ -f "$TEST_COUNTER" ] && [ "$TEST_MOVED" = 1 ]; then echo 'OPEN main ${base}';
        else echo 'OPEN main ${head}'; fi
        touch "$TEST_COUNTER"
      fi`,
    );
    stub('node', 'echo "node $*" >> "$TEST_LOG"; exit "${TEST_GATE_EXIT:-0}"');
    const run = (extra) => {
      writeFileSync(log, '');
      repo.git('clean', '-fd', '--', 'views');
      return spawnSync(
        'bash',
        [fileURLToPath(new URL('../../scripts/merge-pr.sh', import.meta.url)), '915', head],
        {
          env: {
            ...repo.env,
            PATH: `${bin}:${process.env.PATH}`,
            TEST_ROOT: repo.dir,
            TEST_LOG: log,
            TEST_COUNTER: counter,
            ...extra,
          },
          encoding: 'utf8',
        },
      );
    };
    for (const extra of [{ TEST_MOVED: '1' }, { TEST_GATE_EXIT: '1' }]) {
      assert.notEqual(run(extra).status, 0);
      assert.doesNotMatch(readFileSync(log, 'utf8'), /gh pr merge/);
    }
    assert.equal(run({}).status, 0);
    const calls = readFileSync(log, 'utf8');
    assert.ok(calls.includes(`node tools/guards/migration-applied.mjs ${base} ${head}`));
    assert.ok(calls.includes(`--match-head-commit ${head}`));
  } finally {
    repo.remove();
  }
});
