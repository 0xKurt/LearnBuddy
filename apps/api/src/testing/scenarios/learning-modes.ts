// Scripted model answers for the browser walkthrough of the learning modes
// (tests/web/modes.spec.ts), after the core loop: "Erklär mir …", homework
// help (hints only), a photo-free practice with math and a figure, and a
// practice test followed by "die wackligen nochmal".
// Test tooling only; answers are keyed by the learner's text, never guessed.

import type { LlmRequest } from '../../llm/gateway.js';
import type { ScriptedGateway } from '../fakes.js';

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
  // "Erklär mir den Dativ"
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Der Dativ',
      subject: { name: 'Deutsch', kind: 'german' },
      intro:
        'Der Dativ ist der 3. Fall. Du findest ihn mit der Frage „Wem?“.\n\nBeispiel: „Ich gebe dem Hund einen Knochen.“ – Wem gebe ich den Knochen? Dem Hund. „dem Hund“ steht im Dativ.\n\nMerke: der → dem, die → der, das → dem.',
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
    },
  });
  // Homework typed: 7 cm × 4 cm
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Flächeninhalt Rechteck',
      subject: { name: 'Mathe', kind: 'math' },
      intro: null,
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
    },
  });
  // Practice without a photo: fractions, with a figure.
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Brüche vergleichen',
      subject: { name: 'Mathe', kind: 'math' },
      intro: null,
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
    },
  });
  // Practice test: no hints, results at the end.
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Die Römer – Probetest',
      subject: { name: 'Geschichte', kind: 'history' },
      intro: null,
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
    },
  });
  // "Die wackligen nochmal üben" after the test.
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Gründung Roms',
      subject: { name: 'Geschichte', kind: 'history' },
      intro: null,
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
    },
  });
  // Said in the chat instead of a tile: Buddy answers with a start button (offer_learning).
  llm.script(
    'buddy_turn',
    {
      json: {
        reply: 'Gute Idee – ich hab dir ein paar Fragen zu Brüchen vorbereitet.',
        options: null,
        actions: [
          { tool: 'offer_learning', args: { kind: 'practice', text: 'Brüche vergleichen' } },
        ],
      },
    },
    {
      json: {
        reply: 'Klar – ein Probetest über die Römer, wie in der Arbeit.',
        options: null,
        actions: [{ tool: 'offer_learning', args: { kind: 'test', text: 'Die Römer' } }],
      },
    },
    {
      json: {
        reply: 'Klar – hier ist dein Stoff.',
        options: null,
        actions: [{ tool: 'open_area', args: { area: 'library' } }],
      },
    },
    // Conversation mode: what she said (the fake microphone's tone, "heard" by the script).
    {
      json: {
        reply: 'Diese Woche steht noch nichts an – magst du etwas üben?',
        options: null,
        actions: [],
      },
    },
  );
  llm.script('transcribe', { json: { heard_speech: true, text: 'Was steht diese Woche an?' } });
  // Tutor: hints for homework (never the solution), and the explain question.
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
  llm.script('tutor', hint, hint, hint, hint);
}
