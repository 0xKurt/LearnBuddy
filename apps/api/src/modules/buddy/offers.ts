// Buddy's offer to open a part of the app she asks for (`open_area`, docs/architecture.md §Tools):
// a button in the conversation that changes nothing. The offers to learn (`offer_learning`,
// `offer_drill`) are the learning domain's (practice/offerTools.ts, issue #107).

import { type ActionOf } from './decision.js';
import type { ToolContext, ToolOutcome } from './toolKit.js';

/** A button that opens a part of the app she asks for; it changes nothing (docs §Tools). */
export async function runOpenArea(
  action: ActionOf<'open_area'>,
  _ctx: ToolContext,
): Promise<ToolOutcome> {
  return { summary: { tool: 'open_area', area: action.args.area }, undo: null };
}
