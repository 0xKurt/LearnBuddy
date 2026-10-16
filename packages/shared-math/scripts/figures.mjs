// Writes a picture of the library from a free vector file (issue #820): its image
// (apps/mobile/assets/figures/<id>.png) and its anchors (its block in src/schematicAnchors.data.ts).
// Only sources in the public domain or under CC0 (owner, #491: "Ich will kein Risiko"), each
// pinned by the hash of its file. docs/adr/0009-labelled-pictures-are-images.md §Amendment
// 2026-10-16.
//
// Where a part stands is measured, not placed by eye. Each part names the groups of the file it
// is drawn with; they are rendered alone in the picture's frame, and its anchor is the middle of
// the widest stretch of its own structure on one row (the row of its middle, or the share `row` of
// the way down). Only pixels the whole picture draws the same count, so no other structure lies
// on the anchor. A part drawn on both sides lists both (`sides`); the one on the side of its
// number's column is taken. The numbers stand in their column at the height of their anchor,
// moved apart where two would touch. A part gets a tap area only where the figure says so (the
// library's rule: one area covers the whole structure, ADR 0009 decision 5).
//
// The image keeps the frame of the one it replaces, the drawing centred in it. Its colours are the
// file's own: every picture is shown unchanged on the light paper card, in every look (ADR 0009,
// decision 1).
//
//   node packages/shared-math/scripts/figures.mjs <id> <svg>          write the image and anchors
//   node packages/shared-math/scripts/figures.mjs <id> <svg> --check  fail if the anchors are stale
//
// The rendering uses sharp (librsvg), a dependency of apps/api, resolved from there.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const sharp = createRequire(join(root, 'apps', 'api', 'package.json'))('sharp');

const ANCHORS_FILE = join(here, '..', 'src', 'schematicAnchors.data.ts');
/** The anchors' frame is 300 wide (`SCHEMATIC_IMAGE_WIDTH`); the numbers' columns stand at its edges. */
const FRAME_WIDTH = 300;
const COLUMNS = { left: 12, right: 288 };
/** Two numbers of one column stand at least this far apart (frame units), well past the 20 held. */
const BADGE_GAP = 26;
/** A tap area: a finger wide in the smallest room. */
const TAP = 56;

/**
 * The pictures made here. Per picture: its source (pinned by hash), the groups the whole picture
 * draws, the image's size in pixels, and its parts in the order of their names
 * (`schematics.data.ts`): the groups each is drawn with (`groups`, or `sides` for a structure
 * drawn twice), the groups its anchor is measured on (`measure`, default: all of them), its
 * number's column, and where to look (`half`, `row`).
 */
const FIGURES = {
  skeleton: {
    source: {
      file: 'https://commons.wikimedia.org/wiki/File:Human_skeleton_front_-_no_labels.svg',
      sha256: 'c8d5c3f208deac302ab3f7d70c0f499719c53de865f47df264d21f9e298cbc72',
      // Mikael Häggström: "I release this work into the public domain. This applies worldwide."
      licence: 'public domain',
    },
    // The skeleton layer: no labels, no background. Every bone group in it is a named layer
    // (`Skull`, `FemurLeft`, …); the ribs, the right femur and a few pieces are unnamed groups.
    whole: ['layer3'],
    // The frame of the image it replaces (300 × 420 in the anchors' frame).
    image: { width: 643, height: 900 },
    parts: [
      {
        id: 'spine',
        groups: ['CervicalVertebrae', 'ThoracicVertebrae', 'g801', 'LumbarVertebrae'],
        // Between the ribs only the lumbar spine stands free.
        measure: ['LumbarVertebrae'],
        column: 'right',
      },
      {
        id: 'pelvis',
        groups: ['PelvicGirdle', 'g447', 'Sacrum', 'Coccyx'],
        measure: ['PelvicGirdle'],
        column: 'left',
        half: 'left',
      },
      {
        id: 'ribcage',
        groups: ['g845', 'g1609'],
        measure: ['g845'],
        column: 'right',
        half: 'right',
      },
      { id: 'sternum', groups: ['Sternum', 'Manubrium'], column: 'right' },
      // On the forehead, not in the dark of the nose or the eyes; the one part with a tap area.
      {
        id: 'skull',
        groups: ['Skull'],
        measure: ['Cranium'],
        row: 0.25,
        column: 'right',
        tap: true,
      },
      { id: 'collarbone', sides: [['ClavicleLeft'], ['ClavicleRight']], column: 'left' },
      { id: 'humerus', sides: [['HumerusLeft'], ['HumerusRight']], column: 'left' },
      // The two forearm bones cross: lower down they stand apart.
      { id: 'radius', sides: [['RadiusLeft'], ['RadiusRight']], column: 'left', row: 0.75 },
      { id: 'ulna', sides: [['UlnaLeft'], ['UlnaRight']], column: 'left', row: 0.75 },
      { id: 'hand', sides: [['HandLeft'], ['HandRight']], column: 'left' },
      { id: 'femur', sides: [['FemurLeft'], ['g3760']], column: 'left' },
      { id: 'kneecap', sides: [['PatellaLeft'], ['PatellaRight']], column: 'left' },
      { id: 'tibia', sides: [['TibiaLeft'], ['TibiaRight']], column: 'left' },
      { id: 'fibula', sides: [['FibulaLeft'], ['FibulaRight']], column: 'left' },
      { id: 'foot', sides: [['FootLeft'], ['FootRight']], column: 'left' },
    ],
  },
};

const [id, svgPath, flag] = process.argv.slice(2);
const figure = FIGURES[id];
if (!figure || !svgPath)
  throw new Error(`usage: figures.mjs <${Object.keys(FIGURES).join('|')}> <svg> [--check]`);
const raw = readFileSync(svgPath);
const hash = createHash('sha256').update(raw).digest('hex');
if (hash !== figure.source.sha256)
  throw new Error(
    `${svgPath} is not the file the anchors were measured on (${figure.source.file})`,
  );
const source = figure.prepare ? figure.prepare(raw.toString('utf8')) : raw.toString('utf8');
for (const group of figure.parts.flatMap((p) => p.groups ?? p.sides.flat()))
  if (!source.includes(`id="${group}"`)) throw new Error(`the file has no group "${group}"`);

const IMAGE = figure.image;
const FRAME = {
  width: FRAME_WIDTH,
  height: Math.round((FRAME_WIDTH * IMAGE.height) / IMAGE.width),
};

/** The file with only the groups `ids` drawn. */
function only(ids) {
  const show = ids.map((g) => `#${g}, #${g} *`).join(', ');
  const css = `<style>* { visibility: hidden } ${show} { visibility: visible }</style>`;
  return source.replace(/<svg[^>]*>/, (open) => `${open}${css}`);
}

/** The groups `ids` rendered in the picture's frame, the drawing as large as fits, centred. */
async function render(ids) {
  const drawn = await sharp(Buffer.from(only(ids)), { density: 300 })
    .resize({ width: IMAGE.width, height: IMAGE.height, fit: 'inside' })
    .png()
    .toBuffer();
  const { width, height } = await sharp(drawn).metadata();
  const [dx, dy] = [(IMAGE.width - width) / 2, (IMAGE.height - height) / 2];
  return sharp(drawn)
    .extend({
      left: Math.floor(dx),
      right: Math.ceil(dx),
      top: Math.floor(dy),
      bottom: Math.ceil(dy),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha();
}
const pixels = async (image) => (await image.raw().toBuffer({ resolveWithObject: true })).data;

const whole = await render(figure.whole);
const all = await pixels(whole.clone());
const at = (x, y) => (y * IMAGE.width + x) * 4;
const same = (a, b, i) => [0, 1, 2, 3].every((c) => Math.abs(a[i + c] - b[i + c]) <= 8);

/**
 * Where the part's own structure shows (its pixels the whole picture draws the same), and its
 * anchor: the middle of the widest stretch of it on one row — the row of its middle, or the row
 * `row` of the way down what shows of it.
 */
async function measure(ids, { half, row } = {}) {
  const own = await pixels(await render(ids));
  const shown = [];
  for (let y = 0; y < IMAGE.height; y += 1)
    for (let x = 0; x < IMAGE.width; x += 1) {
      const i = at(x, y);
      if (own[i + 3] < 200 || !same(own, all, i)) continue;
      if (half === 'right' && x < IMAGE.width / 2) continue;
      if (half === 'left' && x >= IMAGE.width / 2) continue;
      shown.push([x, y]);
    }
  if (shown.length === 0) throw new Error(`nothing of ${ids.join(', ')} shows`);
  const cx = shown.reduce((s, p) => s + p[0], 0) / shown.length;
  const cy = shown.reduce((s, p) => s + p[1], 0) / shown.length;
  const ys = shown.map((p) => p[1]);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const target = Math.round(row === undefined ? cy : top + (bottom - top) * row);
  // The row nearest the target that shows anything of it.
  const line = [...new Set(ys)].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  const xs = shown
    .filter((p) => p[1] === line)
    .map((p) => p[0])
    .sort((a, b) => a - b);
  const runs = [];
  for (const x of xs) {
    const last = runs[runs.length - 1];
    if (last && x === last[1] + 1) last[1] = x;
    else runs.push([x, x]);
  }
  // The widest stretch; of two as wide, the one nearer the middle.
  const width = (r) => r[1] - r[0];
  const off = (r) => Math.abs((r[0] + r[1]) / 2 - cx);
  const [a, b] = runs.reduce((best, r) =>
    width(r) > width(best) || (width(r) === width(best) && off(r) < off(best)) ? r : best,
  );
  return { cx, cy, point: [Math.round((a + b) / 2), line] };
}

const k = FRAME.width / IMAGE.width;
const anchors = [];
for (const part of figure.parts) {
  let ids = part.measure ?? part.groups;
  if (part.sides) {
    const both = await Promise.all(part.sides.map((side) => measure(side)));
    const pick = both[0].cx < both[1].cx === (part.column === 'left') ? 0 : 1;
    ids = part.sides[pick];
  }
  const m = await measure(ids, part);
  const point = [Math.round(m.point[0] * k), Math.round(m.point[1] * k)];
  const tap = part.tap
    ? [
        Math.min(Math.max(Math.round(m.cx * k - TAP / 2), 0), FRAME.width - TAP),
        Math.min(Math.max(Math.round(m.cy * k - TAP / 2), 0), FRAME.height - TAP),
        TAP,
        TAP,
      ]
    : null;
  anchors.push({ id: part.id, at: point, column: part.column, tap });
}

/** Each column's numbers at their anchors' height, moved apart to `BADGE_GAP` and kept inside. */
for (const column of ['left', 'right']) {
  // Top to bottom; of two anchors as high, the one nearer the column first, so no lines cross.
  const near = column === 'left' ? 1 : -1;
  const list = anchors
    .filter((a) => a.column === column)
    .sort((a, b) => a.at[1] - b.at[1] || near * (a.at[0] - b.at[0]));
  let y = -Infinity;
  for (const a of list) {
    y = Math.max(a.at[1], y + BADGE_GAP, 12);
    a.badge = [COLUMNS[column], y];
  }
  // Past the bottom: the column is pushed up from there, as far as it has to.
  let floor = FRAME.height - 12;
  for (const a of [...list].reverse()) {
    a.badge[1] = Math.min(a.badge[1], floor);
    floor = a.badge[1] - BADGE_GAP;
  }
}

const block = [
  `  // Measured from the image by packages/shared-math/scripts/figures.mjs (#820): never by hand.`,
  `  ${id}: [`,
  ...anchors.map(
    (a) =>
      `    { id: '${a.id}', at: [${a.at.join(', ')}], badge: [${a.badge.join(', ')}], tap: ${a.tap ? `[${a.tap.join(', ')}]` : 'null'} },`,
  ),
  '  ],',
].join('\n');
const before = readFileSync(ANCHORS_FILE, 'utf8');
const blockAt = new RegExp(
  `(?: {2}// Measured from the image by [^\\n]*\\n)? {2}${id}: \\[\\n[\\s\\S]*?\\n {2}\\],`,
);
if (!blockAt.test(before)) throw new Error(`no ${id} block in schematicAnchors.data.ts`);
const after = before.replace(blockAt, block);

if (flag === '--check') {
  if (after !== before) {
    console.error(
      `the ${id} anchors are out of date: run packages/shared-math/scripts/figures.mjs ${id}`,
    );
    process.exit(1);
  }
  console.log(`${id} anchors up to date`);
} else {
  const image = join(root, 'apps', 'mobile', 'assets', 'figures', `${id}.png`);
  writeFileSync(ANCHORS_FILE, after);
  await whole.clone().png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(image);
  console.log(`wrote ${image} and the ${id} block of ${ANCHORS_FILE}`);
}
