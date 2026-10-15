// The one place a vitest config learns how many workers it may start (issue: "Test runs must
// not overload the machine"). LB_TEST_MAX_WORKERS caps them; unset (CI) leaves vitest's own
// default untouched. scripts/test-lock.sh sets it to 2 for local runs, so several agents or
// hooks on one machine cannot start a dozen workers each.

/** @returns {{ maxWorkers?: number, minWorkers?: number }} */
export function workerLimits(env = process.env) {
  const cap = Number.parseInt(env.LB_TEST_MAX_WORKERS ?? '', 10);
  if (!Number.isInteger(cap) || cap < 1) return {};
  return { maxWorkers: cap, minWorkers: 1 };
}
