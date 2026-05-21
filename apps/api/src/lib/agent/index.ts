// Version-aware tutor agent. v3 is the new default; v2 stays reachable
// via env override AGENT_PROMPT_VERSION_OVERRIDE='v2' so we can flip
// back without a redeploy if a regression surfaces in production.

export {
  buildAgentSystemInstruction as buildAgentSystemInstructionV2,
  AGENT_PROMPT_VERSION as AGENT_PROMPT_VERSION_V2,
} from './prompt.js';
export { buildAgentSystemInstructionV3, AGENT_PROMPT_VERSION_V3 } from './prompt-v3.js';
export type {
  AgentVerdict,
  AgentIntent,
  AgentItemContext,
  AgentThreadMessage,
  AgentTurnInput,
  AgentTurnOutput,
  SubjectKind,
} from './types.js';
export { parseAgentJson, type AgentResponseJson } from './parse.js';

import { buildAgentSystemInstruction, AGENT_PROMPT_VERSION } from './prompt.js';
import { buildAgentSystemInstructionV3, AGENT_PROMPT_VERSION_V3 } from './prompt-v3.js';
import type { AgentTurnInput } from './types.js';

/** Re-export the constant the rest of the code base imports for
 *  back-compat. Points at v3 by default. */
export { AGENT_PROMPT_VERSION_V3 as AGENT_PROMPT_VERSION };

/** Single entry point: pick the prompt version, build the system
 *  instruction. The version comes from
 *  env.AGENT_PROMPT_VERSION_OVERRIDE ('v2' | 'v3'); default v3. */
export function buildAgentSystemInstructionForVersion(
  version: 'v2' | 'v3',
  input: AgentTurnInput,
): { instruction: string; version: string } {
  if (version === 'v2') {
    return { instruction: buildAgentSystemInstruction(input), version: AGENT_PROMPT_VERSION };
  }
  return { instruction: buildAgentSystemInstructionV3(input), version: AGENT_PROMPT_VERSION_V3 };
}
