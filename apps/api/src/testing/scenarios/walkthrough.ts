// Every scenario of the browser walkthrough on one scripted model (dev-stack.ts). One place, so
// the guard against order-dependent specs (`__tests__/walkthrough.test.ts`, issue #350) checks
// exactly what the walkthrough runs.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { ScriptedGateway } from '../fakes.js';
import { scriptAsk } from './ask.js';
import { scriptCards } from './cards.js';
import { scriptCircuits } from './circuits.js';
import { installChecks } from './checks.js';
import { scriptCloze } from './cloze.js';
import { scriptCoreLoop } from './core-loop.js';
import { scriptDiagrams } from './diagrams.js';
import { scriptDictation } from './dictation.js';
import { scriptDrill } from './drill.js';
import { scriptEssay } from './essay.js';
import { scriptFigures } from './figures.js';
import { installGenerations } from './generations.js';
import { scriptGrid } from './grid.js';
import { scriptHelp } from './help.js';
import { scriptLearningModes } from './learning-modes.js';
import { scriptMark } from './mark.js';
import { scriptPeriodic } from './periodic.js';
import { scriptPrimary } from './primary.js';
import { scriptReading } from './reading.js';
import { scriptRoleplay } from './roleplay.js';
import { scriptSolids } from './solids.js';
import { scriptSources } from './sources.js';
import { scriptMap } from './map.js';
import { scriptSchematic } from './schematic.js';
import { scriptTap } from './tap.js';
import { hintRules, pronounceRules, readingRules, tutorRules } from './rules.js';
import { scriptSelectAll } from './selectAll.js';
import { scriptTimedTest } from './timedTest.js';
import { scriptTour } from './tour.js';
import { scriptTeachBack } from './teachBack.js';
import { scriptTrees } from './trees.js';
import { installTurns } from './turns.js';
import { scriptWritten } from './written.js';

/** Adds every scenario's rules and installs the dispatchers. Call it once per process. */
export function scriptWalkthrough(scripted: ScriptedGateway): void {
  // First of all: her questions in practice (#402) stand in requests about the pie chart and the
  // order, whose own words an older, broader rule may know.
  scriptAsk();
  // Keyed by her own words ("Frosch", "Kröte"): the flashcards and her question on a card (#384).
  scriptCards();
  // Early too: "Zahlenstrahl" and "Uhr" are words an older, broader rule may know (#248).
  scriptTap();
  scriptMap();
  scriptSchematic();
  // First: its generation rule is keyed on her list, and a broader rule registered earlier
  // ("Bruch" anywhere in the request) would otherwise answer it (issue #242).
  scriptDictation();
  // Also first: "Latein" and "Fahrrad" are words an older, broader rule may know (#240).
  scriptSelectAll();
  // Also first: "Nomen", "Kommas" and "Silben" are words an older rule may know (#234).
  scriptMark();
  // Also first: "schriftlich" and "Rechenweg" are words an older rule may know (#260).
  scriptWritten();
  // Also first: "Punkte", "Gerade" and "Säulen" are words an older rule may know (#249).
  scriptGrid();
  // Also first: "Malnehmen" and "Probetest" are words an older rule may know (#388).
  scriptHelp();
  // Also before the core loop: "Geld" and "Uhr" are everyday words its rules may know (#254).
  scriptPrimary();
  // Also before the core loop: "Kreislauf" and "Kette" are everyday words its rules may know (#247).
  scriptDiagrams();
  // Also before the core loop: "Farbe" and "Strom" are everyday words its rules may know (#261).
  scriptCircuits();
  // Before the core loop: "Fotosynthese" is a topic an older, broader rule may know (#236).
  scriptTeachBack();
  // Before the core loop too: "Schule" and "Handy" are everyday words its rules may know (#258).
  scriptEssay();
  scriptCoreLoop();
  // Before the learning modes: their "probetest" sentence would answer this one too (#241).
  scriptTimedTest();
  // Before the tour: both read the same photo fixture; hers is keyed by her age (#233).
  scriptReading();
  // Keyed by the ages 14 and 15, nobody else's; before the tour, which reads the same photo (#259).
  scriptSources();
  scriptLearningModes(scripted);
  scriptTour();
  scriptFigures();
  scriptTrees();
  scriptPeriodic();
  scriptSolids();
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
  hintRules.install(scripted);
  readingRules.install(scripted);
  pronounceRules.install(scripted);
  // A conversation that came to rest is summarised by the scheduler (issue #22); in the
  // walkthrough nobody asks for those sentences, so one answer for all of them is enough.
  scripted.byDefault('summary', {
    json: { summary: 'Sie hat mit Buddy geübt und Fragen gestellt.', topics: ['Üben'] },
  });
}
