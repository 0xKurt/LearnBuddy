// Concept images (issue #50): REAL crops from the photographed pages — never a
// generated picture. docs/architecture.md §Material.
//
// After a sheet became ready, one vision pass (purpose 'figures') looks at the
// page photos and the questions that were read from them, and returns one tight
// box per WHOLE teaching figure (a labelled diagram, a reference chart kept
// whole) — omitting comics, scenes and pure text. sharp crops those real pixels
// and lightly cleans them (contrast, no hard binarize), the crop is stored next
// to the photos and attached to the questions it helps answer.
// A real crop can never be "wrong" or "invented"; the only failure mode is a
// slightly loose frame, never a fabricated shape.
//
// The clean-up has two paths (issue #223 point 1). A line drawing is greyscaled
// so it reads like a scan; a figure whose COLOURS are part of what it shows — a
// map, an indicator, a colour wheel, a stained specimen, a chart with a colour
// key — keeps them, because greyscale made "welche Farbe zeigt der Indikator?"
// unanswerable. The reading reports one validated fact per figure; `enhance`
// is the only thing that decides what happens to the pixels (see there).
//
// Images are a bonus: the sheet is `ready` before this runs, and nothing here —
// a vision pass that finds nothing, a Storage outage, an exhausted budget —
// ever fails the reading. Everything is caught and logged.
//
// Retention: crops are derived learning content like `extracted_text` — they
// live until the material (or the question) is deleted, NOT 7 days like the raw
// photos (docs/privacy.md §What is stored; modules/materials/purge.ts erases
// them from Storage with the content).

import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import type { LlmPart } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { itemsOneByOne } from '../practice/items.js';

// v2 (issue #223 point 1): one field more per figure — whether its colours carry meaning.
export const FIGURES_PROMPT_VERSION = 'figures-v2';
/** At most this many crops per sheet (pages added later fill up to it, never past it). */
export const MAX_IMAGES_PER_MATERIAL = 6;
/** Generous symmetric padding so a tight model box never clips the figure. */
const FIGURE_PAD = 0.012;
/** A crop smaller than this on either side is noise, not a figure. */
const MIN_CROP_PX = 16;

// Categories + bans, never example sentences (project rule).
export const FIGURES_SYSTEM = `You look at scanned worksheet page image(s) and the list of questions extracted from them. Your job: find the VISUAL TEACHING FIGURES on the pages that a learner should see beside a question, and return ONE tight bounding box per WHOLE figure. The REAL cropped image is shown — never a redraw — so each box must be clean and faithful.

A FIGURE worth returning is a self-contained teaching visual:
- a labelled diagram (a clock face, a cross-section, a plant, a map, a plotted graph, a geometric figure)
- a reference chart / legend / overview that presents SEVERAL little labelled examples together: return the WHOLE chart as ONE figure — do NOT split it into individual cells
- a single picture that a specific question explicitly points at

OMIT entirely — return NOTHING for these, not as a figure, not at all:
- comic panels, comic strips, story or scene illustrations, decorative drawings, full-page layouts
- pure text: the page title, instruction paragraphs, answer keys, word / vocabulary lists
- anything you are not confident is a clean, self-contained teaching figure (when unsure, OMIT)

For each figure return:
- page_index: 0-based index of the attached page image it is on
- box: [x0,y0,x1,y1] normalised 0..1. Hug the figure TIGHTLY: include the figure and the labels that belong to it, but EXCLUDE the page title, instruction paragraphs, answer-key boxes, page margins, hole-punch strips, and any neighbouring drawing that is not part of this figure.
- label: a short name of what it shows, in the learner's language
- item_indices: indices (from the QUESTIONS list) this figure helps answer
- colour_carries_meaning: whether this figure would LOSE information in black and white. true when the colours are part of what it shows: areas or categories told apart by colour (a map, a chart or diagram with a colour key, a wiring or circuit colour code), a colour that is the thing itself (an indicator, a litmus or pH strip, a flame colour, a colour wheel or colour mixing chart, a stained specimen, a mineral or leaf identified by colour), a painting, an artwork or a photograph whose colours are the subject. false when colour is only decoration or print colour and the figure reads exactly the same in black and white: line drawings, labelled diagrams, tables, number lines, geometric figures, plotted graphs whose curves are labelled rather than colour-coded, handwriting on paper. Decide it for THIS figure, not for the page. If any question beside it could turn on a colour, answer true.

Be conservative: only clean teaching figures genuinely worth showing. Return ONLY the JSON object.`;

const FigureBox = z.object({
  page_index: z.number().int().min(0).max(19),
  box: z.array(z.number().min(0).max(1)).min(4).max(4),
  label: z.string().trim().min(1).max(120),
  item_indices: z.array(z.number().int().min(0).max(499)).min(1).max(60),
  /**
   * Whether this figure would lose information in black and white (issue #223 point 1). A
   * FACT about the picture, nothing more: the reading is the only thing that can see whether
   * the colours mean anything, and `enhance` is the only thing that decides what happens to
   * the pixels because of it (CLAUDE.md rule 1 — the model names a box, code does the
   * cropping; the model names this, code picks the clean-up).
   *
   * The two mistakes are not worth the same, so the prompt is told to lean one way: a
   * coloured figure greyed by mistake is the bug this exists to end (the question about the
   * colour has no answer left), while a plain drawing kept in colour is a slightly less
   * crisp scan. Hence "if any question beside it could turn on a colour, answer true".
   *
   * A MISSING field is not that lean — it is no fact at all, and it is a broken answer
   * rather than a judgement about the picture. It falls back to the greyscale clean-up this
   * file had before: the figure is still worth showing, and it gets exactly the treatment it
   * would have got anyway. Defaulting the other way would silently stop cleaning up EVERY
   * sheet the moment the model dropped one field.
   */
  colour_carries_meaning: z.boolean().default(false).catch(false),
});
/**
 * The schema the model is asked for (real bounds as hints, json-schema.ts). The colour fact
 * is REQUIRED here and lenient in `FigureBox`: every figure must answer it, and a figure whose
 * answer is missing anyway is still worth showing (a `.default()` would make it optional in
 * the asked-for schema, json-schema.ts, which is the one thing it must not be).
 */
const FiguresResult = z.object({
  assets: z
    .array(
      FigureBox.extend({
        colour_carries_meaning: z
          .boolean()
          .describe('Would this figure lose information in black and white?'),
      }),
    )
    .max(MAX_IMAGES_PER_MATERIAL * 2),
});
const FIGURES_SCHEMA = toJsonSchema(FiguresResult);
/** Read tolerantly: a broken figure entry is dropped, never the whole list. */
const FiguresParse = z
  .object({ assets: itemsOneByOne(FigureBox, MAX_IMAGES_PER_MATERIAL * 2) })
  .catch({ assets: [] });

export type ConceptImagesInput = {
  /** The material whose photos were just read (a merged part crops its own pages). */
  materialId: string;
  /** The sheet the questions live on (the merge target, else the material itself). */
  sheetId: string;
  learnerId: string;
  locale: string;
  timezone: string;
};

/**
 * The whole pass, called after `runExtraction` made the sheet ready. Never throws:
 * a failure of the model, of sharp or of Storage leaves the sheet ready without
 * images and is only logged (rule 5: the material's status never claims more or
 * less than what happened to the questions themselves).
 */
export async function attachConceptImages(deps: Deps, input: ConceptImagesInput): Promise<void> {
  try {
    await attach(deps, input);
  } catch (err) {
    console.warn(
      `[figures] material=${input.materialId} skipped — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function attach(deps: Deps, input: ConceptImagesInput): Promise<void> {
  if (!deps.llm.available) return;
  const sheet = await deps.db.maybeOne<{ archived_at: Date | null; account_id: string }>(
    `select m.archived_at, l.account_id from materials m join learners l on l.id = m.learner_id
      where m.id = $1 and m.learner_id = $2`,
    [input.sheetId, input.learnerId],
  );
  if (!sheet || sheet.archived_at) return;
  const existing = await deps.db.one<{ n: number }>(
    `select count(*)::int as n from material_images where material_id = $1`,
    [input.sheetId],
  );
  const cap = MAX_IMAGES_PER_MATERIAL - existing.n;
  if (cap <= 0) return;
  const items = await deps.db.query<{ id: string; prompt: string }>(
    `select id, prompt from items
      where material_id = $1 and learner_id = $2 and archived_at is null
      order by seq limit 200`,
    [input.sheetId, input.learnerId],
  );
  if (items.length === 0) return;
  // Only photographed pages: a PDF page cannot be cropped by sharp (no rendering
  // happens anywhere, §Material PDFs), so PDFs simply get no concept images.
  const photos = await deps.db.query<{ storage_path: string; mime: 'image/jpeg' | 'image/png' }>(
    `select storage_path, mime from material_photos
      where material_id = $1 and mime in ('image/jpeg','image/png') order by position`,
    [input.materialId],
  );
  if (photos.length === 0) return;
  const pages: Array<{ mime: 'image/jpeg' | 'image/png'; bytes: Buffer }> = [];
  for (const p of photos) {
    // An absent photo (already purged) or a Storage outage: no images this time.
    const bytes = await deps.storage.download(p.storage_path);
    if (!bytes) return;
    pages.push({ mime: p.mime, bytes: Buffer.from(bytes) });
  }

  const questionList = items
    .map((it, index) => `  [${index}] ${it.prompt.slice(0, 160)}`)
    .join('\n');
  const parts: LlmPart[] = [
    {
      text: `Locale: ${input.locale}

QUESTIONS (index in brackets — use these in item_indices):
${questionList}

Look at the attached page images and return the JSON object defined in your instructions.`,
    },
  ];
  for (const [i, page] of pages.entries()) {
    parts.push({ text: `Page image with page_index ${i}:` });
    parts.push({ inlineData: { mimeType: page.mime, data: page.bytes.toString('base64') } });
  }

  const res = await callModel(deps, input.learnerId, localParts(deps.now(), input.timezone).date, {
    purpose: 'figures',
    tier: 'smart',
    promptVersion: FIGURES_PROMPT_VERSION,
    system: FIGURES_SYSTEM,
    contents: [{ role: 'user', parts }],
    schema: FIGURES_SCHEMA,
    maxOutputTokens: 2_000,
    temperature: 0.2,
    timeoutMs: 60_000,
    thinkingBudget: 1024,
  });
  const found = FiguresParse.parse(res.json).assets.filter(
    (a) => a.page_index < pages.length && a.item_indices.some((i) => i < items.length),
  );

  let kept = 0;
  let inColour = 0;
  for (const asset of found) {
    if (kept >= cap) break;
    const png = await cropAndEnhance(
      pages[asset.page_index]!.bytes,
      asset.box,
      asset.colour_carries_meaning,
    );
    if (!png) continue;
    const attached = await storeAndAttach(deps, input, sheet.account_id, asset, png, items);
    if (!attached) continue;
    kept++;
    if (asset.colour_carries_meaning) inColour++;
  }
  console.log(
    `[figures] material=${input.materialId} found=${found.length} kept=${kept} colour=${inColour}`,
  );
}

/**
 * Upload one crop and attach it to its questions. The insert is fenced on the sheet
 * still being alive: deleted while the pass ran, the object is removed again and no
 * row is written (the content purge erases rows that were written before the delete).
 */
async function storeAndAttach(
  deps: Deps,
  input: ConceptImagesInput,
  accountId: string,
  asset: z.infer<typeof FigureBox>,
  png: Buffer,
  items: Array<{ id: string }>,
): Promise<boolean> {
  const meta = await sharp(png).metadata();
  const storagePath = `${accountId}/${input.sheetId}/figure-${randomUUID()}.png`;
  try {
    await deps.storage.upload(storagePath, png, 'image/png');
  } catch (err) {
    console.warn(
      `[figures] material=${input.materialId} upload failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
  const itemIds = [...new Set(asset.item_indices.filter((i) => i < items.length))].map(
    (i) => items[i]!.id,
  );
  const attached = await deps.db.tx(async (tx) => {
    const row = await tx.maybeOne<{ id: string }>(
      `insert into material_images (material_id, learner_id, storage_path, label, width, height, created_at)
       select $1, $2, $3, $4, $5, $6, $7
        where exists (select 1 from materials where id = $1 and archived_at is null)
       returning id`,
      [
        input.sheetId,
        input.learnerId,
        storagePath,
        asset.label.slice(0, 160),
        meta.width ?? 0,
        meta.height ?? 0,
        deps.now(),
      ],
    );
    if (!row) return false;
    // The first figure a question got stays (a chart and a diagram may both name it).
    await tx.query(
      `update items set image_id = $1
        where id = any($2::uuid[]) and learner_id = $3 and image_id is null and archived_at is null`,
      [row.id, itemIds, input.learnerId],
    );
    return true;
  });
  if (!attached) {
    // The sheet was deleted while the pass ran: the crop goes with it, right away.
    await deps.storage.remove([storagePath]).catch(() => undefined);
    return false;
  }
  return true;
}

// ── crop + enhance (ported from the parked wip/concept-images pipeline) ──────

type Box = [number, number, number, number];

async function cropAndEnhance(
  pageBytes: Buffer,
  box: number[],
  keepColour: boolean,
): Promise<Buffer | null> {
  const b: Box = [box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0];
  const crop = await cropToPng(pageBytes, b, FIGURE_PAD);
  if (!crop) return null;
  return enhance(await trimBackground(crop), keepColour);
}

async function cropToPng(pageBytes: Buffer, box: Box, pad: number): Promise<Buffer | null> {
  const b: Box = [
    Math.max(0, Math.min(box[0], box[2]) - pad),
    Math.max(0, Math.min(box[1], box[3]) - pad),
    Math.min(1, Math.max(box[0], box[2]) + pad),
    Math.min(1, Math.max(box[1], box[3]) + pad),
  ];
  try {
    const meta = await sharp(pageBytes).metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) return null;
    const left = Math.max(0, Math.floor(b[0] * W));
    const top = Math.max(0, Math.floor(b[1] * H));
    const width = Math.min(W - left, Math.ceil((b[2] - b[0]) * W));
    const height = Math.min(H - top, Math.ceil((b[3] - b[1]) * H));
    if (width < MIN_CROP_PX || height < MIN_CROP_PX) return null;
    return await sharp(pageBytes).extract({ left, top, width, height }).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Trim a uniform background border (desk / shadow / margin around a photographed
 * page) with sharp's border trim. Bounded: if the trim would eat more than half
 * the area (a low-contrast scan), keep the untrimmed crop. Never throws.
 */
async function trimBackground(buf: Buffer): Promise<Buffer> {
  try {
    const before = await sharp(buf).metadata();
    const trimmed = await sharp(buf).trim({ threshold: 24 }).png().toBuffer();
    const after = await sharp(trimmed).metadata();
    const areaBefore = (before.width ?? 0) * (before.height ?? 0);
    const areaAfter = (after.width ?? 0) * (after.height ?? 0);
    if (
      areaAfter < areaBefore * 0.5 ||
      (after.width ?? 0) < MIN_CROP_PX ||
      (after.height ?? 0) < MIN_CROP_PX
    ) {
      return buf;
    }
    return trimmed;
  } catch {
    return buf;
  }
}

/**
 * Non-destructive clean-up, in two paths. Which one a crop gets is decided HERE, from the one
 * validated fact the reading reported about that figure (`colour_carries_meaning`): the model
 * never names a filter, a parameter or an order — exactly as it names a box and this file does
 * the cropping (CLAUDE.md rule 1).
 *
 * Greyscale (the default, every line drawing): greyscale, stretch contrast, lift the paper
 * toward white WITHOUT a hard binarize (which would shred faint or dashed strokes). Keeps the
 * real drawing; just makes it read like a clean scan.
 *
 * Colour (issue #223 point 1): where the colour IS the content — a map, an indicator, a colour
 * wheel, a stained specimen, a chart with a colour key — the same clean-up minus the two steps
 * that destroy it. Which two was measured on real crops before this was written:
 *   · `.greyscale()` is the loss the issue names: five pastel fields of one sheet all came back
 *     as 255,255,255, and a blue, a green and a red area of a map came back as 128, 155 and 137
 *     — "welche Farbe zeigt der Indikator?" has no answer left in either.
 *   · `.linear(1.22, -26)` lifts the paper toward white, and on a colour crop it does the same
 *     damage one layer up: it pushed those five pastels to 255,254,255 / 255,255,255 … while
 *     still writing three channels. Pale indicator colours are exactly what it wipes out.
 * What is left is the contrast a colour crop can take. `median` and `sharpen` leave a flat colour
 * patch byte for byte as it was; `normalise` stretches each band's range, which moves a pastel by
 * a few points and takes the paper's warm cast with it — measured, the five pastels stayed clearly
 * apart and a map's blue, green and red came back unchanged on a page that has real black ink on
 * it (and such a page is what a photographed worksheet is).
 */
async function enhance(buf: Buffer, keepColour: boolean): Promise<Buffer> {
  const toned = keepColour
    ? sharp(buf).normalise()
    : sharp(buf).greyscale().normalise().linear(1.22, -26);
  return toned
    .median(1)
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer()
    .catch(() => buf);
}
