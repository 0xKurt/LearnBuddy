// The extraction work itself, lifted out of the POST /materials HTTP handler
// so it can run from a durable job (worker / drain / retry / cron) instead of
// inside a connection the client must hold open. Doc 06 §P1, ADR 0003.
//
// Self-contained: it loads subject + grade itself (a worker has no request
// context), downloads the already-uploaded photos, runs vision + diagrams,
// persists items, marks the material ready, and settles credits. On ANY
// failure it refunds the pre-debit and marks the material failed — credits
// never leak on a dropped connection, which was the original bug.

import { refund, settle, type CreditEstimate } from './credits.js';
import type { getDeps } from './deps.js';
import { cropDiagramsAndUpload, type SourcePage } from './llm/diagram.js';
import type { GeneratedVisionItem, VisionInput, VisionResult } from './llm/gateway.js';
import { validateTemplate } from './llm/templateValidation.js';

export const VISION_ESTIMATE = 20; // Doc 08 §estimated-costs-per-action
const PHOTO_WIPE_DELAY_MS = 7 * 86_400_000; // Doc 09 §4 (raw photos T+7d)

type Supabase = ReturnType<typeof getDeps>['supabase'];
type Llm = ReturnType<typeof getDeps>['llm'];

export type ExtractionDeps = { supabase: Supabase; llm: Llm; now: () => Date };

export type ExtractionParams = {
  job_id: string;
  account_id: string;
  learner_id: string;
  material_id: string;
  subject_id: string;
  title: string | null;
  locale: string;
  /** One per uploaded photo; length drives the download count + page_count. */
  qualityScores: Array<{ position: number }>;
};

export type ExtractionResult =
  | {
      ok: true;
      items: unknown[];
      study_assets: string[];
      language: string;
      credits_used: number;
      swept?: true;
    }
  | { ok: false; code: string; message: string };

type DownloadedPhoto = {
  mimeType: 'image/jpeg' | 'image/png';
  data: string;
  bytes: Buffer;
};

async function downloadPhotos(
  supabase: Supabase,
  prefix: string,
  count: number,
): Promise<DownloadedPhoto[]> {
  const positions = Array.from({ length: count }, (_, i) => i + 1);
  const downloads = await Promise.all(
    positions.map(async (i): Promise<DownloadedPhoto | null> => {
      const dl = await supabase.storage.from('materials-raw').download(`${prefix}/${i}.jpg`);
      if (dl.error || !dl.data) return null;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      return { mimeType: 'image/jpeg', data: buf.toString('base64'), bytes: buf };
    }),
  );
  return downloads.filter((d): d is DownloadedPhoto => d !== null);
}

async function markFailed(
  supabase: Supabase,
  material_id: string,
  reason: string,
  now: () => Date,
): Promise<void> {
  // Schedule photo wipe 7 days out even on failure — DSGVO §4 mandates the
  // retention window is enforced regardless of extraction outcome. Without
  // this, failed/abandoned materials leave raw photos in storage forever.
  const wipeAt = new Date(now().getTime() + PHOTO_WIPE_DELAY_MS).toISOString();
  const upd = await supabase
    .from('materials')
    .update({
      extraction_status: 'failed',
      extraction_error: reason,
      scheduled_photo_deletion_at: wipeAt,
    })
    .eq('id', material_id);
  if (upd.error) {
    console.error(
      `[extraction] markFailed(${material_id}, ${reason}): ${upd.error.message} — material may be stranded`,
    );
  }
}

function toItemRow(
  it: GeneratedVisionItem,
  material_id: string,
  learner_id: string,
  usage: { model: string; prompt_version: string },
): Record<string, unknown> {
  const studyAssetIdFromStimulus =
    typeof it.stimulus_data?.study_asset_id === 'string'
      ? (it.stimulus_data.study_asset_id as string)
      : null;
  return {
    material_id,
    learner_id,
    question: it.question,
    expected_answer: it.expected_answer,
    acceptable_answers: it.acceptable_answers ?? [],
    answer_kind: it.answer_kind,
    mc_options: it.mc_options ?? null,
    mc_correct_index: it.mc_correct_index ?? null,
    units: it.units ?? null,
    latex_expected: it.latex_expected ?? null,
    latex_acceptable: it.latex_acceptable ?? [],
    fill_blank_template: it.fill_blank_template ?? null,
    fill_blank_answers: it.fill_blank_answers ?? [],
    study_asset_id: studyAssetIdFromStimulus,
    diagram_label_index:
      it.answer_kind === 'diagram_label' && it.diagram_ref ? it.diagram_ref.label_index : null,
    stimulus_kind: it.stimulus_kind ?? 'none',
    stimulus_data: it.stimulus_data ?? {},
    difficulty: it.difficulty,
    topic: it.topic ?? null,
    language: it.language,
    source_excerpt: it.source_excerpt ?? null,
    generated_by_model: usage.model,
    generated_by_prompt_version: usage.prompt_version,
  };
}

/** Run extraction for an already-enqueued material. Pure of HTTP/SSE: the
 *  caller (worker/drain/cron) owns job-state transitions; this owns the
 *  material row + credits. The pre-debit `debit` must already have happened. */
export async function runExtraction(
  d: ExtractionDeps,
  p: ExtractionParams,
): Promise<ExtractionResult> {
  const { supabase, llm, now } = d;
  const debit: CreditEstimate = {
    estimate: VISION_ESTIMATE,
    reason: 'materials_create',
    learner_id: p.learner_id,
    reference_id: p.material_id,
  };
  const bail = async (code: string, message: string): Promise<ExtractionResult> => {
    await refund(supabase, p.account_id, debit);
    await markFailed(supabase, p.material_id, message, now);
    return { ok: false, code, message };
  };

  const subjRow = await supabase
    .from('subjects')
    .select('name, subject_kind')
    .eq('id', p.subject_id)
    .maybeSingle();
  if (subjRow.error || !subjRow.data) return bail('not_found', 'subject_not_found');
  const subject = subjRow.data as { name: string; subject_kind: VisionInput['subjectKind'] };

  const learnerRow = await supabase
    .from('learners')
    .select('grade_level')
    .eq('id', p.learner_id)
    .maybeSingle();
  const gradeLevel = (learnerRow.data as { grade_level: number | null } | null)?.grade_level ?? 7;

  const photos = await downloadPhotos(
    supabase,
    `${p.account_id}/${p.material_id}`,
    p.qualityScores.length,
  );
  if (photos.length === 0) return bail('extraction_failed', 'photos_not_retrievable');

  let vision: VisionResult;
  try {
    vision = await llm.visionExtractAndGenerate({
      images: photos.map(({ mimeType, data }) => ({ mimeType, data })),
      locale: p.locale as VisionInput['locale'],
      gradeLevel,
      subject: subject.name,
      subjectKind: subject.subject_kind,
    });
  } catch (err) {
    return bail('extraction_failed', err instanceof Error ? err.message : 'vision_failed');
  }

  if (vision.error === 'not_educational') return bail('not_educational', 'not_educational');
  if (vision.items.length < 3) return bail('extraction_failed', 'too_few_items');

  const pages: SourcePage[] = photos.map((ph) => ({ mimeType: ph.mimeType, bytes: ph.bytes }));
  const diagramOutcome =
    vision.diagrams.length > 0
      ? await cropDiagramsAndUpload({
          account_id: p.account_id,
          material_id: p.material_id,
          learner_id: p.learner_id,
          pages,
          diagrams: vision.diagrams,
          supabase,
        })
      : { ids: new Map<number, string>(), validLabelCount: new Map<number, number>() };

  const resolvedItems = vision.items.flatMap((it): GeneratedVisionItem[] => {
    const diagramIdx = it.diagram_ref?.diagram_index;
    const labelIdx = it.diagram_ref?.label_index;
    const needsAsset = it.stimulus_kind === 'study_asset' || it.answer_kind === 'diagram_label';
    if (!needsAsset) return [it];
    if (diagramIdx == null) return [];
    const assetId = diagramOutcome.ids.get(diagramIdx);
    if (!assetId) return [];
    if (it.answer_kind === 'diagram_label') {
      const validLabels = diagramOutcome.validLabelCount.get(diagramIdx) ?? 0;
      if (labelIdx == null || labelIdx < 0 || labelIdx >= validLabels) return [];
    }
    return [
      {
        ...it,
        stimulus_kind: 'study_asset',
        stimulus_data: { ...(it.stimulus_data ?? {}), study_asset_id: assetId },
      },
    ];
  });
  if (resolvedItems.length < 3) return bail('extraction_failed', 'too_few_items');
  vision.items = resolvedItems;

  const validTemplates = vision.problem_templates
    .map((t) => validateTemplate(t))
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (validTemplates.length > 0) {
    const ins = await supabase.from('problem_templates').insert(
      validTemplates.map((t) => ({
        material_id: p.material_id,
        learner_id: p.learner_id,
        source_item_id: null,
        subject_kind: subject.subject_kind,
        topic: t.topic,
        template_text: t.template_text,
        params: t.params,
        constraints: t.constraints,
        text_substitutions: [],
        solution_expression: t.solution_expression,
        answer_kind: t.answer_kind,
        units: t.units ?? null,
        stimulus_template: t.stimulus_template ?? null,
        difficulty: t.difficulty,
      })),
    );
    if (ins.error) console.warn(`[extraction] template insert failed: ${ins.error.message}`);
  }

  const itemRows = vision.items.map((it) =>
    toItemRow(it, p.material_id, p.learner_id, vision.usage),
  );
  const itemsIns = await supabase.from('items').insert(itemRows).select('*');
  if (itemsIns.error) return bail('internal', 'items_persist_failed');
  const persistedItems = (itemsIns.data ?? []) as unknown[];

  const updatedAt = now();
  const wipeAt = new Date(updatedAt.getTime() + PHOTO_WIPE_DELAY_MS).toISOString();

  // Atomic commit: flip the job running→done before touching credits. If the
  // sweep fired while Vertex was working, the job is already 'failed' and this
  // update returns 0 rows. We still mark the material ready (user has items)
  // but we SKIP settle — the sweep already refunded the pre-debit, so settling
  // on top would hand the user (estimate − actual) credits for free.
  const commit = await supabase
    .from('extraction_jobs')
    .update({
      status: 'done',
      finished_at: updatedAt.toISOString(),
      updated_at: updatedAt.toISOString(),
    })
    .eq('id', p.job_id)
    .eq('status', 'running')
    .select('id');
  const swept = ((commit.data as Array<{ id: string }> | null) ?? []).length === 0;
  if (swept) {
    console.warn(
      `[extraction] sweep raced job ${p.job_id} — marking material ready without settle`,
    );
  }

  const ready = await supabase
    .from('materials')
    .update({
      extraction_status: 'ready',
      page_count: p.qualityScores.length,
      detected_language: vision.detected_language ?? p.locale,
      extracted_markdown: vision.extracted_markdown,
      title: p.title,
      scheduled_photo_deletion_at: wipeAt,
      extraction_model: vision.usage.model,
      extraction_prompt_version: vision.usage.prompt_version,
      extraction_error: null,
    })
    .eq('id', p.material_id);
  if (ready.error) return bail('internal', 'finalize_failed');

  const actualCredits = Math.max(1, Math.round(vision.usage.cost_usd_micros / 100));
  if (!swept) {
    await settle(supabase, p.account_id, debit, actualCredits, vision.usage);
  }

  return {
    ok: true,
    items: persistedItems,
    study_assets: Array.from(diagramOutcome.ids.values()),
    language: vision.detected_language ?? p.locale,
    credits_used: actualCredits,
    ...(swept ? { swept: true as const } : {}),
  };
}
