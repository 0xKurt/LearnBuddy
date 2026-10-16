// The turn's tool offer and the calls the model writes (KI-Audit F3, issues #667, #668, #726).
//
// - The model writes calls flat (`{ tool, ...args }`, calls.ts) and code nests them before it
//   validates them, so every handler keeps `{ tool, args }`.
// - A turn offers only the tools that can name something in her STATE (`offeredTools`).
// - The full offer keeps real headroom under the 269 properties Vertex serves (#627): the next
//   field on the turn must not be the one that breaks the chat.

import { describe, expect, it } from 'vitest';

import { MAX_SCHEMA_PROPERTIES, schemaProperties } from '../../../llm/schemaBudget.js';
import { registerLearning } from '../../learning/register.js';
import { nestCall } from '../calls.js';
import { buddyPrompt, turnSchemasFor } from '../prompts.js';
import { offeredTools, toolsFor, turnActionSchema, type ToolFacts } from '../registry.js';

registerLearning();

const NONE: ToolFacts = { memories: 0, goals: 0, steps: 0, materials: 0 };
const ALL: ToolFacts = { memories: 2, goals: 1, steps: 3, materials: 4 };

/** The tool names a step schema offers, read from what goes out. */
function offered(schema: object): string[] {
  const s = schema as {
    properties: {
      actions: { items: { anyOf: Array<{ properties: { tool: { enum: string[] } } }> } };
    };
  };
  return s.properties.actions.items.anyOf.flatMap((b) => b.properties.tool.enum);
}

describe('the calls the model writes', () => {
  it('are flat in the schema: a tool and its own fields, no args wrapper', () => {
    const branches = (
      buddyPrompt().turnStepSchema as {
        properties: { actions: { items: { anyOf: Array<{ properties: object }> } } };
      }
    ).properties.actions.items.anyOf;
    for (const b of branches) expect(Object.keys(b.properties)).not.toContain('args');
  });

  it('are nested again before code validates them', () => {
    const flat = { tool: 'mark_step_done', step: 'st1', quote: 'schon gemacht' };
    expect(nestCall(flat)).toEqual({
      tool: 'mark_step_done',
      args: { step: 'st1', quote: 'schon gemacht' },
    });
    const parsed = turnActionSchema().safeParse(flat);
    expect(parsed.success && parsed.data).toEqual({
      tool: 'mark_step_done',
      args: { step: 'st1', quote: 'schon gemacht' },
    });
  });

  it('still take the nested shape every stored decision and scripted answer has', () => {
    const nested = { tool: 'mark_step_done', args: { step: 'st1', quote: 'schon gemacht' } };
    expect(nestCall(nested)).toBe(nested);
    expect(turnActionSchema().safeParse(nested).success).toBe(true);
  });
});

describe('the tools a turn offers (#668)', () => {
  it('leaves out what has nothing in STATE to name', () => {
    const tools = offeredTools(NONE);
    for (const t of [
      'correct_memory',
      'forget',
      'update_goal',
      'close_goal',
      'update_step',
      'mark_step_done',
      'delete_material',
      'rename_material',
      'delete_item',
    ])
      expect(tools).not.toContain(t);
    // What creates something, or offers it, is always there.
    for (const t of ['remember', 'plan_exam', 'plan_step', 'prepare_practice', 'offer_learning'])
      expect(tools).toContain(t);
  });

  it('offers every tool once STATE names one of each', () => {
    expect(offeredTools(ALL)).toEqual(toolsFor('turn'));
  });

  it('sends exactly the offered tools and names the offer for llm_calls', () => {
    const none = turnSchemasFor(offeredTools(NONE));
    expect(offered(none.step)).toEqual(offeredTools(NONE));
    expect(none.variant).toBe('no memories,goals,steps,materials');
    expect(turnSchemasFor(offeredTools(ALL)).variant).toBe('all tools');
  });

  it('builds the full offer byte for byte like the prompt the inventory reads', () => {
    expect(turnSchemasFor(offeredTools(ALL)).step).toEqual(buddyPrompt().turnStepSchema);
    expect(turnSchemasFor(offeredTools(ALL)).final).toEqual(buddyPrompt().turnSchema);
  });
});

describe('the turn schema keeps headroom under what Vertex serves (#726)', () => {
  it('stays at least 20 properties below the bound with every tool offered', () => {
    expect(schemaProperties(buddyPrompt().turnStepSchema)).toBeLessThanOrEqual(
      MAX_SCHEMA_PROPERTIES - 20,
    );
  });
});
