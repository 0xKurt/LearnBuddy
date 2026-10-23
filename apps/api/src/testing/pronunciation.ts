// requires live verification in Claude Code session (scripted text-model reply only)
import type { TestEnv } from './harness.js';
export function scriptPronunciationTip(
  env: TestEnv,
  count: number,
  tip: string | null = null,
): void {
  env.llm.script('tutor', {
    json: { reply: 'Hör zu und vergleiche.', tips: Array.from({ length: count }, () => tip) },
  });
}
