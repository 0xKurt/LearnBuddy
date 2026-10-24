// requires live verification in Claude Code session
// The implemented gateway, not an alternative measurement-only transport. Reserve <=$0.10.
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openAIClient } from '../../src/llm/openai-client.js';
import { OpenAISpeech } from '../../src/speech/openai.js';
import { speechVoices } from '../../src/speech/openai-config.js';
const directory = process.env.TTS_MEASURE_DIR;
if (!directory || process.env.LB_TEST_LOCK_HELD !== '1')
  throw new Error('Output and lock required');
const ledger = join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md');
await appendFile(
  ledger,
  '\n2026-10-24 | cx-ttsr | #926 | reserved 10 | <=0.10 | implemented persistent gateway, five warm syntheses plus whisper back-transcription\n',
);
await mkdir(directory, { recursive: true });
const client = openAIClient({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
});
const speech = new OpenAISpeech(client, speechVoices('gpt-realtime-1.5', {}), 'gpt-realtime-1.5');
const settings = {
  locale: 'de-DE',
  voice: 'warm' as const,
  rate: 1,
  timeoutMs: 8000,
  sessionKey: 'synthetic-benchmark',
  pcm: true,
};
let calls = 0,
  micros = 0;
try {
  const start = performance.now();
  await speech.prepare(settings);
  console.info(JSON.stringify({ prewarmMs: Math.round(performance.now() - start) }));
  for (const [i, text] of [
    'Wir schauen uns die Aufgabe gemeinsam an.',
    'Teile den Kreis in vier gleich große Stücke.',
    'Was hast du bei diesem Versuch beobachtet?',
    'Lies den ersten Absatz bitte noch einmal.',
    'Erkläre deinen nächsten Schritt in eigenen Worten.',
  ].entries()) {
    const start = performance.now();
    let firstAudioMs: number | null = null;
    calls++;
    const result = await speech.synthesize({
      ...settings,
      text,
      onAudio: async (chunk) => {
        if (chunk.audio.length) firstAudioMs ??= Math.round(performance.now() - start);
      },
    });
    const totalMs = Math.round(performance.now() - start);
    micros += result.costMicros ?? 0;
    const name = `gateway-${i + 1}.wav`;
    await writeFile(join(directory, name), result.audio);
    calls++;
    const transcript = await client.audio.transcriptions.create(
      { model: 'whisper-1', language: 'de', file: new File([new Uint8Array(result.audio)], name) },
      { timeout: 15000 },
    );
    const row = {
      text,
      firstAudioMs,
      totalMs,
      costMicros: result.costMicros,
      transcript: transcript.text,
    };
    await appendFile(join(directory, 'results.jsonl'), JSON.stringify(row) + '\n');
    console.info(JSON.stringify(row));
  }
} finally {
  speech.close();
  await appendFile(
    ledger,
    `2026-10-24 | cx-ttsr | #926 | ${calls} | <=0.10 (${(micros / 1e6).toFixed(6)} synthesis receipts) | gateway batch ended\n`,
  );
}
