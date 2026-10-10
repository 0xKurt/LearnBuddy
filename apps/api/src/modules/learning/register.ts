// The learning domain announces itself to the generic Buddy (issue #107, docs/buddy-kit.md
// §Modulgrenzen). The core declares what the model can call; it never names practice,
// worksheets, talks or roleplays. Everything of theirs that the core runs is registered here,
// in this one place and in this order — app start-up (`createApp`) calls `registerLearning()`
// once and then checks that nothing the core declares is left without its code.

import { registerRoutes } from '../../http/plugins.js';
import { preInjectedPassages } from '../buddy/connectors/material.js';
import { subscribe } from '../buddy/events.js';
import { registerLookups } from '../buddy/lookups.js';
import {
  renameBack,
  renameBackApplies,
  runDeleteItem,
  runDeleteMaterial,
  runRenameMaterial,
  runRequestMaterial,
} from '../buddy/materialTools.js';
import { registerOccasions, registerPracticeFiller } from '../buddy/occasions.js';
import { runPreparePractice } from '../buddy/practiceTool.js';
import { REVIEW_REASONS, reviewAfterBreak, reviewNextDay, runReviews } from '../buddy/review.js';
import { registerContextProvider, type ContextProvider } from '../buddy/provider.js';
import { endForConcern, runStartRoleplay } from '../buddy/roleplay.js';
import { registerStepStarter } from '../buddy/stepStart.js';
import { runOfferRehearsal, runPlanTalk } from '../buddy/talkTools.js';
import { registerActHandlers } from '../buddy/tools.js';
import { purgeContent, purgePhotos, sweepForgottenPhotos } from '../materials/purge.js';
import { runExtraction } from '../materials/reading.js';
import { recoverReadings } from '../materials/readingJob.js';
import { materialRoutes } from '../materials/routes.js';
import { closeIdleSessions } from '../practice/lifecycle.js';
import { runOfferDrill, runOfferLearning } from '../practice/offerTools.js';
import { prepareOffered } from '../practice/prepare.js';
import { practiceRoutes } from '../practice/routes.js';
import { tenMinutesOf } from '../practice/selection.js';
import { startFromStep } from '../practice/service.js';
import { registerPrivacyTables } from '../identity/privacyTables.js';
import { registerJobKinds, registerTickWork } from '../scheduler/registry.js';
import { LEARNING_SECTIONS, levelOf, renderLearning } from './context.js';
import { dressThread, lastActed, learningHome } from './home.js';
import { LEARNING_LOOKUPS } from './lookups.js';
import { findLearningLookBack } from './lookback.js';
import { LEARNING_PRIVACY_TABLES } from './privacy.js';
import { LEARNING_TURN_RULES } from './prompt.js';
import { learningBuddyRoutes } from './routes.js';
import { findOrCreateSubject, loadLearningState, readySheet, subjectNames } from './state.js';
import { homeworkLeak, roleplayMode } from './turn.js';

/**
 * Its part of what Buddy knows, says and shows (buddy/provider.ts): her subjects, sheets and
 * practice in his state and STATE, its rules in the prompt, its cards on the home screen, the
 * roleplay as a mode of the turn, the passages of her sheets, the homework guard, the look-backs.
 */
const LEARNING: ContextProvider = {
  state: {
    load: loadLearningState,
    level: levelOf,
    noAliases: () => ({ subjects: new Map(), materials: new Map() }),
    topicKeyAliases: { f: 'subjects' },
    sections: LEARNING_SECTIONS,
    render: renderLearning,
    turnRules: LEARNING_TURN_RULES,
  },
  subjects: { names: subjectNames, findOrCreate: findOrCreateSubject },
  home: { screen: learningHome, lastActed, thread: dressThread },
  turn: {
    mode: roleplayMode,
    lookAhead: preInjectedPassages,
    checkReply: homeworkLeak,
    applied: prepareOffered,
    concern: endForConcern,
  },
  lookBack: findLearningLookBack,
  readySheet,
  undo: { applies: renameBackApplies, run: renameBack },
};

let registered = false;

/** Registers the learning domain into the core; a second call changes nothing. */
export function registerLearning(): void {
  if (registered) return;
  registered = true;

  // What Buddy knows of it, says about it and shows of it — registered first: the prompt and
  // every state are built from it.
  registerContextProvider(LEARNING);

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
  registerLookups(...LEARNING_LOOKUPS);

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

  // What it keeps about her: in her export, and gone with her account — children first.
  registerPrivacyTables(...LEARNING_PRIVACY_TABLES);
}
