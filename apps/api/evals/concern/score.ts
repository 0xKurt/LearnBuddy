// requires live verification in Claude Code session
/** A blocked or failed call is measured separately from the model's decision. */
export type Outcome = 'concern' | 'plain' | 'blocked' | 'failed';
export function correctConcern(outcome: Outcome, expected: boolean): boolean {
  return (outcome === 'concern' || outcome === 'plain') && (outcome === 'concern') === expected;
}
