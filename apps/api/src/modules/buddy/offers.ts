// Buddy's offer to open a part of the app she asks for (`open_area`, docs/architecture.md §Tools):
// a button in the conversation that changes nothing. The offers to learn (`offer_learning`,
// `offer_drill`) are the learning domain's (practice/offerTools.ts, issue #107).

import { type ActionOf } from './decision.js';
import { ToolRejection, type ToolContext, type ToolOutcome } from './toolKit.js';

/** What starts the practice that waits for her: the domain's (issue #630, like `stepStart.ts`). */
type WaitingStart = (ctx: ToolContext) => Promise<ToolOutcome>;
let waitingStart: WaitingStart | null = null;

/** The learning domain says what `open_area` practice shows (once, at start-up). */
export function registerWaitingStart(fn: WaitingStart): void {
  if (waitingStart !== null && waitingStart !== fn)
    throw new Error('open_area practice registered twice');
  waitingStart = fn;
}

/** A button that opens a part of the app she asks for; it changes nothing (docs §Tools). */
export async function runOpenArea(
  action: ActionOf<'open_area'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  // The practice that waits is a start, not a place: its own card (issue #630).
  if (action.args.area === 'practice') {
    if (waitingStart === null)
      throw new ToolRejection('there is no practice here to show — leave this action out');
    return waitingStart(ctx);
  }
  return { summary: { tool: 'open_area', area: action.args.area }, undo: null };
}
