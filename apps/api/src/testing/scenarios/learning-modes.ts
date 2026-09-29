// Scripted model answers for the browser walkthrough of the learning modes
// (tests/web/modes.spec.ts), after the core loop: "Erklär mir …", homework
// help (hints only), a photo-free practice with math and a figure, and a
// practice test followed by "die wackligen nochmal".
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { ScriptedGateway } from '../fakes.js';
import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

function lastText(req: LlmRequest): string {
  const m = req.contents[req.contents.length - 1];
  const parts = m?.parts.flatMap((p) => ('text' in p ? [p.text] : [])) ?? [];
  return parts.join('\n');
}

export function scriptLearningModes(llm: ScriptedGateway): void {
  // "Erklär mir den Dativ" — since buddy.22 the explanation is the chat answer itself
  // (owner decision 28.09.); what can be started afterwards is practice on it.
  scriptGenerations({
    when: /Dativ/i,
    answer: () => ({
      usable: true,
      title: 'Der Dativ',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Mit welcher Frage findest du den Dativ?',
          answer: 'Wem?',
          choices: ['Wer?', 'Wen?', 'Wem?', 'Wessen?'],
          correct_choice: 2,
          topic: 'Dativ',
        },
        {
          ...base,
          kind: 'short',
          prompt: 'Ergänze: Ich helfe ___ Mutter.',
          answer: 'der',
          topic: 'Dativ',
        },
      ],
    }),
  });
  // Homework typed: 7 cm × 4 cm
  scriptGenerations({
    when: /Rechteck/i,
    answer: () => ({
      usable: true,
      title: 'Flächeninhalt Rechteck',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'numeric',
          prompt: 'Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.',
          answer: '28',
          unit: 'cm²',
          topic: 'Flächeninhalt',
        },
      ],
    }),
  });
  // "Anders erklären" under a shown solution (the chips after a wrong try or a hint).
  llm.byDefault('reexplain', (req) =>
    ScriptedGateway.textOf(req).includes('WAY: example')
      ? {
          explanation:
            'Stell dir vor, du schenkst deiner Oma Blumen. Wem schenkst du sie? Der Oma – „der Oma“ ist der Dativ.',
        }
      : { explanation: 'Frag „Wem?“. Die Antwort darauf steht im Dativ.' },
  );
  // Hints are written in the background after each topic session starts (hints.ts);
  // the fractions question gets two, everything else none (tests/web/modes.spec.ts taps "Tipp").
  llm.byDefault('hints', (req) =>
    ScriptedGateway.textOf(req).includes('Welcher Bruch ist größer')
      ? {
          items: [
            {
              n: 1,
              hints: [
                'Schau auf die Kreise: Welcher ist mehr gefüllt?',
                'Bring beide Brüche auf den Nenner 15.',
              ],
              worked_solution: null,
            },
          ],
        }
      : { items: [] },
  );
  // Practice without a photo: fractions, with a figure.
  scriptGenerations({
    when: /Brüche|Bruch/i,
    answer: () => ({
      usable: true,
      title: 'Brüche vergleichen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Welcher Bruch ist größer: $\\frac{2}{3}$ oder $\\frac{3}{5}$?',
          answer: '$\\frac{2}{3}$',
          choices: ['$\\frac{2}{3}$', '$\\frac{3}{5}$'],
          correct_choice: 0,
          topic: 'Brüche vergleichen',
          figure: {
            type: 'fraction',
            shape: 'circle',
            fractions: [
              { parts: 3, filled: 2 },
              { parts: 5, filled: 3 },
            ],
          },
        },
      ],
    }),
  });
  // "Die wackligen nochmal üben" after the test.
  scriptGenerations({
    // Only the "again" request carries the block about what she just worked on — the
    // test itself mentions the Romans too, and its rule stands below this one.
    when: /SHE JUST WORKED ON THESE[\s\S]*R(ö|o)m/i,
    answer: () => ({
      usable: true,
      title: 'Gründung Roms',
      subject: { name: 'Geschichte', kind: 'history' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Wer gründete Rom der Sage nach?',
          answer: 'Romulus',
          choices: ['Romulus', 'Hannibal'],
          correct_choice: 0,
          topic: 'Gründung Roms',
        },
      ],
    }),
  });
  // Practice test: no hints, results at the end.
  scriptGenerations({
    when: /Römer/i,
    answer: () => ({
      usable: true,
      title: 'Die Römer – Probetest',
      subject: { name: 'Geschichte', kind: 'history' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Wer war der erste römische Kaiser?',
          answer: 'Augustus',
          choices: ['Caesar', 'Augustus', 'Nero'],
          correct_choice: 1,
          topic: 'Kaiserzeit',
        },
        {
          ...base,
          kind: 'numeric',
          prompt: 'In welchem Jahr wurde Rom der Sage nach gegründet (v. Chr.)?',
          answer: '753',
          topic: 'Gründung Roms',
        },
      ],
    }),
  });
  // Said in the chat instead of a tile: Buddy answers with a start button (offer_learning).
  // By what she wrote, never by order (issue #81).
  scriptTurns(
    {
      // The explanation is the answer (buddy.22+); practice on it is offered right after.
      when: /erklär mir den dativ/i,
      answer: says(
        'Der Dativ ist der 3. Fall – du findest ihn mit der Frage „Wem?“. Beispiel: „Ich gebe dem Hund einen Knochen.“ – Wem gebe ich den Knochen? Dem Hund. Magst du das gleich üben?',
        [{ tool: 'offer_learning', args: { kind: 'practice', text: 'Dativ', goal: null } }],
      ),
    },
    {
      when: /brüche vergleichen üben/i,
      answer: says('Gute Idee – ich hab dir ein paar Fragen zu Brüchen vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Brüche vergleichen' } },
      ]),
    },
    {
      when: /probetest|die römer/i,
      answer: says('Klar – ein Probetest über die Römer, wie in der Arbeit.', [
        { tool: 'offer_learning', args: { kind: 'test', text: 'Die Römer' } },
      ]),
    },
    {
      when: /mein stoff|materialien|arbeitsblätter/i,
      answer: says('Klar – hier ist dein Stoff.', [
        { tool: 'open_area', args: { area: 'library' } },
      ]),
    },
    {
      when: /hauptstädte/i,
      answer: says('Klar – ich hab dir Fragen zu Hauptstädten vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Hauptstädte', goal: null } },
      ]),
    },
    {
      // Conversation mode: what she said (the fake microphone's tone, "heard" by the script).
      when: /was steht diese woche an/i,
      answer: says('Diese Woche steht noch nichts an – magst du etwas üben?'),
    },
  );
  llm.byDefault('transcribe', {
    json: { heard_speech: true, text: 'Was steht diese Woche an?' },
  });
  // Tutor: hints for homework (never the solution).
  const hint = (req: LlmRequest) => {
    const text = lastText(req).toLowerCase();
    if (text.includes('28')) {
      return {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Genau, 28 cm² – super gemacht!',
        gave_hint: false,
        revealed_answer: false,
      };
    }
    if (text.includes('11')) {
      return {
        intent: 'answer',
        verdict: 'incorrect',
        reply:
          'Du hast addiert. Beim Flächeninhalt rechnest du Länge **mal** Breite. Probier’s nochmal!',
        gave_hint: true,
        revealed_answer: false,
      };
    }
    return {
      intent: 'no_answer',
      verdict: 'not_an_attempt',
      reply: 'Kein Problem! Welche zwei Längen kennst du vom Rechteck?',
      gave_hint: true,
      revealed_answer: false,
    };
  };
  // By rule, not by count: how many hints a run asks for depends on timing, and a queue
  // that runs dry fails the *next* spec instead of this one (issue #81).
  llm.byDefault('tutor', hint);

  // tests/web/offline.spec.ts: asked in the chat, then two short questions answered offline.
  // tests/web/offline.spec.ts: two short questions, both answered offline.
  scriptGenerations({
    when: /Hauptstädte/i,
    answer: () => ({
      usable: true,
      title: 'Hauptstädte',
      subject: { name: 'Erdkunde', kind: 'geography' },
      items: [
        {
          ...base,
          kind: 'short',
          prompt: 'Wie heißt die Hauptstadt von Frankreich?',
          answer: 'Paris',
          topic: 'Hauptstädte',
        },
        {
          ...base,
          kind: 'short',
          prompt: 'Wie heißt die Hauptstadt von Italien?',
          answer: 'Rom',
          topic: 'Hauptstädte',
        },
      ],
    }),
  });
}
