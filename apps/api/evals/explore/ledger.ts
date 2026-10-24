// requires live verification in Claude Code session (optional local evaluation bookkeeping)
import { appendFileSync } from 'node:fs';

/** Optional operator bookkeeping must never replace the evaluation result. */
export function appendBudgetLedger(entry: string) {
  const path = process.env.LB_BUDGET_LEDGER;
  if (!path) return;
  try {
    appendFileSync(path, entry);
  } catch (error) {
    console.warn('Budget ledger append failed:', error);
  }
}
