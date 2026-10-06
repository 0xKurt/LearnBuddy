// The picture library (issue #252): every part named in five languages and found by any of its
// names, every part reached by a finger at its own point, and a picture tapped like every figure.

import { describe, expect, it } from 'vitest';

import { REGION_LANGS, regionAt, regionReach, regionTappable, regionTapWidth } from '../regions.js';
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
} from '../schematics.js';
import { namedPlaces, tapPick, tapProblem, tapText, tapVerdict } from '../tap.js';

const cell: SchematicFig = { type: 'schematic', d: 'plant_cell', n: [], ask: 0 };

describe('the library', () => {
  it('has the drawings, each with parts named in all five languages', () => {
    expect(SCHEMATIC_IDS).toHaveLength(8);
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

  it('the parts school asks to tap are big enough for a finger on a phone', () => {
    const tappable = (d: SchematicFig['d'], name: string) =>
      regionTappable(
        schematicRegions(SCHEMATIC_SHAPES, d),
        schematicPart(d, name)!,
        schematic(d).height,
      );
    expect(tappable('plant_cell', 'Zellkern')).toBe(true);
    expect(tappable('plant_cell', 'Vakuole')).toBe(true);
    expect(tappable('eye', 'Linse')).toBe(true);
    expect(tappable('bicycle', 'Rahmen')).toBe(true);
    expect(tappable('insect', 'Kopf')).toBe(true);
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
