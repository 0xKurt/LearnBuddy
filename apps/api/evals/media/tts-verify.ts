// requires live verification in Claude Code session
import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { openAIClient } from '../../src/llm/openai-client.js';
const root = process.env.TTS_MEASURE_DIR!;
if (!root || process.env.LB_TEST_LOCK_HELD !== '1') throw new Error('Output and lock required');
const client = openAIClient({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
});
const ledger = join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md');
await appendFile(
  ledger,
  '\n2026-10-24 | cx-ttsr | #926 | reserved <=28 | <=0.10 | second independent transcription of mismatches; synthetic saved audio only\n',
);
let calls = 0;
for (const variant of ['', 'verbatim', 'nonreasoning']) {
  const directory = join(root, variant);
  const rows = (await readFile(join(directory, 'results.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          option: string;
          mode: string;
          run: number;
          exactWords: boolean;
          extension: string;
          text: string;
        },
    );
  for (const row of rows.filter((row) => !row.exactWords)) {
    const filename = `${row.option}-${row.mode}-${row.run}.${row.extension}`;
    const data = await readFile(join(directory, filename));
    for (const model of ['whisper-1', 'gpt-4o-transcribe']) {
      if (++calls > 28) throw new Error('call ceiling');
      const result = await client.audio.transcriptions.create(
        { model, language: 'de', file: new File([data], filename) },
        { timeout: 15000, signal: AbortSignal.timeout(15000) },
      );
      const output = { variant, filename, model, expected: row.text, transcript: result.text };
      await appendFile(join(root, 'verification.jsonl'), JSON.stringify(output) + '\n');
      console.info(JSON.stringify(output));
    }
  }
}
await appendFile(
  ledger,
  `2026-10-24 | cx-ttsr | #926 | ${calls} | <=0.10 | second-transcriber verification complete\n`,
);
