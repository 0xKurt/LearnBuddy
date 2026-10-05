// A prompt's version, derived from what it sends (issue #425): `generate.3f9a2c1d` — a readable
// name and the first 8 hex digits of a SHA-256 over the fixed parts of the prompt (its system
// text, its response schemas, the fixed text around what the learner wrote). The same bytes give
// the same version; any other byte gives another.
//
// Before, every prompt change bumped a hand-counted number in one line (`generate.v1.41`). Two
// branches that both changed a prompt always collided in that line, and after a merge one number
// named two different prompts. Now a merge needs nothing: the version follows the merged text.
// What changed when is in the git log of the file that holds the prompt (docs/architecture.md
// §Prompt versions). Telemetry (`llm_calls.prompt_version`, `buddy_decisions.prompt_version`) and
// the evals keep reading the version as before; nothing orders versions, they are only compared.
//
// The parts are hashed in their order and with their objects' key order as built — the order of a
// schema's fields is part of what the model gets (`stream.ts` reads the fields before `reply`).

import { createHash } from 'node:crypto';

/** How many hex digits of the hash the version keeps: 32 bits, plenty for a few dozen prompts. */
const DIGITS = 8;

export function promptVersion(name: string, ...parts: readonly unknown[]): string {
  const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${name}.${hash.slice(0, DIGITS)}`;
}
