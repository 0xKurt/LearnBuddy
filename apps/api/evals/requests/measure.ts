// What each model call of one photographed sheet carries, measured on the request (issue #284).
//
//   cd apps/api && npx tsx evals/requests/measure.ts            # sizes in characters
//   cd apps/api && npx tsx evals/requests/measure.ts --tokens   # plus a text-token estimate
//
// The journey is `src/testing/request-flow.ts`: real app, real Postgres, scripted model — so
// the numbers are the request the gateway was handed, byte for byte, and cost nothing.
// `--tokens` counts the text parts with the SDK's LocalTokenizer (the Gemma 3 vocabulary the SDK
// maps Gemini 2.5/3 models to; it downloads the vocabulary once). That is an ESTIMATE of text
// tokens, not native usage: images, the schema's own accounting and billing are not in it
// (issue #281: native schema tokens were ≈1.8× the text count). Native numbers come only from
// `usageMetadata` of a live call.
// requires live verification in Claude Code session (needs a running Postgres; no model)

import { config as loadDotenv } from 'dotenv';

import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { playSheetJourney, requestFacts } from '../../src/testing/request-flow.js';

loadDotenv({ path: '.env.local' });

async function textTokens(): Promise<((text: string) => Promise<number>) | null> {
  if (!process.argv.includes('--tokens')) return null;
  const { LocalTokenizer } = await import('@google/genai/tokenizer/node');
  const tokenizer = new LocalTokenizer('gemini-2.5-flash');
  return async (text) => (text ? ((await tokenizer.countTokens(text)).totalTokens ?? 0) : 0);
}

async function main(): Promise<void> {
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const count = await textTokens();
  const env = await createTestEnv({ start: '2026-10-02T12:00:00Z' });
  try {
    const lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const journey = await playSheetJourney(env, lena);
    if (env.llm.unexpected.length || env.llm.scriptErrors.length)
      throw new Error(`journey went off script: ${env.llm.unexpected.map((u) => u.purpose)}`);
    const head = [
      'call',
      'system',
      'schema',
      'text',
      'images',
      'image b64',
      'pages',
      'sheet',
      'days',
    ];
    if (count) head.push('system+text tok (est.)', 'schema tok (text, est.)');
    console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);
    for (const req of env.llm.calls) {
      const f = requestFacts(req, journey);
      const row: Array<string | number> = [
        f.purpose,
        f.systemChars,
        f.schemaChars,
        f.textChars,
        f.images,
        f.imageBase64Chars,
        f.pageCopies.join('/'),
        f.sheetTextCopies,
        f.dayListCopies,
      ];
      if (count) {
        const text = req.contents
          .flatMap((m) => m.parts.map((p) => ('text' in p ? p.text : '')))
          .join('\n');
        row.push(await count(`${req.system}\n${text}`), await count(JSON.stringify(req.schema)));
      }
      console.log(`| ${row.join(' | ')} |`);
    }
  } finally {
    await env.close();
  }
}

await main();
