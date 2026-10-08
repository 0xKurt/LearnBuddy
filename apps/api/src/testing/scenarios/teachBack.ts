// Scripted model answers for the „Erklär mal" walkthrough (tests/web/teach-back.spec.ts, issue
// #236): she asks Buddy to quiz her on photosynthesis, Buddy offers it, the generator writes one
// open question with three key points, and the tutor judges her explanation point by point. The
// quotes it returns are cut out of what she actually typed, so the server's quote check runs for
// real; what she reads is built by code (`practice/rubric.ts`).
// Test tooling only; answers are keyed by the request's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { tutorRules, type Rule } from './rules.js';
import { latestLearnerText, says, scriptTurns } from './turns.js';

const QUESTION = 'Erklär mir, wie die Fotosynthese funktioniert.';

/** The words of hers that carry a point, as they stand in what she typed — or none. */
function quoteOf(said: string, word: RegExp): string | null {
  const m = word.exec(said);
  return m ? m[0] : null;
}

export function scriptTeachBack(): void {
  scriptTurns({
    when: /frag mich .*fotosynthese/i,
    answer: says('Gern – erklär mir die Fotosynthese, ich frag nach, wo etwas fehlt.', [
      { tool: 'offer_learning', args: { kind: 'teach_back', text: 'Fotosynthese' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nFotosynthese/,
    answer: () => ({
      usable: true,
      title: 'Fotosynthese',
      subject: { name: 'Biologie', kind: 'biology' },
      teach_back: [
        {
          prompt: QUESTION,
          topic: 'Fotosynthese',
          difficulty: 2,
          points: [
            {
              name: 'Licht',
              point: 'Licht liefert die Energie',
              ask: 'Woher kommt die Energie dafür?',
              exact: [],
            },
            {
              name: 'Ausgangsstoffe',
              point: 'aus Kohlendioxid und Wasser entstehen Zucker und Sauerstoff',
              ask: 'Was braucht die Pflanze dafür, und was entsteht?',
              exact: [],
            },
            {
              name: 'Ort',
              point: 'findet in den Chloroplasten statt',
              ask: 'Und wo in der Zelle passiert das?',
              exact: [],
            },
          ],
        },
        // A second question, so the run goes on after the first explanation is complete.
        {
          prompt: 'Erklär mir, warum Pflanzen ohne Licht nicht wachsen.',
          topic: 'Fotosynthese',
          difficulty: 3,
          points: [
            {
              name: 'Energie',
              point: 'ohne Licht keine Energie für die Fotosynthese',
              ask: 'Was fehlt der Pflanze im Dunkeln?',
              exact: [],
            },
            {
              name: 'Zucker',
              point: 'ohne Fotosynthese entsteht kein Zucker',
              ask: 'Was kann sie dann nicht herstellen?',
              exact: [],
            },
            {
              name: 'Wachstum',
              point: 'der Zucker ist ihr Baustoff zum Wachsen',
              ask: 'Wofür braucht sie den Zucker?',
              exact: [],
            },
          ],
        },
      ],
    }),
  });
  tutorRules.add(
    judgedBy(/Erklär mir, wie die Fotosynthese funktioniert/, [
      ['r1', /Licht[^.]*Energie/i],
      ['r2', /Wasser und Kohlendioxid[^.]*/i],
      ['r3', /Chloroplasten/i],
    ]),
    judgedBy(/Erklär mir, warum Pflanzen ohne Licht nicht wachsen/, [
      ['r1', /keine Energie/i],
      ['r2', /keinen Zucker/i],
      ['r3', /zum Wachsen/i],
    ]),
  );
}

/**
 * The tutor for one question: a point is met when her latest words carry it, and the quote is cut
 * out of those very words — only the points the request asks about are answered.
 */
export function judgedBy(question: RegExp, claims: ReadonlyArray<readonly [string, RegExp]>): Rule {
  return {
    when: question,
    answer: (req) => {
      const said = latestLearnerText(req);
      const asked = (ref: string) =>
        req.contents.some((c) => c.parts.some((p) => 'text' in p && p.text.includes(`${ref} "`)));
      return {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Schon gut erklärt.',
        gave_hint: false,
        revealed_answer: false,
        elements: claims
          .filter(([ref]) => asked(ref))
          .map(([ref, word]) => {
            const quote = quoteOf(said, word);
            return { element: ref, met: quote !== null, quote: quote ?? '', verbs: [] };
          }),
      };
    },
  };
}
