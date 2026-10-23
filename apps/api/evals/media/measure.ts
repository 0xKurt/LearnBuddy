// requires live verification in Claude Code session
// Explicit, bounded live verification. Source the approved environment in the shell; never
// load/copy an env file here. Synthetic fixtures prove compatibility, not human accuracy.
//   pnpm -C apps/api exec tsx evals/media/measure.ts tts|transcribe|pronounce|embedding
import { readFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config.js';
import { openAIClient } from '../../src/llm/openai-client.js';
import { GoogleSpeech } from '../../src/speech/google.js';
import { pronunciationAudio } from '../../src/speech/audio-codec.js';
import { SYSTEM, JUDGEMENT_SCHEMA } from '../../src/modules/practice/speak.js';
import { SHEETS, RETRIEVAL_CASES } from '../lookup/fixtures.js';

const mode = process.argv[2];
if (!['tts', 'transcribe', 'pronounce', 'embedding'].includes(mode ?? ''))
  throw new Error('Choose a measurement mode');
const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  LLM_BACKEND: 'disabled',
});
const client = openAIClient(config);
let calls = 0,
  ceiling = 0;
async function measure(label: string, reserve: number, run: () => Promise<unknown>): Promise<void> {
  if (ceiling + reserve > 0.8) throw new Error('Measurement ceiling reached');
  ceiling += reserve;
  calls++;
  const start = performance.now();
  try {
    console.info(
      JSON.stringify({ label, result: await run(), ms: Math.round(performance.now() - start) }),
    );
  } catch (error) {
    console.info(
      JSON.stringify({
        label,
        error: error instanceof Error ? error.name : 'unknown',
        ms: Math.round(performance.now() - start),
      }),
    );
    process.exitCode = 1;
  }
}
const texts: Record<string, string> = {
  de: 'Wir schauen uns die Aufgabe gemeinsam an. Was hast du schon herausgefunden?',
  en: 'Let us look at the exercise together. What have you found out so far?',
  fr: 'Regardons cet exercice ensemble. Qu’as-tu déjà trouvé ?',
  es: 'Vamos a mirar el ejercicio juntos. ¿Qué has descubierto hasta ahora?',
  it: 'Guardiamo insieme questo esercizio. Che cosa hai già scoperto?',
};
try {
  if (mode === 'tts') {
    const google = new GoogleSpeech(config);
    for (const [locale, text] of Object.entries(texts)) {
      await measure(`chirp3/${locale}`, 0.004, async () => ({
        bytes: (
          await google.synthesize({
            text,
            locale: google.localeFor(locale)!,
            voice: 'warm',
            rate: 1,
            timeoutMs: 20000,
          })
        ).audio.length,
      }));
      for (const model of ['tts-1', 'gpt-4o-mini-tts'])
        await measure(`${model}/${locale}`, 0.01, async () => {
          const result = await client.audio.speech.create(
            { model, voice: 'nova', input: text, response_format: 'mp3', speed: 1 },
            { signal: AbortSignal.timeout(20000) },
          );
          return { bytes: (await result.arrayBuffer()).byteLength };
        });
    }
  }
  if (mode === 'transcribe') {
    const bytes = await readFile(
      new URL('../../src/testing/fixtures/audio/t15.m4a', import.meta.url),
    );
    for (const model of ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'])
      await measure(model, 0.01, async () =>
        client.audio.transcriptions.create(
          {
            model,
            file: new File([new Uint8Array(bytes)], 'recording.m4a'),
            response_format: 'json',
          },
          { signal: AbortSignal.timeout(20000) },
        ),
      );
  }
  if (mode === 'pronounce') {
    const bytes = await readFile(
      new URL('../../src/testing/fixtures/audio/speak8.m4a', import.meta.url),
    );
    const input_audio = await pronunciationAudio({
      mimeType: 'audio/m4a',
      data: bytes.toString('base64'),
    });
    await measure('gpt-audio-1.5/synthetic', 0.05, async () => {
      const result = await client.chat.completions.create(
        {
          model: config.OPENAI_MODEL_PRONOUNCE,
          store: false,
          modalities: ['text'],
          max_completion_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: SYSTEM + '\nReturn only JSON matching ' + JSON.stringify(JUDGEMENT_SCHEMA),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'TARGET: Je m’appelle Léna et j’habite à Berlin.\nLANGUAGE: fr\nAPP LANGUAGE: de\nAGE: 12',
                },
                { type: 'input_audio', input_audio },
              ],
            },
          ],
        },
        { signal: AbortSignal.timeout(20000) },
      );
      return { usage: result.usage, judgement: result.choices[0]?.message.content };
    });
  }
  if (mode === 'embedding') {
    const extra = [
      { query: 'How do plants make food from sunlight?', expected: 'photosynthese' },
      {
        query: 'Comment les plantes fabriquent-elles du sucre avec la lumière ?',
        expected: 'photosynthese',
      },
      { query: '¿Cómo se forman las nubes?', expected: 'wasserkreislauf' },
      { query: 'Come si confrontano due frazioni?', expected: 'brueche' },
    ];
    const queries = [...RETRIEVAL_CASES, ...extra];
    const unrelated = [
      'quantenphysik atomorbitale',
      'mein Hund ist krank',
      'what causes earthquakes',
      'manger au restaurant',
      '¿Cómo funcionan los volcanes?',
      'le equazioni quadratiche',
    ];
    for (const model of ['text-embedding-3-small', 'text-embedding-3-large'])
      await measure(model, 0.01, async () => {
        const result = await client.embeddings.create(
          {
            model,
            input: [...SHEETS.map((s) => s.text), ...queries.map((c) => c.query), ...unrelated],
            dimensions: 1536,
            encoding_format: 'float',
          },
          { signal: AbortSignal.timeout(15000) },
        );
        const vectors = result.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
        const scores = (q: number[]) =>
          SHEETS.map((s, j) => ({
            key: s.key,
            distance: 1 - vectors[j]!.reduce((a, v, k) => a + v * q[k]!, 0),
          })).sort((a, b) => a.distance - b.distance);
        return {
          usage: result.usage,
          cases: queries.map((c, i) => ({
            query: c.query,
            expected: c.expected,
            ranked: scores(vectors[SHEETS.length + i]!),
          })),
          unrelated: unrelated.map((query, i) => ({
            query,
            nearest: scores(vectors[SHEETS.length + queries.length + i]!)[0],
          })),
        };
      });
  }
} finally {
  await appendFile(
    join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md'),
    `\n${new Date().toISOString().slice(0, 10)} | cx-speech | #893 | ${calls} | <=${ceiling.toFixed(4)} | ${mode} measurement (synthetic fixtures)\n`,
  );
}
