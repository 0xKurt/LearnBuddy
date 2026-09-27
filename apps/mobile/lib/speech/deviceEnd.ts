// What an on-device recognition that just ended comes to (lib/speech/recognize.ts).
// Pure, so the rule is unit-tested.

export type DeviceEnd =
  | { kind: 'text'; text: string }
  | { kind: 'fallback' }
  | { kind: 'empty' }
  | { kind: 'failed' }
  | { kind: 'silent' };

/**
 * `interrupted`: the system ended it (Control Centre, a call, the app going away), not
 * she. Half a sentence is then no answer: nothing is delivered and the screen is told,
 * so it never waits half-paused (p2-lc-recogniser-abort-sends-partial,
 * recogniser-abort-no-signal). `outcome` 'failed' was already reported by the error.
 */
export function deviceEnd(
  text: string,
  outcome: 'none' | 'fallback' | 'failed',
  interrupted: boolean,
): DeviceEnd {
  if (interrupted) return { kind: 'failed' };
  if (text) return { kind: 'text', text };
  if (outcome === 'fallback') return { kind: 'fallback' };
  if (outcome === 'none') return { kind: 'empty' };
  return { kind: 'silent' };
}
