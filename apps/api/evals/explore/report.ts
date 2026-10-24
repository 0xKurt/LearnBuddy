// requires live verification in Claude Code session (eval tooling; measured pilot documented in docs/measurements)
import { z } from 'zod';
import type { Finding } from './checks.js';
import type { Step } from './session.js';

export const keyOf = (f: Finding) => [f.invariant, f.kind, f.route].join('|');
export function dedupe(findings: Finding[]) {
  return [...new Map(findings.map((f) => [keyOf(f), f])).values()];
}
export function gate(
  expected: number,
  completed: number,
  findings: Finding[],
  aborted: string | null,
  replaysComplete: boolean,
) {
  return (
    completed === expected && expected > 0 && !aborted && replaysComplete && findings.length === 0
  );
}
/** Prefix minimisation preserves causal history. It is a candidate, never automatically admitted. */
export function candidate(steps: Step[], f: Finding) {
  const first = steps.findIndex((s) => s.findings.some((v) => keyOf(v) === keyOf(f)));
  return {
    invariant: keyOf(f),
    actions: steps.slice(0, first < 0 ? steps.length : first + 1).map((s) => s.action),
    minimisation: 'first witnessed failing prefix; not deletion-minimal',
    review: { status: 'pending', reviewers: [] as string[], expectationVerified: false },
  };
}
const Approval = z.object({
  expectationVerified: z.literal(true),
  human: z.string().min(1).nullable(),
  reviewers: z.array(z.string().min(1)),
});
export function canPromote(input: unknown) {
  const a = Approval.safeParse(input);
  return a.success && (a.data.human !== null || new Set(a.data.reviewers).size >= 2);
}
export function economics(
  findings: Finding[],
  receiptUsd: number,
  upperUsd: number,
  usdPerEuro: number,
) {
  if (!(Number.isFinite(usdPerEuro) && usdPerEuro > 0))
    throw new Error('Explicit positive USD per EUR required');
  const confirmed = dedupe(findings.filter((f) => f.category === 'app')).length;
  return {
    confirmed,
    receiptUsd,
    upperUsd,
    usdPerEuro,
    costEuro: upperUsd / usdPerEuro,
    confirmedPerEuro: upperUsd > 0 ? confirmed / (upperUsd / usdPerEuro) : null,
  };
}
