import { describe, expect, it } from 'vitest';

import { ACT_SCHEMAS } from '../decision.js';
import {
  ACT_TOOLS,
  actToolsPrompt,
  CheckActionSchema,
  toolsFor,
  TurnActionSchema,
} from '../registry.js';

describe('act tool registry', () => {
  it('registers every act tool exactly once, with a handler', () => {
    expect(Object.keys(ACT_TOOLS).sort()).toEqual(Object.keys(ACT_SCHEMAS).sort());
    for (const spec of Object.values(ACT_TOOLS)) expect(typeof spec.run).toBe('function');
  });

  it('lets a background check only prepare and look again — never change what the learner said', () => {
    expect(toolsFor('check')).toEqual(['prepare_practice', 'request_material', 'schedule_check']);
    for (const n of toolsFor('check')) {
      expect(ACT_TOOLS[n].needsQuote).toBe(false);
      expect(ACT_TOOLS[n].touches).not.toContain('memory');
      expect(ACT_TOOLS[n].touches).not.toContain('goals');
      expect(ACT_TOOLS[n].touches).not.toContain('settings');
    }
  });

  it('builds the schemas from the registry', () => {
    const remember = {
      tool: 'remember',
      args: { kind: 'fact', statement: 'Mag Mathe', quote: 'Mathe', until: null },
    };
    expect(TurnActionSchema.safeParse(remember).success).toBe(true);
    // The check schema has no remember at all.
    expect(CheckActionSchema.safeParse(remember).success).toBe(false);
  });

  it('generates the prompt catalogue per surface', () => {
    expect(actToolsPrompt('check')).toContain('prepare_practice');
    expect(actToolsPrompt('check')).not.toContain('set_contact');
    expect(actToolsPrompt('turn')).toContain('set_contact: reduce, pause or shift contact');
  });
});
