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

const read = (q: string, s = 0, i = 0, j = 0) => ({ q, s, i, j });
const chart = (over: Record<string, unknown>) => ({
  ...base,
  kind: 'numeric',
  prompt_lang: 'de',
  topic: 'Diagramme lesen',
  ...over,
});

/** The chart questions of the walkthrough (tests/web/charts.spec.ts answers them by prompt). */
export const CHART_ITEMS = [
  chart({
    prompt: 'Wie hoch ist der Jahresniederschlag in Berlin?',
    answer: '571',
    unit: 'mm',
    figure: {
      type: 'climate_chart',
      place: 'Berlin',
      alt: 34,
      t: [0.6, 1.4, 4.6, 9.4, 14.4, 17.4, 19.4, 19.1, 14.9, 9.9, 5.0, 1.9],
      p: [42, 33, 41, 37, 54, 69, 56, 58, 45, 37, 44, 55],
    },
    read: read('sum', 1),
  }),
  chart({
    prompt: 'Welchen Weg hat der Wagen nach 3 s zurückgelegt?',
    answer: '18',
    unit: 'm',
    figure: {
      type: 'line_chart',
      x: ['0', '1', '2', '3', '4', '5'],
      xt: 'Zeit in s',
      s: [
        { n: 'Weg', u: 'm', v: [0, 2, 8, 18, 32, 50], bar: false, r: false },
        { n: 'Tempo', u: 'm/s', v: [0, 4, 8, 12, 16, 20], bar: false, r: true },
      ],
    },
    read: read('value', 0, 3),
  }),
  chart({
    prompt: 'Wie groß ist der Mittelpunktswinkel für „Bus“?',
    answer: '144',
    unit: '°',
    figure: {
      type: 'pie_chart',
      half: false,
      l: ['Bus', 'Fahrrad', 'Zu Fuß', 'Auto'],
      v: [40, 30, 20, 10],
    },
    read: read('angle', 0, 0),
  }),
  chart({
    prompt: 'Wie groß ist der Median der Klasse 7a?',
    answer: '152',
    unit: 'cm',
    figure: {
      type: 'box_plot',
      u: 'cm',
      b: [
        { l: 'Klasse 7a', v: [138, 146, 152, 158, 171] },
        { l: 'Klasse 7b', v: [135, 143, 149, 160, 166] },
      ],
      raw: [],
    },
    read: read('value', 0, 2),
  }),
  chart({
    prompt: 'Wie groß ist $P(X = 2)$?',
    answer: '0.375',
    figure: {
      type: 'histogram',
      x0: -0.5,
      w: 1,
      v: [0.0625, 0.25, 0.375, 0.25, 0.0625],
      xt: 'k',
      yt: 'P(X = k)',
    },
    read: read('value', 0, 2),
  }),
  chart({
    prompt: 'Wie groß ist die Steigung der Ausgleichsgeraden?',
    answer: '1.97',
    unit: 'm/s',
    figure: {
      type: 'scatter_plot',
      x: [0, 1, 2, 3, 4],
      y: [1.1, 2.9, 5.2, 6.8, 9],
      fit: true,
      xt: 'Zeit in s',
      yt: 'Weg in m',
    },
    read: read('slope'),
  }),
  chart({
    kind: 'multiple_choice',
    prompt: 'Welchen Typ hat diese Bevölkerungspyramide?',
    answer: 'Pyramide',
    choices: ['Pyramide', 'Glocke', 'Urne'],
    correct_choice: 0,
    figure: {
      type: 'pyramid',
      a0: 0,
      w: 10,
      m: [9.5, 8.6, 7.4, 6.1, 4.8, 3.4, 2.1, 1.1, 0.4],
      f: [9.1, 8.3, 7.3, 6.2, 5.0, 3.8, 2.6, 1.5, 0.6],
      u: '%',
    },
    read: read('type'),
  }),
];

function lastText(req: LlmRequest): string {
  const m = req.contents[req.contents.length - 1];
  const parts = m?.parts.flatMap((p) => ('text' in p ? [p.text] : [])) ?? [];
  return parts.join('\n');
}

export function scriptLearningModes(llm: ScriptedGateway): void {
  // A written calculation path (issues #209, #221): an equation she solves line by line, then
  // a one-liner the return key sends. Registered first: a later learner's request may carry
  // older topics, and the first rule that matches wins. The model only supplies the items —
  // which line broke is decided by code (steps.ts), and no tutor is scripted for it.
  scriptGenerations({
    when: /Rechenweg/i,
    answer: () => ({
      usable: true,
      title: 'Gleichungen mit Rechenweg',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'numeric',
          prompt: 'Löse: $2x + 3 = 7$',
          answer: '2',
          topic: 'Gleichungen',
        },
        {
          ...base,
          kind: 'numeric',
          prompt: 'Berechne $3 \\cdot 4$.',
          answer: '12',
          topic: 'Gleichungen',
        },
      ],
    }),
  });
  // The form of a right value and a decay that does not add up (issues #235, #263): both are
  // decided by code — the task typed back is a near miss with its own reply, and the mass numbers
  // are counted — so no tutor is scripted for either.
  scriptGenerations({
    when: /Faktorisieren/i,
    answer: () => ({
      usable: true,
      title: 'Faktorisieren',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'formula',
          prompt: 'Faktorisiere $x^{2}+2x+1$.',
          answer: '(x+1)^2',
          topic: 'Faktorisieren',
        },
        {
          ...base,
          kind: 'formula',
          prompt: 'Stelle die Zerfallsgleichung für den Alpha-Zerfall von Uran-238 auf.',
          answer: '²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He',
          topic: 'Radioaktivität',
        },
      ],
    }),
  });
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
  // Fraction bars (issue #162): the model chooses the task and its numbers — there is no
  // field for a question, an answer or a figure, so this is ALL it can say. The question
  // the walkthrough then reads on screen was written by the server.
  // Registered before the fractions rule below, whose /Bruch/ would also match "Bruchbalken".
  scriptGenerations({
    when: /Bruchbalken/i,
    answer: () => ({
      usable: true,
      title: 'Bruchbalken',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      bars: [
        { task: 'shade', parts: 4, units: 2 },
        // The sentence issue #162 opens with: "1/2 + 1/4". The only shape with a figure to
        // READ above the question and a surface to WORK with under it, so it is also the
        // tallest one the walkthrough measures on 360×740.
        { task: 'add', parts: 4, first: 2, second: 1 },
        { task: 'compare', left: '1/2', right: '3/5' },
      ],
    }),
  });
  // Answers with SEVERAL PARTS (issues #228, #229, #230): the model writes the task — the
  // elements in the right order, the pairs, the groups, the table with its gaps — and nothing
  // about how it is judged. Every board on screen, every shuffle and every verdict below comes
  // from the server (`modules/practice/parts.ts`). All four forms in one run, so the walkthrough
  // sees the tallest of them on 360×740.
  // Registered before the /Brüche|Bruch/ rule: nothing here mentions fractions, but the order of
  // these rules is what decides, so new ones go above the broader patterns.
  scriptGenerations({
    when: /Reihenfolge|Zuordnen|Tabelle/i,
    answer: () => ({
      usable: true,
      title: 'Ordnen und Zuordnen',
      subject: { name: 'Biologie', kind: 'biology' },
      bars: [],
      items: [
        {
          ...base,
          kind: 'order',
          prompt: 'Bring die Schritte der Keimung in die richtige Reihenfolge.',
          // Never used: the solution is computed from the task (`solutionOfParts`).
          answer: 'wird berechnet',
          topic: 'Keimung',
          parts_task: {
            form: 'order',
            // Five, the middle of what the contract allows (3–8). The upper bound is where the
            // 360×740 phone decides, and the walkthrough is where that is measured.
            elements: [
              'Samen quillt auf',
              'Wurzel wächst',
              'Keimblätter öffnen sich',
              'Erstes Blatt wächst',
              'Pflanze blüht',
            ],
          },
        },
        {
          ...base,
          kind: 'match',
          prompt: 'Welches Organ hat welche Aufgabe?',
          answer: 'wird berechnet',
          topic: 'Organe',
          parts_task: {
            form: 'match_pairs',
            // Five pairs — the number issue #229's acceptance criterion names for 360×740.
            pairs: [
              { left: 'Lunge', right: 'Gasaustausch' },
              { left: 'Herz', right: 'Blut pumpen' },
              { left: 'Niere', right: 'Blut filtern' },
              { left: 'Magen', right: 'Nahrung zersetzen' },
              { left: 'Leber', right: 'Gift abbauen' },
            ],
          },
        },
        {
          ...base,
          kind: 'match',
          prompt: 'Sortiere die Tiere in ihre Klassen.',
          answer: 'wird berechnet',
          topic: 'Wirbeltierklassen',
          parts_task: {
            form: 'match_groups',
            groups: [
              { name: 'Säugetier', members: ['Hund', 'Fledermaus'] },
              { name: 'Vogel', members: ['Amsel', 'Pinguin'] },
              { name: 'Lurch', members: ['Frosch', 'Molch'] },
            ],
          },
        },
        {
          ...base,
          kind: 'table_fill',
          prompt: 'Fülle die Tabelle aus.',
          answer: 'wird berechnet',
          topic: 'Zellen',
          // A 4×4 table — the size issue #230's acceptance criterion names for 360×740: four
          // columns (the row label and three cells) and four rows with the heading.
          parts_task: {
            form: 'table_fill',
            header: ['Merkmal', 'Pflanzenzelle', 'Tierzelle', 'Bakterium'],
            rows: [
              [
                { cell: 'given', text: 'Zellwand' },
                { cell: 'gap', expect: 'word', answer: 'ja', accepted: ['vorhanden'] },
                { cell: 'gap', expect: 'word', answer: 'nein', accepted: ['fehlt'] },
                { cell: 'given', text: 'ja' },
              ],
              [
                { cell: 'given', text: 'Zellkern' },
                { cell: 'given', text: 'ja' },
                { cell: 'gap', expect: 'word', answer: 'ja', accepted: ['vorhanden'] },
                { cell: 'gap', expect: 'word', answer: 'nein', accepted: ['fehlt'] },
              ],
              [
                { cell: 'given', text: 'Chloroplasten' },
                { cell: 'gap', expect: 'word', answer: 'ja', accepted: ['vorhanden'] },
                { cell: 'given', text: 'nein' },
                { cell: 'gap', expect: 'word', answer: 'nein', accepted: ['fehlt'] },
              ],
            ],
          },
        },
      ],
    }),
  });
  // Charts (issues #245, #246): one question per chart, each with what it reads off, so the
  // walkthrough sees every drawing at both phone sizes, light and dark. Every key here is the
  // value code computes from the data — a wrong one would not reach the screen at all.
  scriptGenerations({
    when: /Diagramme lesen/i,
    answer: () => ({
      usable: true,
      title: 'Diagramme lesen',
      subject: { name: 'Erdkunde', kind: 'geography' },
      items: CHART_ITEMS,
    }),
  });
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
      when: /diagramme üben/i,
      answer: says('Gern – ich hab dir Diagramme zum Ablesen vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Diagramme lesen' } },
      ]),
    },
    {
      when: /faktorisieren üben/i,
      answer: says('Gern – ich hab dir Faktorisieren und einen Zerfall vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Faktorisieren' } },
      ]),
    },
    {
      when: /mit rechenweg üben/i,
      answer: says('Gern – ich hab dir Gleichungen mit Rechenweg vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Gleichungen mit Rechenweg' } },
      ]),
    },
    {
      when: /balken/i,
      answer: says('Gern – ich hab dir Bruchbalken zum Ausprobieren vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Bruchbalken' } },
      ]),
    },
    {
      // Answers with several parts (issues #228–#230). The topic text reaches the generator,
      // whose /Reihenfolge|Zuordnen|Tabelle/ rule above answers with the four boards.
      when: /ordnen/i,
      answer: says('Gern – ordnen und zuordnen, mit einer Tabelle am Ende.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Reihenfolge und Zuordnen' } },
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
