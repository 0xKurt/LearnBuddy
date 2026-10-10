// The learning domain announces itself to the generic Buddy (issue #107, docs/buddy-kit.md
// §Modulgrenzen). The core declares what the model can call; it never names practice,
// worksheets, talks or roleplays. Everything of theirs that the core runs is registered here,
// in this one place and in this order — app start-up (`createApp`) calls `registerLearning()`
// once and then checks that nothing the core declares is left without its code.

import { registerRoutes } from '../../http/plugins.js';
import { searchMaterials } from '../buddy/connectors/material.js';
import { findQuestions, recentResults } from '../buddy/connectors/practice.js';
import { subscribe } from '../buddy/events.js';
import { registerLookupRunners } from '../buddy/lookups.js';
import {
  runDeleteItem,
  runDeleteMaterial,
  runRenameMaterial,
  runRequestMaterial,
} from '../buddy/materialTools.js';
import { registerOccasions, registerPracticeFiller } from '../buddy/occasions.js';
import { runPreparePractice } from '../buddy/practiceTool.js';
import { REVIEW_REASONS, reviewAfterBreak, reviewNextDay, runReviews } from '../buddy/review.js';
import { runStartRoleplay } from '../buddy/roleplay.js';
import { registerStepStarter } from '../buddy/stepStart.js';
import { runOfferRehearsal, runPlanTalk } from '../buddy/talkTools.js';
import { registerActHandlers } from '../buddy/tools.js';
import { purgeContent, purgePhotos, sweepForgottenPhotos } from '../materials/purge.js';
import { runExtraction } from '../materials/reading.js';
import { recoverReadings } from '../materials/readingJob.js';
import { materialRoutes } from '../materials/routes.js';
import { closeIdleSessions } from '../practice/lifecycle.js';
import { runOfferDrill, runOfferLearning } from '../practice/offerTools.js';
import { practiceRoutes } from '../practice/routes.js';
import { tenMinutesOf } from '../practice/selection.js';
import { startFromStep } from '../practice/service.js';
import { registerJobKinds, registerTickWork } from '../scheduler/registry.js';
import { learningBuddyRoutes } from './routes.js';

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

  // Its HTTP surface: practice runs, her sheets, and its taps on Buddy's surface.
  registerRoutes(
    { base: '/practice', routes: practiceRoutes },
    { base: '/materials', routes: materialRoutes },
    { base: '/buddy', routes: learningBuddyRoutes },
  );

  // A prepared step started from a phone message is a practice run.
  registerStepStarter(startFromStep);

  // Its background work: reading photos (a learner waits for it), erasing a sheet's photos and
  // content, the recovery of stuck readings, idle practice runs, forgotten photos.
  registerJobKinds(
    { kind: 'extract_material', lane: 'waiting', run: runExtraction },
    { kind: 'purge_photos', lane: 'erasure', run: purgePhotos },
    { kind: 'purge_content', lane: 'erasure', run: purgeContent },
  );
  registerTickWork(
    { recover: recoverReadings },
    { closeIdle: closeIdleSessions },
    { sweep: { key: 'swept_photos', run: sweepForgottenPhotos } },
  );

  // Its proactivity: the offers to review and what wakes them, ten minutes of her questions
  // for a practice step no model planned.
  registerOccasions({ reasons: REVIEW_REASONS, run: runReviews });
  subscribe('material_ready', reviewNextDay);
  subscribe('session_finished', reviewAfterBreak);
  registerPracticeFiller(tenMinutesOf);
}
