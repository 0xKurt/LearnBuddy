// Sharp diagram pipeline. Slice D1.5 — Doc 06 §image-processing.
//
// The vision call returns a `diagrams[]` array with normalized bboxes and
// per-label connector/target coordinates. For each diagram we:
//
//   1. Crop the source photo to the diagram's bounding_box using sharp.
//   2. (When safe) mask each label_text_box + connector_box with white rectangles.
//   3. Composite numbered red-bordered markers at each label.target_xy.
//   4. Encode as PNG and upload to `study-assets/{account_id}/{material_id}/{idx}.png`.
//   5. Insert a `study_assets` row (kind 'numbered_diagram' or 'cropped_graph').
//
// All inputs are normalized (0..1) in the page's coordinate system. The page's
// real dimensions come from sharp.metadata() on the source bytes; we project
// the bbox into pixels there. Output PNG resolution = crop pixel resolution
// (no upscaling). Markers are sized relative to crop dimensions, capped so they
// stay legible on small crops without overwhelming large ones.
//
// Mask safety (Doc 06 §image-processing §mask-safety):
//   - If sum(label_text_box + connector_box areas) / crop area > 0.08, skip
//     masking for that diagram. Markers still placed.
//   - If any label_text_box has zero/invalid dimensions, skip masking.
//   - Record fallback='no_masking' in metadata for account-holder review.
//
// Failure handling: any sharp/upload/DB error for a given diagram is logged
// and the diagram is omitted from the returned id map. Items that referenced
// the dropped diagram lose their study_asset_id and get downgraded in the
// caller (postProcess). This keeps "one bad diagram doesn't fail the material".

import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import type { VisionDiagram } from './gateway.js';

const STUDY_ASSETS_BUCKET = 'study-assets';

/** A single source page the LLM was given, in the same order as the LLM saw. */
export type SourcePage = {
  mimeType: 'image/jpeg' | 'image/png';
  /** Raw bytes (decoded from the base64 we passed to Vertex). */
  bytes: Buffer;
};

export type DiagramCropInput = {
  account_id: string;
  material_id: string;
  learner_id: string;
  pages: SourcePage[];
  diagrams: VisionDiagram[];
  supabase: Pick<SupabaseClient, 'storage' | 'from'>;
};

/** Mapping: diagram index in the input array → inserted study_assets.id.
 *  Diagrams that failed processing are absent from this map. */
export type DiagramAssetIds = Map<number, string>;

export type CropDiagramsOutcome = {
  ids: DiagramAssetIds;
  /** Per-diagram per-label success — caller drops label items whose marker
   *  was dropped (e.g. because target_xy fell outside the bounding box). */
  validLabelCount: Map<number, number>;
};

/** Process and upload all diagrams for a material. Returns the asset-id map.
 *  Never throws — per-diagram errors are logged. */
export async function cropDiagramsAndUpload(input: DiagramCropInput): Promise<CropDiagramsOutcome> {
  const ids: DiagramAssetIds = new Map();
  const validLabelCount: Map<number, number> = new Map();

  for (let i = 0; i < input.diagrams.length; i++) {
    const diagram = input.diagrams[i];
    if (!diagram) continue;
    const page = input.pages[diagram.page_index];
    if (!page) {
      console.warn(
        `[diagram] skip #${i}: page_index ${diagram.page_index} out of range (${input.pages.length} pages)`,
      );
      continue;
    }
    try {
      const result = await processOneDiagram({
        diagram,
        diagramIdx: i,
        page,
        accountId: input.account_id,
        materialId: input.material_id,
        learnerId: input.learner_id,
        supabase: input.supabase,
      });
      if (result) {
        ids.set(i, result.assetId);
        validLabelCount.set(i, result.validLabels);
      }
    } catch (err) {
      console.warn(
        `[diagram] skip #${i}: processing failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { ids, validLabelCount };
}

type ProcessOneInput = {
  diagram: VisionDiagram;
  diagramIdx: number;
  page: SourcePage;
  accountId: string;
  materialId: string;
  learnerId: string;
  supabase: Pick<SupabaseClient, 'storage' | 'from'>;
};

async function processOneDiagram(input: ProcessOneInput): Promise<{
  assetId: string;
  validLabels: number;
} | null> {
  const meta = await sharp(input.page.bytes).metadata();
  const pageW = meta.width;
  const pageH = meta.height;
  if (!pageW || !pageH) {
    console.warn(`[diagram] skip #${input.diagramIdx}: source image missing dimensions`);
    return null;
  }

  const [x0n, y0n, x1n, y1n] = input.diagram.bounding_box;
  const left = Math.max(0, Math.floor(Math.min(x0n, x1n) * pageW));
  const top = Math.max(0, Math.floor(Math.min(y0n, y1n) * pageH));
  const right = Math.min(pageW, Math.ceil(Math.max(x0n, x1n) * pageW));
  const bottom = Math.min(pageH, Math.ceil(Math.max(y0n, y1n) * pageH));
  const cropW = right - left;
  const cropH = bottom - top;
  if (cropW < 16 || cropH < 16) {
    console.warn(`[diagram] skip #${input.diagramIdx}: degenerate bbox (${cropW}x${cropH})`);
    return null;
  }

  // Step 1: crop.
  let pipeline = sharp(input.page.bytes).extract({
    left,
    top,
    width: cropW,
    height: cropH,
  });

  // Step 2 (optional): mask labels + connectors with white rectangles.
  // Graphs (graph_meta present) skip masking — axis labels must stay visible.
  const isGraph = input.diagram.graph_meta != null;
  const maskAreaRatio = computeMaskAreaRatio(input.diagram, cropW, cropH, pageW, pageH);
  const shouldMask =
    !isGraph &&
    maskAreaRatio > 0 &&
    maskAreaRatio <= 0.08 &&
    input.diagram.labels.every((l) => labelBoxValid(l.label_text_box));
  let fallback: 'no_masking' | null = null;
  if (!shouldMask) fallback = 'no_masking';

  const overlays: sharp.OverlayOptions[] = [];
  if (shouldMask) {
    const maskSvg = buildMaskSvg(input.diagram, left, top, cropW, cropH, pageW, pageH);
    overlays.push({ input: Buffer.from(maskSvg), top: 0, left: 0 });
  }

  // Step 3: markers. Only place markers whose target_xy lies inside the bbox.
  const markerCoords: Array<{ index: number; cx: number; cy: number }> = [];
  input.diagram.labels.forEach((label, labelIdx) => {
    const [txn, tyn] = label.target_xy;
    const px = Math.round(txn * pageW) - left;
    const py = Math.round(tyn * pageH) - top;
    if (px < 0 || py < 0 || px > cropW || py > cropH) return; // out of crop
    markerCoords.push({ index: labelIdx + 1, cx: px, cy: py });
  });
  if (markerCoords.length === 0) {
    console.warn(`[diagram] skip #${input.diagramIdx}: no markers fell inside the bbox`);
    return null;
  }
  const markerRadius = Math.max(12, Math.min(22, Math.round(Math.min(cropW, cropH) / 28)));
  const markersSvg = buildMarkersSvg(markerCoords, cropW, cropH, markerRadius);
  overlays.push({ input: Buffer.from(markersSvg), top: 0, left: 0 });

  if (overlays.length > 0) pipeline = pipeline.composite(overlays);

  // Step 4: encode + upload.
  const png = await pipeline.png().toBuffer();
  const storagePath = `${input.accountId}/${input.materialId}/${input.diagramIdx}.png`;
  const upload = await input.supabase.storage.from(STUDY_ASSETS_BUCKET).upload(storagePath, png, {
    contentType: 'image/png',
    upsert: true,
  });
  if (upload.error) {
    console.warn(`[diagram] skip #${input.diagramIdx}: upload failed — ${upload.error.message}`);
    return null;
  }

  // Step 5: insert study_assets row.
  const kind: 'numbered_diagram' | 'cropped_graph' = isGraph ? 'cropped_graph' : 'numbered_diagram';
  const labelPositions = markerCoords.map((m) => ({
    index: m.index,
    x: cropW > 0 ? m.cx / cropW : 0,
    y: cropH > 0 ? m.cy / cropH : 0,
  }));
  const originalLabelText = input.diagram.labels.map((l) => l.text);
  const metadata: Record<string, unknown> = {
    label_positions: labelPositions,
    original_label_text: originalLabelText,
    fallback,
  };
  if (isGraph && input.diagram.graph_meta) metadata.graph_meta = input.diagram.graph_meta;

  const inserted = await input.supabase
    .from('study_assets')
    .insert({
      material_id: input.materialId,
      learner_id: input.learnerId,
      kind,
      storage_path: `${STUDY_ASSETS_BUCKET}/${storagePath}`,
      source_page_index: input.diagram.page_index,
      title: input.diagram.title ?? null,
      width: cropW,
      height: cropH,
      metadata,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    console.warn(
      `[diagram] skip #${input.diagramIdx}: study_assets insert failed — ${inserted.error?.message ?? 'no data'}`,
    );
    return null;
  }
  const assetId = (inserted.data as { id: string }).id;
  return { assetId, validLabels: markerCoords.length };
}

function labelBoxValid(box: [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = box;
  return (
    Number.isFinite(x0) &&
    Number.isFinite(y0) &&
    Number.isFinite(x1) &&
    Number.isFinite(y1) &&
    x1 > x0 &&
    y1 > y0
  );
}

function computeMaskAreaRatio(
  diagram: VisionDiagram,
  cropW: number,
  cropH: number,
  pageW: number,
  pageH: number,
): number {
  if (cropW <= 0 || cropH <= 0) return 0;
  const cropArea = cropW * cropH;
  let masked = 0;
  for (const label of diagram.labels) {
    masked += pixelArea(label.label_text_box, pageW, pageH);
    masked += pixelArea(label.connector_box, pageW, pageH);
  }
  return masked / cropArea;
}

function pixelArea(box: [number, number, number, number], pageW: number, pageH: number): number {
  const [x0, y0, x1, y1] = box;
  const w = Math.max(0, (x1 - x0) * pageW);
  const h = Math.max(0, (y1 - y0) * pageH);
  return w * h;
}

function buildMaskSvg(
  diagram: VisionDiagram,
  cropLeft: number,
  cropTop: number,
  cropW: number,
  cropH: number,
  pageW: number,
  pageH: number,
): string {
  const rects: string[] = [];
  for (const label of diagram.labels) {
    for (const box of [label.label_text_box, label.connector_box]) {
      const [x0, y0, x1, y1] = box;
      const left = Math.round(Math.min(x0, x1) * pageW) - cropLeft;
      const top = Math.round(Math.min(y0, y1) * pageH) - cropTop;
      const w = Math.round((Math.max(x0, x1) - Math.min(x0, x1)) * pageW);
      const h = Math.round((Math.max(y0, y1) - Math.min(y0, y1)) * pageH);
      if (w <= 0 || h <= 0) continue;
      rects.push(`<rect x="${left}" y="${top}" width="${w}" height="${h}" fill="white" />`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">${rects.join('')}</svg>`;
}

function buildMarkersSvg(
  markers: Array<{ index: number; cx: number; cy: number }>,
  cropW: number,
  cropH: number,
  radius: number,
): string {
  const fontSize = Math.round(radius * 1.1);
  const circles = markers
    .map(
      (m) =>
        `<g>
          <circle cx="${m.cx}" cy="${m.cy}" r="${radius}" fill="white" stroke="#B91C1C" stroke-width="3" />
          <text x="${m.cx}" y="${m.cy + Math.round(fontSize / 3)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#B91C1C" text-anchor="middle">${m.index}</text>
        </g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">${circles}</svg>`;
}
