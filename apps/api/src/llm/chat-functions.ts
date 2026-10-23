// Function calls are a wire representation of a decision, never permission to execute an act.
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

import { LlmError, type JsonSchema } from './gateway.js';
import {
  assertStrictSchema,
  matchesSchema,
  restoreStrictJson,
  schemaObject,
  strictSchema,
} from './chat-schema.js';

export class TurnFunctions {
  readonly tools: ChatCompletionTool[];
  private readonly schemas = new Map<string, JsonSchema>();
  private readonly actions: unknown[] = [];

  constructor(
    private readonly schema: JsonSchema,
    private readonly maxActions: number,
    limits: { properties: number; depth: number },
  ) {
    if (!schemaObject(schema.properties))
      throw new LlmError('refused', 'turn has no object schema');
    const actions = schema.properties.actions;
    if (!schemaObject(actions) || !schemaObject(actions.items))
      throw new LlmError('refused', 'turn has no action schema');
    const branches = Array.isArray(actions.items.anyOf) ? actions.items.anyOf : [actions.items];
    for (const branch of branches) {
      if (!schemaObject(branch) || !schemaObject(branch.properties))
        throw new LlmError('refused', 'unsupported act schema');
      const { tool, ...properties } = branch.properties;
      const name = schemaObject(tool) && Array.isArray(tool.enum) ? tool.enum[0] : null;
      if (
        typeof name !== 'string' ||
        !/^[a-z][a-z0-9_]*$/.test(name) ||
        name === 'respond' ||
        this.schemas.has(name)
      )
        throw new LlmError('refused', 'invalid act name');
      this.schemas.set(name, {
        ...branch,
        properties,
        required: Array.isArray(branch.required) ? branch.required.filter((k) => k !== 'tool') : [],
      });
    }
    const { actions: _actions, ...properties } = schema.properties;
    this.schemas.set('respond', {
      ...schema,
      properties,
      required: Array.isArray(schema.required)
        ? schema.required.filter((k) => k !== 'actions')
        : [],
    });
    this.tools = [...this.schemas].map(([name, original]) => {
      const parameters = strictSchema(original);
      assertStrictSchema(parameters, limits);
      return {
        type: 'function',
        function: {
          name,
          strict: true,
          parameters,
          description:
            name === 'respond'
              ? 'Finish the decision with its reply and metadata. Previously staged acts are included by the server.'
              : 'Stage this act in order. Nothing is applied until the complete decision is validated.',
        },
      };
    });
  }

  get full(): boolean {
    return this.actions.length >= this.maxActions;
  }

  accept(name: string, raw: string): unknown | undefined {
    const schema = this.schemas.get(name);
    if (!schema) throw new LlmError('invalid_output', 'unknown function');
    const args = restoreStrictJson(schema, JSON.parse(raw));
    if (!schemaObject(args) || !matchesSchema(schema, args))
      throw new LlmError('invalid_output', 'function arguments do not match their schema');
    if (name !== 'respond') {
      if (this.full) throw new LlmError('invalid_output', 'too many staged acts');
      this.actions.push({ tool: name, ...args });
      return undefined;
    }
    // Original field order is also the safety order consumed by replyProgress.
    return Object.fromEntries(
      Object.keys(this.schema.properties as JsonSchema).flatMap<[string, unknown]>((key) =>
        key === 'actions'
          ? [[key, this.actions]]
          : Object.hasOwn(args, key)
            ? [[key, args[key]]]
            : [],
      ),
    );
  }

  partial(name: string, raw: string): string | null {
    // Only respond can finish the decision; later act calls cannot invalidate an early reply.
    if (name !== 'respond' || !raw.startsWith('{')) return null;
    return `{"actions":${JSON.stringify(this.actions)},${raw.slice(1)}`;
  }
}
