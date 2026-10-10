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

import type { ActionOf, ToolName } from './decision.js';
import { runCloseGoal, runPlanExam, runSetLevel, runUpdateGoal } from './goalTools.js';
import {
  runDeleteItem,
  runDeleteMaterial,
  runRenameMaterial,
  runRequestMaterial,
} from './materialTools.js';
import { runCorrectMemory, runForget, runRemember } from './memoryTools.js';
import { runOfferDrill, runOfferLearning, runOpenArea } from './offers.js';
import { runPreparePractice } from './practiceTool.js';
import { runStartRoleplay } from './roleplay.js';
import { runOfferRehearsal, runPlanTalk } from './talkTools.js';
import { runScheduleCheck, runSetContact, runSetVoice } from './settingsTools.js';
import { runMarkStepDone, runPlanStep, runUpdateStep } from './stepTools.js';
import type { ToolContext, ToolOutcome } from './toolKit.js';

/** One handler per act tool (the registry in registry.ts attaches them to their schemas). */
export const ACT_HANDLERS: {
  [K in ToolName]: (action: ActionOf<K>, ctx: ToolContext) => Promise<ToolOutcome>;
} = {
  remember: runRemember,
  correct_memory: runCorrectMemory,
  forget: runForget,
  set_level: runSetLevel,
  plan_exam: runPlanExam,
  update_goal: runUpdateGoal,
  close_goal: runCloseGoal,
  prepare_practice: runPreparePractice,
  plan_step: runPlanStep,
  update_step: runUpdateStep,
  mark_step_done: runMarkStepDone,
  request_material: runRequestMaterial,
  delete_material: runDeleteMaterial,
  rename_material: runRenameMaterial,
  delete_item: runDeleteItem,
  set_contact: runSetContact,
  set_voice: runSetVoice,
  offer_learning: runOfferLearning,
  offer_drill: runOfferDrill,
  open_area: runOpenArea,
  schedule_check: runScheduleCheck,
  start_roleplay: runStartRoleplay,
  plan_talk: runPlanTalk,
  offer_rehearsal: runOfferRehearsal,
};
