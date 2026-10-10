// The learning domain announces itself to the generic Buddy (issue #107, docs/buddy-kit.md
// §Modulgrenzen). The core declares what the model can call; it never names practice,
// worksheets, talks or roleplays. Everything of theirs that the core runs is registered here,
// in this one place and in this order — app start-up (`createApp`) calls `registerLearning()`
// once and then checks that nothing the core declares is left without its code.

import { findQuestions, recentResults } from '../buddy/connectors/practice.js';
import { searchMaterials } from '../buddy/connectors/material.js';
import { registerLookupRunners } from '../buddy/lookups.js';
import {
  runDeleteItem,
  runDeleteMaterial,
  runRenameMaterial,
  runRequestMaterial,
} from '../buddy/materialTools.js';
import { runPreparePractice } from '../buddy/practiceTool.js';
import { runStartRoleplay } from '../buddy/roleplay.js';
import { runOfferRehearsal, runPlanTalk } from '../buddy/talkTools.js';
import { registerActHandlers } from '../buddy/tools.js';
import { runOfferDrill, runOfferLearning } from '../practice/offerTools.js';

let registered = false;

/** Registers the learning domain into the core; a second call changes nothing. */
export function registerLearning(): void {
  if (registered) return;
  registered = true;

  // What Buddy can do in the conversation: practice, sheets, talks, roleplays.
  registerActHandlers({
    prepare_practice: runPreparePractice,
    request_material: runRequestMaterial,
    delete_material: runDeleteMaterial,
    rename_material: runRenameMaterial,
    delete_item: runDeleteItem,
    offer_learning: runOfferLearning,
    offer_drill: runOfferDrill,
    start_roleplay: runStartRoleplay,
    plan_talk: runPlanTalk,
    offer_rehearsal: runOfferRehearsal,
  });

  // What Buddy can read before he answers: her sheets, her practice, her questions.
  registerLookupRunners({
    search_material: (c, a) =>
      searchMaterials(c.deps, c.learnerId, c.timezone, a.query, 3, c.aliases),
    practice_history: (c, a) => recentResults(c.deps.db, c.learnerId, c.timezone, a.topic, 6),
    find_questions: (c, a) => findQuestions(c.deps.db, c.learnerId, a.query, 8),
  });
}
