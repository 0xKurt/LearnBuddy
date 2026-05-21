// Quick read-only dump of items so we can eyeball question quality.
// Run: pnpm -F @learnbuddy/api probe:items [limit]

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { createServiceClient } from '../src/lib/supabase.js';
import { Env } from '../src/lib/env.js';

async function main() {
  const env = Env.parse({
    ...process.env,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? 'placeholder',
  });
  const supabase = createServiceClient(env);
  const limit = Number(process.argv[2] ?? 40);

  const itemsRes = await supabase
    .from('items')
    .select(
      'id, question, expected_answer, acceptable_answers, answer_kind, topic, difficulty, language, source_excerpt, material_id, created_at, generated_by_model, generated_by_prompt_version',
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (itemsRes.error) {
    console.error('items error', itemsRes.error);
    process.exit(1);
  }
  type ItemRow = {
    id: string;
    question: string;
    expected_answer: string;
    acceptable_answers: unknown;
    answer_kind: string;
    topic: unknown;
    difficulty: number;
    language: string | null;
    source_excerpt: string | null;
    material_id: string;
    created_at: string;
    generated_by_model: string | null;
    generated_by_prompt_version: string | null;
  };
  type MaterialRow = {
    id: string;
    title: string | null;
    subject_id: string;
    extraction_status: string;
    page_count: number | null;
    created_at: string;
  };
  type SubjectRow = { id: string; name: string; subject_kind: string };

  const items = (itemsRes.data ?? []) as ItemRow[];
  const matIds = [...new Set(items.map((i) => i.material_id))];
  const matsRes = await supabase
    .from('materials')
    .select('id, title, subject_id, extraction_status, page_count, created_at')
    .in('id', matIds);
  const matsRows = (matsRes.data ?? []) as MaterialRow[];
  const mats = new Map<string, MaterialRow>(matsRows.map((m) => [m.id, m]));
  const subjIds = [...new Set(Array.from(mats.values()).map((m) => m.subject_id))];
  const subjRes = await supabase
    .from('subjects')
    .select('id, name, subject_kind')
    .in('id', subjIds);
  const subjsRows = (subjRes.data ?? []) as SubjectRow[];
  const subjs = new Map<string, SubjectRow>(subjsRows.map((s) => [s.id, s]));

  // Group by material to show context
  const byMaterial = new Map<string, ItemRow[]>();
  for (const it of items) {
    const arr = byMaterial.get(it.material_id) ?? [];
    arr.push(it);
    byMaterial.set(it.material_id, arr);
  }

  console.log(`\n${items.length} items across ${byMaterial.size} materials\n`);
  for (const [matId, list] of byMaterial.entries()) {
    const m = mats.get(matId);
    const s = m ? subjs.get(m.subject_id) : null;
    console.log('═'.repeat(80));
    console.log(
      `Material: ${m?.title ?? '(no title)'}  ·  Subject: ${s?.name ?? '?'} (${s?.subject_kind ?? '?'})`,
    );
    console.log(
      `Status: ${m?.extraction_status ?? '?'}  ·  Pages: ${m?.page_count ?? '?'}  ·  Items: ${list.length}`,
    );
    console.log('─'.repeat(80));
    for (const it of list) {
      console.log(
        `[#${it.answer_kind} · diff=${it.difficulty} · topic=${JSON.stringify(it.topic)}]`,
      );
      console.log(`Q: ${it.question}`);
      console.log(`A: ${it.expected_answer}`);
      if (Array.isArray(it.acceptable_answers) && it.acceptable_answers.length > 0) {
        console.log(`   alt: ${JSON.stringify(it.acceptable_answers)}`);
      }
      if (it.source_excerpt) {
        const excerpt = String(it.source_excerpt).slice(0, 140).replace(/\s+/g, ' ');
        console.log(`   src: ${excerpt}…`);
      }
      console.log();
    }
  }
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
