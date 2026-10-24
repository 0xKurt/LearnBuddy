// requires live verification in Claude Code session (local Vosk input; no model calls)
// Persistent, local-only scoring worker for vosk_probe.py. Shares the shipped verdict code.
import { createInterface } from 'node:readline';
import {
  gradePronunciation,
  PronunciationPlan,
  PronunciationEvidence,
} from '@learnbuddy/shared-types/contracts';

const lines = createInterface({ input: process.stdin });
process.stdout.write('ready\n');
for await (const line of lines) {
  const input = JSON.parse(line) as { plan: unknown; evidence: unknown };
  const result = gradePronunciation(
    PronunciationPlan.parse(input.plan),
    PronunciationEvidence.parse(input.evidence),
  );
  process.stdout.write(JSON.stringify(result) + '\n');
}
