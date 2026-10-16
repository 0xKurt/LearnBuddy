import { beforeAll, describe, expect, it } from 'vitest';

import { registerLearning } from '../../learning/register.js';
import { ACT_SCHEMAS } from '../decision.js';
import {
  ACT_TOOLS,
  actToolsPrompt,
  askedButActed,
  checkActionSchema,
  toolsFor,
  turnActionSchema,
} from '../registry.js';

describe('act tool registry', () => {
  // The learning domain's tools join the core's at start-up (issue #107, cut 7b).
  beforeAll(() => registerLearning());

  it('registers every act tool exactly once', () => {
    expect(Object.keys(ACT_TOOLS).sort()).toEqual(Object.keys(ACT_SCHEMAS).sort());
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
      args: {
        about: 'learning',
        kind: 'fact',
        statement: 'Mag Mathe',
        quote: 'Mathe',
        until: null,
      },
    };
    expect(turnActionSchema().safeParse(remember).success).toBe(true);
    // The check schema has no remember at all.
    expect(checkActionSchema().safeParse(remember).success).toBe(false);
  });

  it('generates the prompt catalogue per surface', () => {
    expect(actToolsPrompt('check')).toContain('prepare_practice');
    expect(actToolsPrompt('check')).not.toContain('set_contact');
    expect(actToolsPrompt('turn')).toContain('set_contact: reduce, pause or shift contact');
  });

  it('never lets a reply ask whether to remove something while already removing it', () => {
    const drop = {
      tool: 'close_goal' as const,
      args: { goal: 'g1', status: 'dropped' as const, outcome: null, quote: 'Lösche alles' },
    };
    const plan = {
      tool: 'offer_learning' as const,
      args: { kind: 'practice' as const, text: 'Brüche', goal: null },
    };
    expect(askedButActed({ asks_permission: true, actions: [drop] })).toHaveLength(1);
    // Asking about something else after doing a harmless thing is fine.
    expect(askedButActed({ asks_permission: true, actions: [plan] })).toEqual([]);
    // Removing without asking (she clearly asked for it) is a normal action.
    expect(askedButActed({ asks_permission: false, actions: [drop] })).toEqual([]);
  });
});
