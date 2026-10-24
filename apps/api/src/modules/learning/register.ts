// The learning domain announces itself to the generic Buddy (issue #107, docs/buddy-kit.md
// §Modulgrenzen). The core declares what the model can call; it never names practice,
// worksheets, talks or roleplays. Everything of theirs that the core runs is registered here,
// in this one place and in this order — app start-up (`createApp`) calls `registerLearning()`
// once and then checks that nothing the core declares is left without its code.

import { configCheck } from '../../config.js';
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
import { registerWaitingStart } from '../buddy/offers.js';
import { runPreparePractice, runShowReady } from '../buddy/practiceTool.js';
import { REVIEW_REASONS, reviewAfterBreak, reviewNextDay, runReviews } from '../buddy/review.js';
import { registerContextProvider, type ContextProvider } from '../buddy/provider.js';
import { registerSentSchemas } from '../buddy/schemas.js';
import { endForConcern, runStartRoleplay } from '../buddy/roleplay.js';
import { registerStepStarter } from '../buddy/stepStart.js';
import { runOfferRehearsal, runPlanTalk } from '../buddy/talkTools.js';
import { registerActTools } from '../buddy/registry.js';
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
import { dressThread, lastActed, learningHome, pollAfter } from './home.js';
import { runShowFigure } from './chatFigure.js';
import { LEARNING_ACT_TOOLS } from './actTools.js';
import { formsOffIssues } from './config.js';
import { learningCheck } from './check.js';
import { LEARNING_LOOKUPS } from './lookups.js';
import { findLearningLookBack } from './lookback.js';
import { LEARNING_PRIVACY_TABLES, purgeOfferCounters } from './privacy.js';
import { LEARNING_STYLE_RULES, LEARNING_TURN_RULES } from './prompt.js';
import { learningSchemas } from './schemas.js';
import { learningBuddyRoutes } from './routes.js';
import {
  findOrCreateSubject,
  loadLearningState,
  readySheet,
  sheetPractice,
  subjectNames,
} from './state.js';
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
    topicKeyAliases: { f: 'subjects', sh: 'materials' },
    sections: LEARNING_SECTIONS,
    render: renderLearning,
    turnRules: LEARNING_TURN_RULES,
    styleRules: LEARNING_STYLE_RULES,
  },
  subjects: {
    names: subjectNames,
    ofAlias: (aliases, alias) => aliases.subjects.get(alias)?.id ?? null,
    findOrCreate: findOrCreateSubject,
  },
  home: { screen: learningHome, lastActed, pollAfter, thread: dressThread },
  turn: {
    mode: roleplayMode,
    lookAhead: preInjectedPassages,
    checkReply: homeworkLeak,
    applied: prepareOffered,
    concern: endForConcern,
  },
  check: learningCheck,
  lookBack: findLearningLookBack,
  readySheet,
  sheetPractice,
  undo: { applies: renameBackApplies, run: renameBack },
};

// Its job kinds (scheduler/jobs.ts `DomainJobKinds`): reading her photos, erasing a sheet's
// photos and content — run by what registerLearning registers below.
declare module '../scheduler/jobs.js' {
  interface DomainJobKinds {
    extract_material: true;
    purge_photos: true;
    purge_content: true;
  }
}

let registered = false;

/** Registers the learning domain into the core; a second call changes nothing. */
export function registerLearning(): void {
  if (registered) return;
  registered = true;

  // What Buddy knows of it, says about it and shows of it — registered first: the prompt and
  // every state are built from it.
  registerContextProvider(LEARNING);
  // Its names in the configuration (FORMS_OFF): checked before the app serves anything.
  configCheck(formsOffIssues);

  // The practice that waits, when Buddy points to it (open_area practice, issue #630).
  registerWaitingStart(runShowReady);
  // What Buddy can do in the conversation: practice, sheets, talks, roleplays — the tools as the
  // model reads them, each at its place among the core's (cut 7b), and their code.
  registerActTools(LEARNING_ACT_TOOLS);
  registerActHandlers({
    show_figure: runShowFigure,
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
    { kind: 'purge_photos', lane: 'erasure', run: purgePhotos, persistent: true },
    { kind: 'purge_content', lane: 'erasure', run: purgeContent, persistent: true },
  );
  registerTickWork(
    { recover: recoverReadings },
    { closeIdle: closeIdleSessions },
    { sweep: { key: 'swept_photos', run: sweepForgottenPhotos } },
    { sweep: { key: 'offer_counters', run: purgeOfferCounters } },
  );

  // Its proactivity: the offers to review and what wakes them, ten minutes of her questions
  // for a practice step no model planned.
  registerOccasions({ reasons: REVIEW_REASONS, run: runReviews });
  subscribe('material_ready', reviewNextDay);
  subscribe('session_finished', reviewAfterBreak);
  registerPracticeFiller(tenMinutesOf);

  // What it keeps about her: in her export, and gone with her account — children first.
  registerPrivacyTables(...LEARNING_PRIVACY_TABLES);

  // What its model calls send, for the schema budget and the model canary (issue #650).
  registerSentSchemas(learningSchemas);
}
