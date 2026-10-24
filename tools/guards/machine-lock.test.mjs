// The machine lock and the shared database URL (issue #791, docs/engineering-guards.md
// §Maschinenlast). Run by `pnpm guards`. Each case uses its own throwaway lock directory, so the
// order does not matter; the scripts are run by `sh`, as the hooks run them.
//
//   1. Taking over a stale lock is atomic: a waiter that saw a dead holder never removes the lock
//      a live process took in the meantime.
//   2. A lock without a `pid` file (a run killed between `mkdir` and writing it) is stale once it
//      is older than LB_TEST_LOCK_STALE_MINUTES — and is waited for while it is younger.
//   3. scripts/pg-url.sh reads host and port from every URL form the tests are given.
//   4. The machine's agent settings ($LB_AGENT_ENV): only LB_TEST_DATABASE_URL (when unset) and
//      PATH_PREFIX are taken from it, and a value is never run.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { clearTimeout, setTimeout } from 'node:timers';

import { REPO_ROOT } from './measure.mjs';

const LOCK_SCRIPT = join(REPO_ROOT, 'scripts', 'test-lock.sh');
const URL_SCRIPT = join(REPO_ROOT, 'scripts', 'pg-url.sh');

/** A fresh place for one case's lock. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'lb-lock-'));
  return { dir, lock: join(dir, 'test.lock') };
}

/** The env of a hook outside CI, with this case's lock and a fast poll. */
function lockEnv(lock, extra = {}) {
  const env = { ...process.env };
  delete env.CI;
  delete env.LB_TEST_LOCK_HELD;
  // These stale-lock fixtures exercise one slot, independently of the machine's slot count.
  return { ...env, LB_TEST_LOCK: lock, LB_TEST_LOCK_POLL: '1', LB_TEST_SLOTS: '1', ...extra };
}

/** A pid that is certainly not running: a process that has already exited. */
function deadPid() {
  const r = spawnSync('sh', ['-c', 'echo $$']);
  return r.stdout.toString().trim();
}

/** Runs `script` in a shell that sourced the lock script; resolves with its exit and output. */
function withLock(lock, script, extra = {}, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', `. "${LOCK_SCRIPT}"; ${script}`], {
      env: lockEnv(lock, extra),
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out });
    });
  });
}

describe('the machine lock takes over only what is really stale (#791)', () => {
  it('takes over a lock whose recorded process is gone', async () => {
    const { dir, lock } = scratch();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), 'gone');
      writeFileSync(join(lock, 'pid'), deadPid());
      const r = await withLock(lock, 'cat "$LB_TEST_LOCK_DIR/pid"; echo " $$"');
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /stale, taking it over/);
      assert.ok(!existsSync(lock), 'released on exit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never removes the lock a live process took after the waiter saw a dead holder', async () => {
    const { dir, lock } = scratch();
    const live = spawn('sleep', ['30']);
    try {
      // The waiter saw holder `dead`; meanwhile another waiter took over and is now the holder.
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), 'the one who took over');
      writeFileSync(join(lock, 'pid'), String(live.pid));
      const r = spawnSync(
        'sh',
        [
          '-c',
          `. "${LOCK_SCRIPT}" >/dev/null 2>&1 || true; lb_test_lock_take_stale "${lock}" "${deadPid()}"; echo "taken=$?"`,
        ],
        { env: lockEnv(lock, { LB_TEST_LOCK_HELD: '1' }), timeout: 5_000 },
      );
      assert.match(r.stdout.toString(), /^taken=1$/m, r.stderr.toString());
      assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), String(live.pid));
    } finally {
      live.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('two waiters at a stale lock: one takes it, the other waits until it is released', async () => {
    const { dir, lock } = scratch();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'pid'), deadPid());
      const log = join(dir, 'log');
      const hold = `echo "in $$" >> "${log}"; sleep 2; echo "out $$" >> "${log}"`;
      const [a, b] = await Promise.all([
        withLock(lock, hold, {}, 15_000),
        withLock(lock, hold, {}, 15_000),
      ]);
      assert.equal(a.code, 0, a.out);
      assert.equal(b.code, 0, b.out);
      const lines = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((l) => l.split(' ')[0]);
      // Never two inside at once.
      assert.deepEqual(lines, ['in', 'out', 'in', 'out']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes over a lock without a pid once it is older than the stale age', async () => {
    const { dir, lock } = scratch();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), 'killed before writing its pid');
      const old = new Date(Date.now() - 10 * 60_000);
      utimesSync(lock, old, old);
      const r = await withLock(lock, 'true', { LB_TEST_LOCK_STALE_MINUTES: '5' });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /stale, taking it over/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('waits for a lock without a pid while it is younger than the stale age', async () => {
    const { dir, lock } = scratch();
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), 'taken by hand a minute ago');
      const r = await withLock(lock, 'true', { LB_TEST_LOCK_STALE_MINUTES: '5' }, 2_500);
      assert.equal(r.signal, 'SIGTERM', `should still be waiting: ${r.out}`);
      assert.ok(existsSync(join(lock, 'owner')), 'the young lock is left alone');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the shared database URL is read in every form (#791)', () => {
  const cases = [
    ['postgres://postgres@127.0.0.1:54316/postgres', '127.0.0.1 54316'],
    ['postgres://postgres:secret@db.local:5433/lb', 'db.local 5433'],
    ['postgresql://localhost/postgres', 'localhost 5432'],
    ['postgres://localhost:5434', 'localhost 5434'],
    ['postgres://u:p%40ss@h:6000/db?sslmode=disable', 'h 6000'],
    ['postgres://u:p@ss@h/db', 'h 5432'],
    ['postgres://postgres@[::1]:5435/postgres', '::1 5435'],
    ['postgres://postgres@[::1]/postgres', '::1 5432'],
  ];
  for (const [url, want] of cases) {
    it(url, () => {
      const r = spawnSync('sh', ['-c', `. "${URL_SCRIPT}"; lb_pg_host_port "$1"`, 'sh', url]);
      assert.equal(r.stdout.toString().trim(), want, r.stderr.toString());
    });
  }
});

describe("the machine's agent settings reach every hook (§Maschinenlast)", () => {
  /** A settings file with `lines`, a directory to put first on PATH, and this case's lock. */
  function settings(lines) {
    const { dir, lock } = scratch();
    const bin = join(dir, 'node22', 'bin');
    mkdirSync(bin, { recursive: true });
    const file = join(dir, 'env');
    writeFileSync(file, lines(bin, dir).join('\n'));
    return { dir, lock, bin, file };
  }
  const show = 'echo "url=$LB_TEST_DATABASE_URL"; echo "path=$PATH"';

  it('sets the test database and puts the Node directory first; no other key is taken', async () => {
    const { dir, lock, bin, file } = settings((bin, dir) => [
      '# shared Postgres',
      'LB_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54316/postgres',
      `PATH_PREFIX=${bin}`,
      `NODE_OPTIONS=--require=${join(dir, 'evil.js')}`,
      'LB_TEST_LOCK_HELD=1',
      `EVIL=$(touch ${join(dir, 'ran')})`,
      'no equals sign here',
    ]);
    try {
      const r = await withLock(lock, `${show}; echo "opts=$NODE_OPTIONS"`, {
        LB_AGENT_ENV: file,
        LB_TEST_DATABASE_URL: '',
        NODE_OPTIONS: '',
      });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /url=postgres:\/\/postgres@127\.0\.0\.1:54316\/postgres\n/);
      assert.ok(r.out.includes(`path=${bin}:`), r.out);
      assert.match(r.out, /opts=\n/);
      assert.match(r.out, /acquired/, 'LB_TEST_LOCK_HELD from the file is ignored');
      assert.ok(!existsSync(join(dir, 'ran')), 'a value is never run');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never overrides a database URL that is set, nor puts the directory first twice', async () => {
    const { dir, lock, bin, file } = settings((bin) => [
      'LB_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54316/postgres',
      `PATH_PREFIX=${bin}`,
    ]);
    try {
      const r = await withLock(lock, show, {
        LB_AGENT_ENV: file,
        LB_TEST_DATABASE_URL: 'postgres://mine@127.0.0.1:5999/x',
        PATH: `${bin}:${process.env.PATH}`,
      });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /url=postgres:\/\/mine@127\.0\.0\.1:5999\/x\n/);
      assert.ok(r.out.includes(`path=${bin}:${process.env.PATH}\n`), r.out);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs as before without the file', async () => {
    const { dir, lock } = scratch();
    try {
      const r = await withLock(lock, show, {
        LB_AGENT_ENV: join(dir, 'missing'),
        LB_TEST_DATABASE_URL: '',
      });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /url=\n/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
