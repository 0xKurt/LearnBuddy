// Test the Vision prompt against a set of local image files.
// Run:  pnpm -F @learnbuddy/api probe:vision <subjectKind> <gradeLevel> path1.jpg [path2.jpg ...]
// Example: pnpm -F @learnbuddy/api probe:vision language_foreign 7 /tmp/fr1.jpg /tmp/fr2.jpg

import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { VertexLlmGateway } from '../src/lib/llm/vertex.js';
import { Env } from '../src/lib/env.js';

type SubjectKind = Parameters<VertexLlmGateway['visionExtractAndGenerate']>[0]['subjectKind'];

function inferMime(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function main() {
  const [, , subjectKind, gradeArg, ...imagePaths] = process.argv;
  if (!subjectKind || !gradeArg || imagePaths.length === 0) {
    console.error('Usage: pnpm probe:vision <subjectKind> <gradeLevel> <image1> [image2 ...]');
    console.error(
      'subjectKind ∈ { math, physics, chemistry, biology, geography, history, language_native, language_foreign, religion_ethics, art_music, general, other }',
    );
    process.exit(2);
  }
  const env = Env.parse({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://localhost:54321',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'probe-anon-key-00000000',
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'probe-service-key-00000000',
  });
  if (!env.GOOGLE_CLOUD_PROJECT) {
    console.error('GOOGLE_CLOUD_PROJECT missing — set it in apps/api/.env.local');
    process.exit(2);
  }

  const images = imagePaths.map((p) => ({
    mimeType: inferMime(p),
    data: fs.readFileSync(p).toString('base64'),
  }));
  const gateway = new VertexLlmGateway(env);

  console.log(
    `Probing ${imagePaths.length} image(s) as subject=${subjectKind} grade=${gradeArg}\n`,
  );
  const t0 = Date.now();
  const result = await gateway.visionExtractAndGenerate({
    images,
    locale: 'de',
    gradeLevel: Number(gradeArg),
    subject: subjectKind,
    subjectKind: subjectKind as SubjectKind,
    targetCount: 12,
  });
  const ms = Date.now() - t0;
  console.log(`Vertex returned in ${ms}ms\n`);
  console.log(`detected_language: ${result.detected_language ?? '(null)'}`);
  console.log(`error: ${result.error ?? 'null'}`);
  console.log(`items: ${result.items.length}`);
  console.log(`diagrams: ${result.diagrams.length}`);
  console.log(
    `templates: ${(result as { problem_templates?: unknown[] }).problem_templates?.length ?? 0}`,
  );
  console.log(`tokens in/out: ${result.usage.input_tokens}/${result.usage.output_tokens}\n`);

  console.log('─'.repeat(80));
  console.log('EXTRACTED MARKDOWN (first 600 chars):');
  console.log(String(result.extracted_markdown ?? '').slice(0, 600));
  console.log('─'.repeat(80));
  console.log('ITEMS:');
  result.items.forEach((it, i) => {
    console.log(
      `\n[${String(i + 1).padStart(2, '0')}] kind=${it.answer_kind} · diff=${it.difficulty} · topic=${JSON.stringify(it.topic)}`,
    );
    console.log(`     Q: ${it.question}`);
    console.log(`     A: ${it.expected_answer}`);
    if (Array.isArray(it.acceptable_answers) && it.acceptable_answers.length > 0) {
      console.log(`        alt: ${JSON.stringify(it.acceptable_answers)}`);
    }
    if (it.source_excerpt) {
      const ex = String(it.source_excerpt).slice(0, 100).replace(/\s+/g, ' ');
      console.log(`        src: ${ex}`);
    }
  });
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
