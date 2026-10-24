// One live sheet reading; local throwaway Postgres, no hosted data or device writes (#870).
// Run from apps/api with .env.local, under scripts/test-lock.sh. At most one choice + one reading.
// requires live verification in Claude Code session (real model; fake auth/storage and photo)
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

import type { BuddyHome, MaterialView } from '@learnbuddy/shared-types/contracts';
import { config as dotenv } from 'dotenv';
import sharp from 'sharp';

import { loadConfig } from '../../src/config.js';
import { LlmError, type LlmGateway } from '../../src/llm/gateway.js';
import { llmGateway } from '../../src/production.js';
import { ScriptedGateway } from '../../src/testing/fakes.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

dotenv({ path: '.env.local', quiet: true });
const real = llmGateway(
  loadConfig({
    ...process.env,
    DATABASE_URL: 'postgres://unused/unused',
    SUPABASE_URL: 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  }),
);
const fallback = new ScriptedGateway()
  .byDefault('figures', { json: { assets: [] } })
  .byDefault('buddy_check', { json: { disposition: 'wait', actions: [], outreach: null } });
const used = new Set<string>();
let micros = 0;
let calls = 0;
let streamEndMs: number | null = null;
let firstTokenMs: number | null = null;
let sent = 0;
let readingKeys: string[] = [];
let sentKeys: string[] = [];
let requiredKeys: unknown;
let rawReading = '';
const gateway: LlmGateway = {
  available: true,
  profile: real.profile,
  async generate(req) {
    if (req.purpose !== 'forms' && req.purpose !== 'extraction') return fallback.generate(req);
    if (used.has(req.purpose) || micros >= 400_000)
      throw new LlmError('unavailable', 'one-reading budget reached');
    used.add(req.purpose);
    calls++;
    if (req.purpose === 'extraction') {
      sentKeys = Object.keys(req.schema.properties as Record<string, unknown>);
      requiredKeys = req.schema.required;
    }
    try {
      const result = await real.generate({
        ...req,
        ...(req.onPartial
          ? {
              onPartial: (raw: string) => {
                firstTokenMs ??= Math.round(performance.now() - sent);
                rawReading = raw;
                req.onPartial?.(raw);
              },
            }
          : {}),
      });
      micros += result.usage.costMicros;
      if (req.purpose === 'extraction') {
        streamEndMs = Math.round(performance.now() - sent);
        readingKeys = Object.keys(result.json as Record<string, unknown>);
      }
      return result;
    } catch (err) {
      if (err instanceof LlmError) micros += err.usage?.costMicros ?? 0;
      throw err;
    }
  },
};
const env = await createTestEnv({ gateway, embeddings: 'disabled' });
let report: Record<string, unknown> = {};
try {
  const learner = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  const words = [
    'la maison — das Haus',
    'le jardin — der Garten',
    'la porte — die Tür',
    'la fenêtre — das Fenster',
    'la cuisine — die Küche',
    'la chambre — das Zimmer',
    'la table — der Tisch',
    'la chaise — der Stuhl',
    'le lit — das Bett',
    'le livre — das Buch',
    'le cahier — das Heft',
    'le crayon — der Bleistift',
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="1100"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="black"><text x="50" y="75" font-size="30">Französisch: À la maison</text>${words.map((w, i) => `<text x="50" y="${150 + i * 66}" font-size="26">${w}</text>`).join('')}</g></svg>`;
  const photo = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const created = await learner.api.post<{ material: MaterialView; uploads: { path: string }[] }>(
    '/materials',
    {
      client_request_id: crypto.randomUUID(),
      photo_mimes: ['image/jpeg'],
      sending: true,
    },
  );
  for (const u of created.body.uploads) env.storage.put(u.path, photo);
  sent = performance.now();
  await learner.api.post(`/materials/${created.body.material.id}/submit`);
  let finished = false;
  let firstCardMs: number | null = null;
  const counts: number[] = [];
  const work = env.flushBackground().finally(() => {
    finished = true;
  });
  do {
    const { now } = (await learner.api.get<BuddyHome>('/buddy')).body;
    if (now?.type === 'practice_ready') {
      firstCardMs ??= Math.round(performance.now() - sent);
      if (counts.at(-1) !== now.question_count) counts.push(now.question_count);
    }
    if (!finished) await pause(100);
  } while (!finished);
  await work;
  const material = (await learner.api.get<MaterialView>(`/materials/${created.body.material.id}`))
    .body;
  report = {
    firstTokenMs,
    sentKeys,
    requiredKeys,
    readingKeys,
    prefixKeys: rawReading.match(
      /(?:^|[,{]\s*)"(source|marked|other_subject|is_learning_material|readable|title|subject|extracted_text|items)"\s*:/g,
    ),
    firstCardMs,
    streamEndMs,
    counts,
    status: material.status,
    questions: material.item_count,
    incomplete: material.items_incomplete,
    calls,
    usd: micros / 1e6,
  };
  console.log(JSON.stringify(report, null, 2));
  if (
    firstCardMs === null ||
    streamEndMs === null ||
    firstCardMs >= streamEndMs ||
    micros > 400_000
  )
    process.exitCode = 1;
} finally {
  appendFileSync(
    join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md'),
    `\n${new Date().toISOString()} | 870-streamed-reading | #870 | ${calls} | ${(micros / 1e6).toFixed(6)} | one sheet reading; ${JSON.stringify(report)}\n`,
  );
  await env.close();
}
