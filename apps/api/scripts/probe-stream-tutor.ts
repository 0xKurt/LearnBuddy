// Streaming probe — verifies sentence-by-sentence TTS works against
// the live DeepSeek + multilingual TTS stack.
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { Env } from '../src/lib/env.js';
import { createLlmGateway } from '../src/lib/llm/factory.js';
import { createTTSGateway } from '../src/lib/voice/factory.js';
import { runStreamPipeline } from '../src/lib/agent/stream-pipeline.js';
import { buildAgentSystemInstructionV3_1 } from '../src/lib/agent/index.js';

async function main() {
  const env = Env.parse({ ...process.env, AGENT_PROMPT_VERSION: 'v3.1' });
  // We don't actually need llm here, we call the pipeline directly.
  void createLlmGateway(env);
  const tts = createTTSGateway(env);

  const instruction = buildAgentSystemInstructionV3_1({
    learner: { displayName: 'Lena', gradeLevel: 8, locale: 'de' },
    currentItem: {
      itemId: 'demo',
      question: 'Was heißt "die Uhr" auf Französisch?',
      expectedAnswer: "l'heure",
      acceptableAnswers: ["l'heure"],
      answerKind: 'short',
      topic: 'Uhrzeit',
      difficulty: 2,
      subjectKind: 'language_foreign',
      mcOptions: null,
      mcCorrectIndex: null,
      units: null,
      sourceExcerpt: null,
    },
    materialContext: null,
    hintsGivenForItem: 0,
    priorWrongAttemptsOnItem: 0,
    history: [],
    learnerMessage: 'weiß nicht',
    session: {
      itemsTotal: 5,
      itemsRemaining: 5,
      minutesElapsed: 0,
      testMode: false,
      correctRateSoFar: 0,
      itemsCompleted: 0,
      currentStreak: 0,
      hintsUsedTotal: 0,
    },
  });

  console.log('--- streaming starts ---');
  const t0 = Date.now();
  let firstChunkAt = -1;
  let firstAudioAt = -1;

  const result = await runStreamPipeline(
    {
      env,
      modelId: env.VERTEX_TUTOR_MODEL_ID,
      systemContent: instruction,
      history: [],
      learnerMessage: 'weiß nicht',
      baseLocale: 'de',
      foreignLocale: 'fr',
      voiceId: null,
      withAudio: true,
      tts,
    },
    {
      onReplySoFar: (text) => {
        if (firstChunkAt < 0) firstChunkAt = Date.now() - t0;
        process.stdout.write(
          `\r[reply ${Date.now() - t0}ms]: ${text.slice(0, 100)}                    `,
        );
      },
      onAudioChunk: ({ index, durationMs }) => {
        if (firstAudioAt < 0) firstAudioAt = Date.now() - t0;
        console.log(
          `\n  → audio chunk #${index} ready at ${Date.now() - t0}ms (${durationMs}ms playback)`,
        );
      },
    },
  );
  console.log(`\n--- done ---`);
  console.log(`First reply chunk at: ${firstChunkAt}ms`);
  console.log(`First audio chunk at: ${firstAudioAt}ms`);
  console.log(`Total time: ${Date.now() - t0}ms`);
  console.log(`Audio chunks emitted: ${result.audioChunksEmitted}`);
  console.log(`Final reply: ${result.reply}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
