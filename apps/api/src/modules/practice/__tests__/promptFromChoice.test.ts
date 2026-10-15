// A run is told the rules of what its schema can hold, and the choosing call reads a short
// catalogue instead of the whole prompt (KI-Audit F5-3, issue #669).

import { STRUCTURED_KINDS } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { offered, widest } from '../formChoice.js';
import { choosingCatalogue } from '../choosingCatalogue.js';
import { GENERATE_SYSTEM, generateSystem } from '../generate.js';
import { FIGURE_RULES, figureRules } from '../items.js';
import { explainSchemaFor, STRUCTURED_RULE_OF } from '../setProfiles.js';

const NOTHING = { forms: [], figures: [] };

/** A text only each family's own part holds. */
const FAMILY: Record<string, string> = {
  map: 'A map (stumme Karte)',
  schematic: 'A labelled picture (schematic)',
  geometry: 'A geometry figure is drawn to scale',
  molecule: 'A molecule is atoms',
  clock: 'Primary school:',
  line_chart: 'Charts are data only',
  tree: 'Trees are data only',
  periodic_table: 'periodic_table: the app draws the table',
  solid: 'Solids are data only',
  diagram: 'Diagrams (boxes with arrows)',
  circuit: 'Circuits, logic gates',
};

describe('the generator is told only what its schema offers', () => {
  it('keeps the whole prompt byte for byte when nothing is narrowed', () => {
    expect(generateSystem()).toBe(GENERATE_SYSTEM);
    expect(figureRules()).toBe(FIGURE_RULES);
  });

  it('tells a run without forms or figures no rule of either', () => {
    const plain = generateSystem(NOTHING);
    expect(plain).not.toContain('Figures: add');
    expect(plain).not.toContain('("structured"');
    expect(plain).not.toContain('("bars")');
    expect(plain.length).toBeLessThan(GENERATE_SYSTEM.length / 5);
  });

  it('takes the rules of a vocabulary run from its schema, which offers neither', () => {
    const vocab = widest(explainSchemaFor('vocab', null));
    expect(offered(vocab)).toEqual(NOTHING);
    expect(generateSystem(offered(vocab))).toBe(generateSystem(NOTHING));
  });

  it('gives each figure family its own rules and no other family’s', () => {
    for (const [type, text] of Object.entries(FAMILY)) {
      const rules = figureRules(new Set([type]));
      expect(rules, type).toContain('Figures: add "figure" only when');
      expect(rules, type).toContain(text);
      const others = Object.entries(FAMILY).filter(([o, t]) => o !== type && rules.includes(t));
      expect(
        others.map(([o]) => o),
        type,
      ).toEqual([]);
    }
  });

  it('tells a run exactly the structured forms it offers', () => {
    const rules = generateSystem({ forms: ['cloze'], figures: [] });
    expect(rules).toContain(STRUCTURED_RULE_OF.cloze);
    for (const k of STRUCTURED_KINDS)
      if (k !== 'cloze') expect(rules, k).not.toContain(STRUCTURED_RULE_OF[k]);
  });
});

describe('the choosing call reads a catalogue, not the whole prompt', () => {
  it('names every form and figure a practice run offers, in a fraction of the prompt', () => {
    const offer = offered(explainSchemaFor('practice', null));
    const catalogue = choosingCatalogue(offer);
    for (const f of offer.figures) expect(catalogue).toContain(f);
    for (const k of offer.forms.filter((f) => f in STRUCTURED_RULE_OF))
      expect(catalogue).toContain(`type "${k}"`);
    expect(catalogue.length).toBeLessThan(5_000);
  });
});
