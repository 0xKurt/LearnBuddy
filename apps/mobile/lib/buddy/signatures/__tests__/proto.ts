// The prototypes' stand-in for her voice while listening (orb-varianten*.html `voice`): the
// reference numbers in these tests were read with it.
export function protoVoice(t: number): number {
  const a = Math.max(0, Math.sin(t * 3.1)) * (0.6 + 0.4 * Math.sin(t * 7.3 + 0.5));
  return Math.min(1, Math.max(0, 0.18 + 0.62 * a + 0.12 * Math.sin(t * 13.1) * Math.sin(t * 2.2)));
}
