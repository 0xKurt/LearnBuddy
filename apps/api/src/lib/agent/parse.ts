// Strict parser for the agent's JSON output.
//
// The model is told to emit exactly one JSON object matching this shape.
// We never trust the LLM blindly — every field is validated. Malformed
// output defaults to a SAFE FALLBACK ('incorrect', no advance, no
// reveal) rather than throwing, so a single bad reply doesn't kill the
// conversation.

import type { AgentIntent, AgentVerdict } from './types.js';

export type AgentResponseJson = {
  reply: string;
  verdict: AgentVerdict | null;
  advance: boolean;
  reveal: boolean;
  hint_given: boolean;
  intent: AgentIntent;
};

const VERDICTS = ['correct', 'partially_correct', 'incorrect', 'skipped'] as const;
const INTENTS = [
  'evaluate',
  'hint',
  'reveal',
  'praise_and_advance',
  'introduce_next',
  'give_up_scaffold',
  'explain',
  'redirect',
  'break_suggest',
] as const;

export function parseAgentJson(raw: unknown): AgentResponseJson {
  const safe: AgentResponseJson = {
    reply: '',
    verdict: 'incorrect',
    advance: false,
    reveal: false,
    hint_given: false,
    intent: 'evaluate',
  };
  if (!raw || typeof raw !== 'object') return safe;
  const obj = raw as Record<string, unknown>;

  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
  const verdictRaw = obj.verdict;
  let verdict: AgentVerdict | null = 'incorrect';
  if (verdictRaw === null) verdict = null;
  else if (typeof verdictRaw === 'string' && (VERDICTS as readonly string[]).includes(verdictRaw)) {
    verdict = verdictRaw as AgentVerdict;
  }
  const advance = obj.advance === true;
  const reveal = obj.reveal === true;
  const hint_given = obj.hint_given === true;
  let intent: AgentIntent = 'evaluate';
  if (typeof obj.intent === 'string' && (INTENTS as readonly string[]).includes(obj.intent)) {
    intent = obj.intent as AgentIntent;
  }

  // Server-side invariants the model occasionally violates.
  // Reveal can never carry a positive verdict.
  let finalVerdict = verdict;
  if (reveal && (finalVerdict === 'correct' || finalVerdict === 'partially_correct')) {
    finalVerdict = 'skipped';
  }

  return {
    reply: reply || safe.reply,
    verdict: finalVerdict,
    advance,
    reveal,
    hint_given,
    intent,
  };
}
