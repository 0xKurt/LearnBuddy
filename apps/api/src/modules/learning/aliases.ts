// Her sheets as an action names them (issue #107): resolved from this learner's aliases only, the
// learning domain's part of STATE (DomainAliases, learning/state.ts).

import { ToolRejection, type ToolContext } from '../buddy/toolKit.js';

/** The sheet she named, from this learner's aliases only. */
export function materialOf(ctx: ToolContext, alias: string) {
  const m = ctx.aliases.materials.get(alias);
  if (!m)
    throw new ToolRejection(
      `there is no sheet ${alias} — STATE lists her sheets. Leave this action out instead of picking another`,
    );
  return m;
}
