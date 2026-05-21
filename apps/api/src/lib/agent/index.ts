// Version-aware tutor agent. v3.1 is the new default — compressed
// version of v3 (same behaviour, ~half the prompt cost). v3 and v2
// stay reachable via env override for fast rollback without a
// redeploy if a regression surfaces in production.

export {
  buildAgentSystemInstruction as buildAgentSystemInstructionV2,
  AGENT_PROMPT_VERSION as AGENT_PROMPT_VERSION_V2,
} from './prompt.js';
export { buildAgentSystemInstructionV3, AGENT_PROMPT_VERSION_V3 } from './prompt-v3.js';
export { buildAgentSystemInstructionV3_1, AGENT_PROMPT_VERSION_V3_1 } from './prompt-v3_1.js';
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
import { buildAgentSystemInstructionV3_1, AGENT_PROMPT_VERSION_V3_1 } from './prompt-v3_1.js';
import type { AgentTurnInput } from './types.js';

export type AgentPromptVersion = 'v2' | 'v3' | 'v3.1';

/** Re-export the canonical constant the rest of the code base
 *  imports for back-compat. Points at v3.1 by default. */
export { AGENT_PROMPT_VERSION_V3_1 as AGENT_PROMPT_VERSION };

/** Single entry point: pick the prompt version, build the system
 *  instruction. The version comes from
 *  env.AGENT_PROMPT_VERSION_OVERRIDE ('v2' | 'v3' | 'v3.1'). */
export function buildAgentSystemInstructionForVersion(
  version: AgentPromptVersion,
  input: AgentTurnInput,
): { instruction: string; version: string } {
  if (version === 'v2') {
    return { instruction: buildAgentSystemInstruction(input), version: AGENT_PROMPT_VERSION };
  }
  if (version === 'v3') {
    return { instruction: buildAgentSystemInstructionV3(input), version: AGENT_PROMPT_VERSION_V3 };
  }
  return {
    instruction: buildAgentSystemInstructionV3_1(input),
    version: AGENT_PROMPT_VERSION_V3_1,
  };
}
