// Scripted model answers for the browser walkthrough of tasks with several parts (issue #297,
// tests/web/complex.spec.ts). Keyed by what the learner wrote and, for the photographed sheet, by
// her age in the reading request — never by order (issue #81). The model writes only what it
// writes in production: the material, the parts, their keys and calculations; the server checks
// them (Regel 0), names the parts and keeps the keys.
//
// Five subjects, as the issue asks: Physik and Mathe written by Buddy (Mathe with a graph in its
// material), Deutsch written by Buddy, Chemie and Geschichte read from a photo.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { LlmError, type LlmRequest } from '../../llm/gateway.js';
import { CHEMIE, DEUTSCH, GESCHICHTE, MATHE, PHYSIK } from '../complex-tasks.js';
import { ScriptedGateway } from '../fakes.js';
import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

/** The walkthrough's learner is 15 (class 10); no other spec onboards anyone that age. */
export const COMPLEX_LEARNER_AGE = /LEARNER: 1[56] years/;

const isHers = (req: LlmRequest) => COMPLEX_LEARNER_AGE.test(ScriptedGateway.textOf(req));

export function scriptComplexTasks(llm: ScriptedGateway): void {
  scriptTurns(
    {
      when: /physik und mathe/i,
      answer: says('Gern – zwei Aufgaben wie in der Arbeit, mit Material und Teilaufgaben.', [
        {
          tool: 'offer_learning',
          args: { kind: 'complex', text: 'Physik und Mathe wie in der Arbeit' },
        },
      ]),
    },
    {
      when: /deutsch wie in der arbeit/i,
      answer: says('Gern – eine Textaufgabe wie in der Deutscharbeit.', [
        { tool: 'offer_learning', args: { kind: 'complex', text: 'Deutsch wie in der Arbeit' } },
      ]),
    },
  );

  scriptGenerations(
    {
      when: /Physik und Mathe wie in der Arbeit/,
      answer: () => ({
        usable: true,
        title: 'Physik und Mathe',
        subject: { name: 'Physik', kind: 'physics' },
        complex: [MATHE, PHYSIK],
      }),
    },
    {
      when: /Deutsch wie in der Arbeit/,
      answer: () => ({
        usable: true,
        title: 'Kurzgeschichte',
        subject: { name: 'Deutsch', kind: 'german' },
        complex: [DEUTSCH],
      }),
    },
  );

  // Her photographed sheet: two tasks with material, as printed (the figure is no part of a
  // sheet's reading, #281). Answered for her reading only, whenever it happens.
  llm.scriptWhen('extraction', (req) =>
    isHers(req)
      ? {
          json: {
            is_learning_material: true,
            readable: true,
            pages: [{ page: 1, read: 'all', problem: null }],
            title: 'Übung Klassenarbeit',
            subject: { name: 'Chemie', kind: 'chemistry' },
            extracted_text: [...CHEMIE.lines, '', ...GESCHICHTE.lines].join('\n'),
            items: [],
            structured: [],
            reading: [],
            complex: [
              { ...CHEMIE, figure: undefined },
              { ...GESCHICHTE, figure: undefined },
            ],
          },
        }
      : undefined,
  );
  // The open part of the bike task (begründe …) goes to the tutor, who sees the material and her
  // earlier answers (`tutorMaterial`); keyed by exactly that, so no other spec's tutor is touched.
  llm.scriptWhen('tutor', (req) => {
    const text = ScriptedGateway.textOf(req);
    return /THIS IS PART c\) OF 3/.test(text) && /Lena fährt mit dem Rad/.test(text)
      ? {
          json: {
            intent: 'answer',
            verdict: 'correct',
            reply: 'Genau – die Geschwindigkeit steht im Quadrat, also 2² = 4.',
            gave_hint: false,
            revealed_answer: false,
          },
        }
      : undefined;
  });
  // Buddy's look at her ready sheet: the model is "unavailable", so the check takes its own path —
  // the one that prepares the sheet's practice and says so (`buddy/check.ts`, material_ready).
  // Keyed to her, so no queued check of another spec is spent on it.
  llm.scriptWhen('buddy_check', (req) =>
    /Name: Jana\b/.test(ScriptedGateway.textOf(req))
      ? { error: new LlmError('unavailable', 'scripted: no model for this check') }
      : undefined,
  );
}
