// The picture library (issue #252): every part named in five languages and found by any of its
// names, every part reached by a finger at its own point, and a picture tapped like every figure.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../figureNames.data.js';
import {
  REGION_LANGS,
  regionAt,
  regionReach,
  regionTappable,
  regionTapWidth,
  TAP_TARGET,
} from '../regions.js';
import { SCHEMATIC_SHAPES } from '../schematicShapes.data.js';
import {
  SCHEMATIC_IDS,
  schematic,
  schematicCanonical,
  schematicHeight,
  schematicNumbered,
  schematicPart,
  schematicPartName,
  schematicProblem,
  schematicRegions,
  type SchematicFig,
  type SchematicId,
} from '../schematics.js';
import { namedPlaces, tapPick, tapProblem, tapText, tapVerdict } from '../tap.js';

const cell: SchematicFig = { type: 'schematic', d: 'plant_cell', n: [], ask: 0 };

describe('the library', () => {
  it('has the drawings, each with parts named in all five languages', () => {
    expect(SCHEMATIC_IDS).toHaveLength(17);
    for (const d of SCHEMATIC_IDS) {
      const parts = schematic(FIGURE_NAMES, d).parts;
      expect(parts.length, d).toBeGreaterThanOrEqual(4);
      for (const p of parts) {
        for (const l of REGION_LANGS) expect(p[l].trim(), `${d}.${p.id}.${l}`).not.toBe('');
      }
    }
  });

  it('names and shapes line up, part by part', () => {
    for (const d of SCHEMATIC_IDS) {
      expect(
        SCHEMATIC_SHAPES[d].parts.map((p) => p.id),
        d,
      ).toEqual(schematic(FIGURE_NAMES, d).parts.map((p) => p.id));
      for (const p of SCHEMATIC_SHAPES[d].parts) expect(p.rings.length).toBeGreaterThan(0);
    }
  });

  it('every name, in every language, means exactly one part of its drawing', () => {
    for (const d of SCHEMATIC_IDS) {
      schematic(FIGURE_NAMES, d).parts.forEach((p, i) => {
        for (const name of [p.id, ...REGION_LANGS.map((l) => p[l]), ...p.alt]) {
          expect(schematicPart(FIGURE_NAMES, d, name), `${d}: ${name}`).toBe(i);
        }
      });
    }
  });

  it('a finger at a part’s own point means that part, in every drawing', () => {
    for (const d of SCHEMATIC_IDS) {
      const set = schematicRegions(SCHEMATIC_SHAPES, d);
      const reach = regionReach(regionTapWidth(schematicHeight(d)));
      set.regions.forEach((p, i) => {
        expect(
          regionAt(set, p.at[0], p.at[1], reach),
          `${d}: ${schematic(FIGURE_NAMES, d).parts[i]?.id}`,
        ).toBe(i);
      });
    }
  });

  it('a tap asks only for a part a whole finger fits, in the smallest room', () => {
    const tappable = (d: SchematicId, id: string) =>
      regionTappable(
        schematicRegions(SCHEMATIC_SHAPES, d),
        schematicPart(FIGURE_NAMES, d, id)!,
        schematicHeight(d),
        TAP_TARGET.picture,
      );
    // Narrower than a finger and too close to their neighbours' numbers: named, never tapped.
    const NAMED_ONLY: Partial<Record<SchematicId, string[]>> = {
      flower: ['receptacle', 'stamen', 'ovary', 'style', 'stigma'],
      eye: ['cornea', 'lens', 'iris', 'pupil'],
      insect: ['head', 'eye'],
      bicycle: [
        'carrier',
        'handlebar',
        'bell',
        'headlight',
        'spoke_reflector',
        'brake',
        'rear_light',
      ],
      skeleton: ['sternum', 'collarbone', 'tibia', 'fibula'],
    };
    for (const d of SCHEMATIC_IDS) {
      for (const { id } of schematic(FIGURE_NAMES, d).parts) {
        expect(tappable(d, id), `${d}.${id}`).toBe(!NAMED_ONLY[d]?.includes(id));
      }
    }
  });

  it('a whole finger is more than a map asks: the lens is a target for a map, not for a picture', () => {
    const set = schematicRegions(SCHEMATIC_SHAPES, 'eye');
    const lens = schematicPart(FIGURE_NAMES, 'eye', 'Linse')!;
    const h = schematicHeight('eye');
    expect(regionTappable(set, lens, h, TAP_TARGET.map)).toBe(true);
    expect(regionTappable(set, lens, h, TAP_TARGET.picture)).toBe(false);
  });

  it('marks stand on the parts and are no part: a tap on a sign’s symbol means the sign', () => {
    const set = schematicRegions(SCHEMATIC_SHAPES, 'signs');
    const reach = regionReach(regionTapWidth(schematicHeight('signs')));
    // The middle of the white O of STOP, the walker's head, the bicycle's front hub.
    expect(regionAt(set, 272, 151, reach)).toBe(schematicPart(FIGURE_NAMES, 'signs', 'stop'));
    expect(regionAt(set, 744, 406, reach)).toBe(schematicPart(FIGURE_NAMES, 'signs', 'crossing'));
    expect(regionAt(set, 295, 778, reach)).toBe(schematicPart(FIGURE_NAMES, 'signs', 'cycle_path'));
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

  it('numbers only parts the drawing has, each once, and asks a number one carries', () => {
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
