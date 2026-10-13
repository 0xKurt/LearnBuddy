// The picture library (issue #252): every part named in five languages and found by any of its
// names, the one picture we still draw reached by a finger at each part's own point, and a picture
// tapped like every figure. Where the parts of the images stand is `schematicAnchors.test.ts`.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../figureNames.data.js';
import { REGION_LANGS, regionAt, regionReach, regionTapWidth } from '../regions.js';
import { SCHEMATIC_SHAPES } from '../schematicShapes.data.js';
import {
  isImageSchematic,
  SCHEMATIC_DRAWN,
  SCHEMATIC_IDS,
  SCHEMATIC_IMAGE_IDS,
  schematic,
  schematicBounds,
  schematicCanonical,
  schematicFrame,
  schematicNumbered,
  schematicPart,
  schematicPartName,
  schematicProblem,
  schematicRegions,
  type SchematicDrawnId,
  type SchematicFig,
  type SchematicId,
} from '../schematics.js';
import { namedPlaces, tapPick, tapProblem, tapText, tapVerdict } from '../tap.js';

const cell: SchematicFig = { type: 'schematic', d: 'plant_cell', n: [], ask: 0 };
const DRAWN = Object.keys(SCHEMATIC_DRAWN) as SchematicDrawnId[];

describe('the library', () => {
  it('has the pictures, each with parts named in all five languages', () => {
    expect(SCHEMATIC_IDS).toHaveLength(35);
    for (const d of SCHEMATIC_IDS) {
      const parts = schematic(FIGURE_NAMES, d).parts;
      // The plant shows three: its image has no root (#599).
      expect(parts.length, d).toBeGreaterThanOrEqual(3);
      for (const p of parts) {
        for (const l of REGION_LANGS) expect(p[l].trim(), `${d}.${p.id}.${l}`).not.toBe('');
      }
    }
  });

  it('every picture is an image — but the circuit, the one we draw, with its reason (#599)', () => {
    expect(SCHEMATIC_IMAGE_IDS).toHaveLength(34);
    expect(DRAWN).toEqual(['circuit']);
    expect(SCHEMATIC_DRAWN.circuit.why).toMatch(/no free image/);
    expect(SCHEMATIC_IDS.filter((d) => !isImageSchematic(d))).toEqual(['circuit']);
    // An image stands in its own frame 300 wide, the drawing in the regions' 1000.
    expect(schematicFrame('plant_cell')).toEqual({ width: 300, height: 232 });
    expect(schematicBounds('plant_cell')).toEqual([0, 0, 300, 232]);
    expect(schematicFrame('circuit')).toEqual({ width: 1000, height: 720 });
  });

  it('a part its image does not show is no part of the library any more (#599, TEILE.md)', () => {
    const DROPPED: Array<[SchematicId, string[]]> = [
      ['plant', ['root', 'Wurzel']],
      [
        'bicycle',
        [
          'carrier',
          'bell',
          'headlight',
          'spoke_reflector',
          'rear_light',
          'Gepäckträger',
          'Klingel',
          'Scheinwerfer',
          'Speichenreflektor',
          'Rücklicht',
        ],
      ],
      ['organs', ['kidneys', 'Nieren']],
      ['insect_head', ['ocelli', 'Punktaugen']],
      ['leaf', ['vascular_bundle', 'Leitbündel']],
      ['distillation', ['stand', 'burner', 'Stativ', 'Bunsenbrenner']],
    ];
    for (const [d, names] of DROPPED) {
      for (const name of names) expect(schematicPart(FIGURE_NAMES, d, name), name).toBeNull();
    }
    // The same part where another image does show it: the lab's burner stays.
    expect(schematicPart(FIGURE_NAMES, 'lab', 'Bunsenbrenner')).not.toBeNull();
  });

  it('the drawing’s names and shapes line up, part by part', () => {
    for (const d of DRAWN) {
      expect(
        SCHEMATIC_SHAPES[d].parts.map((p) => p.id),
        d,
      ).toEqual(schematic(FIGURE_NAMES, d).parts.map((p) => p.id));
      for (const p of SCHEMATIC_SHAPES[d].parts) expect(p.rings.length).toBeGreaterThan(0);
    }
  });

  it('the drawing fills its bounds: nothing drawn outside, little paper inside (#462)', () => {
    for (const d of DRAWN) {
      const s = SCHEMATIC_SHAPES[d];
      const n = [
        ...s.parts.flatMap((p) => p.rings),
        ...s.lines,
        ...(s.marks?.white ?? []),
        ...(s.marks?.black ?? []),
      ].flatMap((r) => r.split(' ').map(Number));
      const xs = n.filter((_, i) => i % 2 === 0);
      const ys = n.filter((_, i) => i % 2 === 1);
      const extent = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const [x0, y0, x1, y1] = schematicBounds(d);
      // Its outline's stroke stays inside, and at most a margin of paper is left round it.
      for (const gap of [extent[0]! - x0, extent[1]! - y0, x1 - extent[2]!, y1 - extent[3]!]) {
        expect(gap, d).toBeGreaterThanOrEqual(4);
        expect(gap, d).toBeLessThanOrEqual(30);
      }
    }
  });

  it('every name, in every language, means exactly one part of its picture', () => {
    for (const d of SCHEMATIC_IDS) {
      schematic(FIGURE_NAMES, d).parts.forEach((p, i) => {
        for (const name of [p.id, ...REGION_LANGS.map((l) => p[l]), ...p.alt]) {
          expect(schematicPart(FIGURE_NAMES, d, name), `${d}: ${name}`).toBe(i);
        }
      });
    }
  });

  it('a finger at a part’s own point means that part, in the drawing', () => {
    for (const d of DRAWN) {
      const set = schematicRegions(SCHEMATIC_SHAPES, d);
      const reach = regionReach(regionTapWidth(schematicFrame(d).height));
      set.regions.forEach((p, i) => {
        expect(
          regionAt(set, p.at[0], p.at[1], reach),
          `${d}: ${schematic(FIGURE_NAMES, d).parts[i]?.id}`,
        ).toBe(i);
      });
    }
  });

  it('one part, one id and name in the whole picture and in the one drawn large (#462)', () => {
    const pairs: Array<[SchematicId, SchematicId, string[]]> = [
      ['eye', 'eye_front', ['Linse', 'Pupille', 'Hornhaut', 'Regenbogenhaut']],
      ['flower', 'flower_section', ['Narbe', 'Staubblatt', 'Griffel', 'Fruchtknoten']],
      ['insect', 'insect_head', ['Kopf', 'Facettenauge']],
    ];
    for (const [whole, large, names] of pairs) {
      for (const name of names) {
        const [a, b] = [whole, large].map(
          (d) => schematic(FIGURE_NAMES, d).parts[schematicPart(FIGURE_NAMES, d, name)!],
        );
        expect(b, name).toBe(a);
      }
    }
  });

  it('marks stand on the parts and are no part: a tap on the bulb’s wire means the bulb', () => {
    const set = schematicRegions(SCHEMATIC_SHAPES, 'circuit');
    const reach = regionReach(regionTapWidth(schematicFrame('circuit').height));
    expect(regionAt(set, 500, 110, reach)).toBe(schematicPart(FIGURE_NAMES, 'circuit', 'bulb'));
    expect(regionAt(set, 850, 400, reach)).toBe(schematicPart(FIGURE_NAMES, 'circuit', 'switch'));
  });
});

describe('a name resolved against the library', () => {
  it('in German, English and other names; written in her language', () => {
    expect(schematicPart(FIGURE_NAMES, 'plant_cell', 'Nukleus')).toBe(
      schematicPart(FIGURE_NAMES, 'plant_cell', 'Zellkern'),
    );
    expect(schematicPart(FIGURE_NAMES, 'plant_cell', 'nucleus')).toBe(
      schematicPart(FIGURE_NAMES, 'plant_cell', 'Zellkern'),
    );
    expect(schematicPart(FIGURE_NAMES, 'eye', 'Iris')).toBe(
      schematicPart(FIGURE_NAMES, 'eye', 'Regenbogenhaut'),
    );
    expect(schematicPart(FIGURE_NAMES, 'plant_cell', 'Linse')).toBeNull();
    const nucleus = schematicPart(FIGURE_NAMES, 'plant_cell', 'Zellkern')!;
    expect(schematicPartName(FIGURE_NAMES, 'plant_cell', nucleus, 'en')).toBe('nucleus');
    expect(schematicPartName(FIGURE_NAMES, 'plant_cell', nucleus, 'nl')).toBe('Zellkern');
  });

  it('numbers only parts the picture has, each once, and asks a number one carries', () => {
    expect(schematicProblem(FIGURE_NAMES, { ...cell, n: ['Linse'] })).toMatch(/no part/);
    expect(schematicProblem(FIGURE_NAMES, { ...cell, n: ['Zellkern', 'Nukleus'] })).toMatch(
      /twice/,
    );
    expect(schematicProblem(FIGURE_NAMES, { ...cell, n: ['Zellkern'], ask: 2 })).toMatch(
      /number 2/,
    );
    const f = { ...cell, n: ['Nukleus', 'Vakuole'], ask: 1 };
    expect(schematicProblem(FIGURE_NAMES, f)).toBeNull();
    expect(schematicCanonical(FIGURE_NAMES, f).n).toEqual(['nucleus', 'vacuole']);
    expect(schematicNumbered(FIGURE_NAMES, f)).toEqual([
      schematicPart(FIGURE_NAMES, 'plant_cell', 'Zellkern'),
      schematicPart(FIGURE_NAMES, 'plant_cell', 'Vakuole'),
    ]);
  });

  it('a picture that names a part it no longer has numbers nothing: no number may shift (#599)', () => {
    // As stored before the bicycle became an image: the bell carried the 1, the saddle the 2.
    const stored: SchematicFig = { type: 'schematic', d: 'bicycle', n: ['bell', 'saddle'], ask: 2 };
    expect(schematicProblem(FIGURE_NAMES, stored)).toMatch(/no part "bell"/);
    // Never [saddle] alone: the saddle would become "Teil 1" under a question about "Teil 2".
    expect(schematicNumbered(FIGURE_NAMES, stored)).toBeNull();
  });
});

describe('a picture is tapped like every figure (`tap.ts`)', () => {
  it('a tap writes the part’s German name and reads any of its names back', () => {
    const pick = tapPick(FIGURE_NAMES, cell, 'nucleus');
    expect(pick).not.toBeNull();
    expect(tapText(FIGURE_NAMES, cell, pick!)).toBe('Zellkern');
    expect(tapVerdict(FIGURE_NAMES, cell, 'Zellkern', 'Nukleus')).toBe('correct');
    expect(tapVerdict(FIGURE_NAMES, cell, 'Zellkern', 'Vakuole')).toBe('incorrect');
    expect(namedPlaces(FIGURE_NAMES, cell)).toBe(schematic(FIGURE_NAMES, 'plant_cell').parts);
  });

  it('a key that is no part cannot be tapped; numbers name nothing, so they mark nothing', () => {
    expect(tapProblem(FIGURE_NAMES, cell, 'short', 'Zellkern')).toBeNull();
    expect(tapProblem(FIGURE_NAMES, cell, 'short', 'Linse')).toMatch(/no place/);
    const numbered: SchematicFig = { ...cell, n: ['Zellkern'] };
    expect(tapProblem(FIGURE_NAMES, numbered, 'short', 'Zellkern')).toBeNull();
  });
});
