// Buddy's tools: the only way a model decision changes anything.
// docs/architecture.md §Tools.
//
// Each tool validates its arguments against the CURRENT database state
// (inside the decision's transaction), applies a bounded internal change,
// and returns a summary for the card plus what is needed to undo it. A
// ToolRejection aborts the whole decision (nothing is applied) and its
// message goes back to the model for one repair round.
//
// Enforced here, not in the prompt: aliases resolve to this learner only;
// quotes must be whole words from what the learner wrote since Buddy's last answer; dates are resolved from
// DaySpec/UntilSpec in the learner's zone and must lie in the allowed range;
// agreed times may not fall into quiet hours; contact can only be reduced or
// shifted, never turned on or increased.
//
// The handlers of every Buddy (memory, goals, steps, settings, opening a part of the app) stand
// below. A domain's tools — practice, sheets, talks, roleplays — register their handlers at start-up
// (issue #107, `modules/learning/register.ts`); this module never names them.

import { ACT_SCHEMAS, type ActionOf, type ToolName } from './decision.js';
import { runCloseGoal, runPlanExam, runSetLevel, runUpdateGoal } from './goalTools.js';
import { runCorrectMemory, runForget, runRemember } from './memoryTools.js';
import { runOpenArea } from './offers.js';
import { runScheduleCheck, runSetContact, runSetVoice } from './settingsTools.js';
import { runMarkStepDone, runPlanStep, runUpdateStep } from './stepTools.js';
import type { ToolContext, ToolOutcome } from './toolKit.js';

type ActHandler<K extends ToolName> = (
  action: ActionOf<K>,
  ctx: ToolContext,
) => Promise<ToolOutcome>;

/** Handlers by tool name; the registry in registry.ts attaches them to their schemas. */
export type ActHandlers = { [K in ToolName]?: ActHandler<K> };

const handlers: ActHandlers = {
  remember: runRemember,
  correct_memory: runCorrectMemory,
  forget: runForget,
  set_level: runSetLevel,
  plan_exam: runPlanExam,
  update_goal: runUpdateGoal,
  close_goal: runCloseGoal,
  plan_step: runPlanStep,
  update_step: runUpdateStep,
  mark_step_done: runMarkStepDone,
  set_contact: runSetContact,
  set_voice: runSetVoice,
  open_area: runOpenArea,
  schedule_check: runScheduleCheck,
};

/** A domain adds the handlers of its tools. A tool has exactly one handler: a second one throws. */
export function registerActHandlers(more: ActHandlers): void {
  const names = Object.keys(more) as ToolName[];
  const twice = names.filter((n) => handlers[n] !== undefined);
  if (twice.length > 0) throw new Error(`act tool registered twice: ${twice.join(', ')}`);
  Object.assign(handlers, more);
}

/** Tools the model can call (decision.ts) that nobody registered a handler for. */
export function missingActHandlers(): ToolName[] {
  return (Object.keys(ACT_SCHEMAS) as ToolName[]).filter((n) => handlers[n] === undefined);
}

/** The handler of one tool; start-up checked that every tool has one (`missingActHandlers`). */
export function actHandler<K extends ToolName>(name: K): ActHandler<K> {
  const handler = handlers[name];
  if (!handler) throw new Error(`act tool ${name} has no handler`);
  return handler as ActHandler<K>;
}
