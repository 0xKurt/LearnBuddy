// The picture library (issue #252): every part named in five languages and found by any of its
// names, every part reached by a finger at its own point, and a picture tapped like every figure.

import { describe, expect, it } from 'vitest';

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
      const parts = schematic(d).parts;
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
      ).toEqual(schematic(d).parts.map((p) => p.id));
      for (const p of SCHEMATIC_SHAPES[d].parts) expect(p.rings.length).toBeGreaterThan(0);
    }
  });

  it('every name, in every language, means exactly one part of its drawing', () => {
    for (const d of SCHEMATIC_IDS) {
      schematic(d).parts.forEach((p, i) => {
        for (const name of [p.id, ...REGION_LANGS.map((l) => p[l]), ...p.alt]) {
          expect(schematicPart(d, name), `${d}: ${name}`).toBe(i);
        }
      });
    }
  });

  it('a finger at a part’s own point means that part, in every drawing', () => {
    for (const d of SCHEMATIC_IDS) {
      const set = schematicRegions(SCHEMATIC_SHAPES, d);
      const reach = regionReach(regionTapWidth(schematic(d).height));
      set.regions.forEach((p, i) => {
        expect(regionAt(set, p.at[0], p.at[1], reach), `${d}: ${schematic(d).parts[i]?.id}`).toBe(
          i,
        );
      });
    }
  });

  it('a tap asks only for a part a whole finger fits, in the smallest room', () => {
    const tappable = (d: SchematicId, id: string) =>
      regionTappable(
        schematicRegions(SCHEMATIC_SHAPES, d),
        schematicPart(d, id)!,
        schematic(d).height,
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
      for (const { id } of schematic(d).parts) {
        expect(tappable(d, id), `${d}.${id}`).toBe(!NAMED_ONLY[d]?.includes(id));
      }
    }
  });

  it('a whole finger is more than a map asks: the lens is a target for a map, not for a picture', () => {
    const set = schematicRegions(SCHEMATIC_SHAPES, 'eye');
    const lens = schematicPart('eye', 'Linse')!;
    const h = schematic('eye').height;
    expect(regionTappable(set, lens, h, TAP_TARGET.map)).toBe(true);
    expect(regionTappable(set, lens, h, TAP_TARGET.picture)).toBe(false);
  });

  it('marks stand on the parts and are no part: a tap on a sign’s symbol means the sign', () => {
    const set = schematicRegions(SCHEMATIC_SHAPES, 'signs');
    const reach = regionReach(regionTapWidth(schematic('signs').height));
    // The middle of the white O of STOP, the walker's head, the bicycle's front hub.
    expect(regionAt(set, 272, 151, reach)).toBe(schematicPart('signs', 'stop'));
    expect(regionAt(set, 744, 406, reach)).toBe(schematicPart('signs', 'crossing'));
    expect(regionAt(set, 295, 778, reach)).toBe(schematicPart('signs', 'cycle_path'));
  });
});

describe('a name resolved against the library', () => {
  it('in German, English and other names; written in her language', () => {
    expect(schematicPart('plant_cell', 'Nukleus')).toBe(schematicPart('plant_cell', 'Zellkern'));
    expect(schematicPart('plant_cell', 'nucleus')).toBe(schematicPart('plant_cell', 'Zellkern'));
    expect(schematicPart('eye', 'Iris')).toBe(schematicPart('eye', 'Regenbogenhaut'));
    expect(schematicPart('plant_cell', 'Linse')).toBeNull();
    const nucleus = schematicPart('plant_cell', 'Zellkern')!;
    expect(schematicPartName('plant_cell', nucleus, 'en')).toBe('nucleus');
    expect(schematicPartName('plant_cell', nucleus, 'nl')).toBe('Zellkern');
  });

  it('numbers only parts the drawing has, each once, and asks a number one carries', () => {
    expect(schematicProblem({ ...cell, n: ['Linse'] })).toMatch(/no part/);
    expect(schematicProblem({ ...cell, n: ['Zellkern', 'Nukleus'] })).toMatch(/twice/);
    expect(schematicProblem({ ...cell, n: ['Zellkern'], ask: 2 })).toMatch(/number 2/);
    const f = { ...cell, n: ['Nukleus', 'Vakuole'], ask: 1 };
    expect(schematicProblem(f)).toBeNull();
    expect(schematicCanonical(f).n).toEqual(['nucleus', 'vacuole']);
    expect(schematicNumbered(f)).toEqual([
      schematicPart('plant_cell', 'Zellkern'),
      schematicPart('plant_cell', 'Vakuole'),
    ]);
  });
});

describe('a picture is tapped like every figure (`tap.ts`)', () => {
  it('a tap writes the part’s German name and reads any of its names back', () => {
    const pick = tapPick(cell, 'nucleus');
    expect(pick).not.toBeNull();
    expect(tapText(cell, pick!)).toBe('Zellkern');
    expect(tapVerdict(cell, 'Zellkern', 'Nukleus')).toBe('correct');
    expect(tapVerdict(cell, 'Zellkern', 'Vakuole')).toBe('incorrect');
    expect(namedPlaces(cell)).toBe(schematic('plant_cell').parts);
  });

  it('a key that is no part cannot be tapped; numbers name nothing, so they mark nothing', () => {
    expect(tapProblem(cell, 'short', 'Zellkern')).toBeNull();
    expect(tapProblem(cell, 'short', 'Linse')).toMatch(/no place/);
    const numbered: SchematicFig = { ...cell, n: ['Zellkern'] };
    expect(tapProblem(numbered, 'short', 'Zellkern')).toBeNull();
  });
});
