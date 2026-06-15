// Re-run the new Vision prompt against an existing material's photos.
// Doesn't write back to the DB — just prints what the new prompt
// would produce. Lets us A/B compare prompt versions on real input.
//
// Run: pnpm -F @learnbuddy/api probe:rescan <material_id> [<material_id> ...]
// Run: pnpm -F @learnbuddy/api probe:rescan latest [N]

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { VertexLlmGateway } from '../src/lib/llm/vertex.js';
import { createServiceClient } from '../src/lib/supabase.js';
import { Env } from '../src/lib/env.js';

async function fetchPhotosForMaterial(
  supabase: ReturnType<typeof createServiceClient>,
  materialId: string,
) {
  const photos = await supabase
    .from('material_photos')
    .select('position, storage_path')
    .eq('material_id', materialId)
    .order('position', { ascending: true });
  if (photos.error) throw new Error(`photos: ${photos.error.message}`);
  const out: Array<{ mimeType: string; data: string }> = [];
  for (const p of (photos.data ?? []) as Array<{ position: number; storage_path: string }>) {
    const path = p.storage_path.startsWith('materials-raw/')
      ? p.storage_path.slice('materials-raw/'.length)
      : p.storage_path;
    const dl = await supabase.storage.from('materials-raw').download(path);
    if (dl.error || !dl.data)
      throw new Error(`download p${p.position}: ${dl.error?.message ?? 'no data'}`);
    const buf = Buffer.from(await dl.data.arrayBuffer());
    out.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
  }
  return out;
}

async function fetchMeta(supabase: ReturnType<typeof createServiceClient>, materialId: string) {
  const m = await supabase
    .from('materials')
    .select('id, title, subject_id, learner_id, created_at')
    .eq('id', materialId)
    .maybeSingle();
  if (m.error || !m.data) throw new Error(`material not found: ${materialId}`);
  const mat = m.data as {
    id: string;
    title: string | null;
    subject_id: string;
    learner_id: string;
  };
  const s = await supabase
    .from('subjects')
    .select('id, name, subject_kind')
    .eq('id', mat.subject_id)
    .maybeSingle();
  const subj = (s.data ?? null) as { name: string; subject_kind: string } | null;
  const l = await supabase
    .from('learners')
    .select('grade_level, ui_locale')
    .eq('id', mat.learner_id)
    .maybeSingle();
  const lr = (l.data ?? null) as { grade_level: number | null; ui_locale: string | null } | null;
  return {
    material_id: mat.id,
    title: mat.title,
    subject: subj?.name ?? '?',
    subject_kind: subj?.subject_kind ?? 'general',
    grade: lr?.grade_level ?? 7,
    locale: lr?.ui_locale ?? 'de',
  };
}

async function listLatestMaterials(
  supabase: ReturnType<typeof createServiceClient>,
  n: number,
): Promise<string[]> {
  const m = await supabase
    .from('materials')
    .select('id')
    .in('extraction_status', ['ready', 'failed'])
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(n);
  if (m.error) throw new Error(`list materials: ${m.error.message}`);
  return ((m.data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function rescan(
  id: string,
  gateway: VertexLlmGateway,
  supabase: ReturnType<typeof createServiceClient>,
) {
  const meta = await fetchMeta(supabase, id);
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`Material: ${meta.title ?? '(no title)'}`);
  console.log(
    `Subject:  ${meta.subject} (${meta.subject_kind}) · Grade ${meta.grade} · Locale ${meta.locale}`,
  );
  console.log(`ID:       ${meta.material_id}`);
  console.log('──────────────────────────────────────────────────────────────────────');

  const images = await fetchPhotosForMaterial(supabase, id);
  console.log(`Photos:   ${images.length}`);

  const t0 = Date.now();
  let result;
  try {
    result = await gateway.visionExtractAndGenerate({
      images,
      locale: meta.locale,
      gradeLevel: meta.grade,
      subject: meta.subject,
      subjectKind: meta.subject_kind as Parameters<
        VertexLlmGateway['visionExtractAndGenerate']
      >[0]['subjectKind'],
      targetCount: 12,
    });
  } catch (err) {
    console.log(`  ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const ms = Date.now() - t0;
  console.log(
    `Vertex:   ${ms}ms · tokens ${result.usage.input_tokens}→${result.usage.output_tokens} · err=${result.error ?? 'null'}`,
  );
  console.log(`Items:    ${result.items.length}`);

  // Distinct topics
  const topics = [...new Set(result.items.map((it) => it.topic).filter(Boolean))];
  console.log(`Topics:   ${topics.join(', ')}`);
  console.log();

  result.items.forEach((it, i) => {
    console.log(
      `[${String(i + 1).padStart(2, '0')}] ${it.answer_kind} · diff=${it.difficulty} · ${JSON.stringify(it.topic)}`,
    );
    console.log(`     Q: ${it.question}`);
    console.log(`     A: ${it.expected_answer}`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm probe:rescan <material_id> [...] | latest [N]');
    process.exit(2);
  }
  const env = Env.parse({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  const supabase = createServiceClient(env);
  const gateway = new VertexLlmGateway(env);

  let ids: string[];
  if (args[0] === 'latest') {
    const n = Number(args[1] ?? '5');
    ids = await listLatestMaterials(supabase, n);
  } else {
    ids = args;
  }
  console.log(`Rescanning ${ids.length} material(s) with prompt version live in this checkout\n`);
  for (const id of ids) await rescan(id, gateway, supabase);
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
