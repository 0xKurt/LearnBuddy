// Every response schema the app sends, with its system prompt (issues #281, #627, #650). One list,
// read by three: the schema budget guard in CI (`llm/__tests__/schemaBudget.test.ts`), the schema
// inventory (`evals/schema/inventory.ts`), and the model canary of every scheduler run
// (`scheduler/canary.ts`), which turns `/health` red when a schema the running build sends is past
// the bound Vertex serves (`llm/schemaBudget.ts`). The core's own calls are listed here; a domain
// registers its own (modules/learning/register.ts), so this file never names it (issue #107).

import type { JsonSchema, LlmRequest } from '../../llm/gateway.js';
import * as voice from '../voice/service.js';
import * as consolidate from './consolidate.js';
import * as prompts from './prompts.js';
import * as summarise from './summarise.js';

export type SentSchema = {
  purpose: LlmRequest['purpose'];
  /** Which of the purpose's schema/prompt combinations (the profiles that exist today). */
  profile: string;
  /** As the call site passes it (summary is the only 'fast' one). */
  tier: LlmRequest['tier'];
  promptVersion: string;
  system: string;
  /** The largest schema the call site can send for this profile. */
  schema: JsonSchema;
  /** Where the call site picks this combination. */
  where: string;
};

const sources: (() => SentSchema[])[] = [];

/** A domain's schemas, read again on every call of `sentSchemas` (its prompts may change). */
export function registerSentSchemas(source: () => SentSchema[]): void {
  sources.push(source);
}

/** The core's calls: Buddy's turn and check, transcription, memory upkeep, summaries. */
function coreSchemas(): SentSchema[] {
  // Buddy's prompt is built from what the domain registered (issue #107).
  const p = prompts.buddyPrompt();
  const buddy = p.version;
  return [
    {
      purpose: 'buddy_turn',
      profile: 'step (lookups allowed; every first call of a turn)',
      tier: 'smart',
      promptVersion: buddy,
      system: p.turnSystem,
      schema: p.turnStepSchema,
      where:
        'buddy/prompts.ts (buddyPrompt), sent by turn.ts — final ? turnSchema : turnStepSchema',
    },
    {
      purpose: 'buddy_turn',
      profile: 'final (after MAX_LOOKUP_STEPS)',
      tier: 'smart',
      promptVersion: buddy,
      system: p.turnSystem,
      schema: p.turnSchema,
      where: 'buddy/turn.ts',
    },
    {
      purpose: 'buddy_check',
      profile: 'step',
      tier: 'smart',
      promptVersion: buddy,
      system: p.checkSystem,
      schema: p.checkStepSchema,
      where: 'buddy/check.ts — final ? CHECK_SCHEMA : CHECK_STEP_SCHEMA',
    },
    {
      purpose: 'buddy_check',
      profile: 'final',
      tier: 'smart',
      promptVersion: buddy,
      system: p.checkSystem,
      schema: p.checkSchema,
      where: 'buddy/check.ts',
    },
    {
      purpose: 'transcribe',
      profile: '-',
      tier: 'smart',
      promptVersion: voice.TRANSCRIBE_PROMPT_VERSION,
      system: voice.SYSTEM,
      schema: voice.SCHEMA,
      where: 'voice/service.ts',
    },
    {
      purpose: 'consolidate',
      profile: '-',
      tier: 'smart',
      promptVersion: consolidate.CONSOLIDATE_PROMPT_VERSION,
      system: consolidate.SYSTEM,
      schema: consolidate.SCHEMA,
      where: 'buddy/consolidate.ts',
    },
    {
      purpose: 'summary',
      profile: '-',
      tier: 'fast',
      promptVersion: summarise.SUMMARY_PROMPT_VERSION,
      system: summarise.SYSTEM,
      schema: summarise.SCHEMA,
      where: 'buddy/summarise.ts',
    },
  ];
}

/** Every schema the running build sends: the core's, then each registered domain's. */
export function sentSchemas(): SentSchema[] {
  return [...coreSchemas(), ...sources.flatMap((source) => source())];
}
