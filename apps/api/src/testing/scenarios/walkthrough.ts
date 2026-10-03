// Every scenario of the browser walkthrough on one scripted model (dev-stack.ts). One place, so
// the guard against order-dependent specs (`__tests__/walkthrough.test.ts`, issue #350) checks
// exactly what the walkthrough runs.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { ScriptedGateway } from '../fakes.js';
import { installChecks } from './checks.js';
import { scriptCloze } from './cloze.js';
import { scriptCoreLoop } from './core-loop.js';
import { scriptDictation } from './dictation.js';
import { scriptDrill } from './drill.js';
import { scriptFigures } from './figures.js';
import { installGenerations } from './generations.js';
import { scriptLearningModes } from './learning-modes.js';
import { scriptRoleplay } from './roleplay.js';
import { pronounceRules, readingRules, tutorRules } from './rules.js';
import { scriptTimedTest } from './timedTest.js';
import { scriptTour } from './tour.js';
import { installTurns } from './turns.js';

/** Adds every scenario's rules and installs the dispatchers. Call it once per process. */
export function scriptWalkthrough(scripted: ScriptedGateway): void {
  // First: its generation rule is keyed on her list, and a broader rule registered earlier
  // ("Bruch" anywhere in the request) would otherwise answer it (issue #242).
  scriptDictation();
  scriptCoreLoop();
  // Before the learning modes: their "probetest" sentence would answer this one too (#241).
  scriptTimedTest();
  scriptLearningModes(scripted);
  scriptTour();
  scriptFigures();
  scriptCloze();
  scriptDrill();
  scriptRoleplay(scripted);
  // Every answer is matched by what the request says — what the learner wrote, what was asked
  // for, why Buddy checks, which question, which photo — so one spec cannot shift the answers
  // of the next (issues #81, #350). Installed after every scenario added its rules.
  installTurns(scripted);
  installGenerations(scripted);
  installChecks(scripted);
  tutorRules.install(scripted);
  readingRules.install(scripted);
  pronounceRules.install(scripted);
  // A conversation that came to rest is summarised by the scheduler (issue #22); in the
  // walkthrough nobody asks for those sentences, so one answer for all of them is enough.
  scripted.byDefault('summary', {
    json: { summary: 'Sie hat mit Buddy geübt und Fragen gestellt.', topics: ['Üben'] },
  });
}
