import { describe, expect, it } from 'vitest';
import { strictSchema, restoreStrictJson } from '../../../llm/chat-schema.js';
import { schemaProperties } from '../../../llm/schemaBudget.js';
import { registerLearning } from '../../learning/register.js';
import { buddyPrompt } from '../prompts.js';
import { turnDecisionSchema } from '../registry.js';
import { replyFormatErrors } from '../replyFormat.js';

registerLearning();

describe('picture act on the provider wire', () => {
  it('offers the real picture act and retains it through strict adaptation', () => {
    const schema = buddyPrompt().turnStepSchema;
    expect(schemaProperties(schema)).toBeLessThanOrEqual(249);
    expect(JSON.stringify(schema).length).toBeLessThanOrEqual(30000);
    expect(JSON.stringify(strictSchema(schema))).toContain('show_figure');
    expect(JSON.stringify(strictSchema(schema))).toContain('schematic_parts');
    expect(JSON.stringify(buddyPrompt().checkStepSchema)).not.toContain('schematic_parts');
    const raw = {
      lookups: [],
      concern: false,
      also_asked: false,
      actions: [
        {
          tool: 'show_figure',
          drawing: 'fraction_circle',
          n: [],
          parts: 4,
          filled: 3,
        },
      ],
      reply: 'Drei von vier gleich großen Teilen.',
      options: null,
      asks_permission: false,
    };
    const restored = restoreStrictJson(schema, raw);
    expect(turnDecisionSchema().parse(restored).actions).toEqual([
      { tool: 'show_figure', args: { drawing: 'fraction_circle', n: [], parts: 4, filled: 3 } },
    ]);
  });
  it.each([
    'Ein Bruch: $3/4$.',
    'Die Funktion ist $f(x)=x^2$.',
    'Erster Punkt\n- Zweiter Punkt',
    'Der Betrag ist |x|.',
    '|x|\n|y|',
    '\\frac{1}{2}\n\\frac{3}{4}',
  ])('keeps ordinary prose and maths: %s', (text) => {
    expect(replyFormatErrors(text)).toEqual([]);
  });
});
