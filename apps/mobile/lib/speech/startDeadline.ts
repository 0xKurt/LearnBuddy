// How long getting the microphone ready may take before she is told it did not work
// (issue #158), and when that deadline actually applies.
//
// Separate from lib/speech/record.ts so the decision can be tested without a recorder: the
// external audit found both failing browser cases hanging in exactly this state, with the
// talk screen saying "Ich höre zu" the whole time.

/**
 * Long enough for a permission sheet she has to read and answer, short enough that she
 * does not talk into a microphone that never started.
 */
export const START_DEADLINE_MS = 20_000;

/** Whether the deadline should end the attempt when it fires. */
export function startTimedOut(at: { phase: string; mounted: boolean }): boolean {
  // Already recording (or already given up): nothing to end. Screen gone: the attempt was
  // stopped with it, and a failure fired into a component that left helps nobody.
  return at.phase === 'starting' && at.mounted;
}
