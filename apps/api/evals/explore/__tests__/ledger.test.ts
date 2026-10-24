import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appendBudgetLedger } from '../ledger.js';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'explore-ledger-'));
  vi.stubEnv('HOME', directory);
  vi.stubEnv('LB_BUDGET_LEDGER', '');
  mkdirSync(join(directory, '.local/share/learnbuddy-agents'), { recursive: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
it.each([undefined, ''])('does not write a ledger when the path is %s', (path) => {
  vi.stubEnv('LB_BUDGET_LEDGER', path);
  appendBudgetLedger('entry');
  expect(existsSync(join(directory, '.local/share/learnbuddy-agents/BUDGET-LEDGER.md'))).toBe(
    false,
  );
});
it('appends to the explicitly configured ledger', () => {
  const ledger = join(directory, 'budget.md');
  vi.stubEnv('LB_BUDGET_LEDGER', ledger);
  appendBudgetLedger('first\n');
  appendBudgetLedger('second\n');
  expect(readFileSync(ledger, 'utf8')).toBe('first\nsecond\n');
});
it('preserves successful and failed run results when the ledger cannot be written', () => {
  vi.stubEnv('LB_BUDGET_LEDGER', directory);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const finish = (fails: boolean) => {
    try {
      if (fails) throw new Error('original run failure');
      return 'original success';
    } finally {
      appendBudgetLedger('entry');
    }
  };
  expect(finish(false)).toBe('original success');
  expect(() => finish(true)).toThrow('original run failure');
  expect(warning).toHaveBeenCalledTimes(2);
});
