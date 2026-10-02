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
  // Match items (issue #229): the model writes only the correct links — pairs, and things
  // sorted into groups. The server checks them (Regel 0), gives the ids, shuffles and keeps
  // the key. Both are the LARGEST a match may be (contracts/structured.ts): the most pairs and
  // the most things in the most groups, every text close to its cap, the longest words a column
  // must hold and a prompt at MATCH_PROMPT_MAX — so the walkthrough measures the worst case on
  // 360×740 (rule 16), not a comfortable one. Registered first, like the Rechenweg below: the
  // first rule that matches wins.
  scriptGenerations({
    when: /Verfassungsorgan/i,
    answer: () => ({
      usable: true,
      title: 'Wer macht was?',
      subject: { name: 'Politik', kind: 'social_studies' },
      items: [],
      structured: [
        {
          type: 'match',
          prompt: 'Welches Verfassungsorgan hat welche Aufgabe?',
          pairs: [
            { left: 'Bundespräsident', right: 'unterschreibt die neuen Gesetze' },
            { left: 'Bundesregierung', right: 'führt die Gesetze des Bundes aus' },
            { left: 'Bundeskanzlerin', right: 'bestimmt die Richtlinien im Bund' },
            { left: 'Landesregierung', right: 'führt die Gesetze des Landes aus' },
          ],
          groups: null,
          topic: 'Verfassungsorgane',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'match',
          prompt: 'Wer ist denn zuständig: Stadt, Land, Bund?',
          pairs: null,
          groups: [
            {
              name: 'Stadtverwaltung',
              elements: ['Laternen planen', 'Friedhof pflegen', 'Kitaplätze geben'],
            },
            {
              name: 'Landesverwaltung',
              elements: ['Polizei aufbauen', 'Unis finanzieren', 'Lehrpläne machen'],
            },
            { name: 'Bundesverwaltung', elements: ['Armee ausrüsten', 'Verträge machen'] },
          ],
          topic: 'Zuständigkeiten',
          difficulty: 2,
          prompt_lang: 'de',
        },
      ],
    }),
  });
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
  // Tables to fill in (issue #230): the model writes every value and marks the gaps; the
  // server recomputes the totals and the wall (Regel 0), names the gaps and keeps the keys.
  // Matched on her own request only, so an older topic in a later request never picks it.
  // The first is the 4×4 of the issue's acceptance: a two-way table with its totals.
  scriptGenerations({
    when: /LEARNER'S TEXT:\n[^\n]*Vierfeldertafel/i,
    answer: () => {
      const v = (text: string) => ({ text, gap: false, also: [] });
      const g = (text: string) => ({ text, gap: true, also: [] });
      return {
        usable: true,
        title: 'Vierfeldertafel und Zahlenmauer',
        subject: { name: 'Mathe', kind: 'math' },
        items: [],
        structured: [
          {
            type: 'table_fill',
            prompt:
              '30 Kinder der 6b sagen, ob sie einen Hund oder eine Katze haben. Fülle die Tafel aus.',
            header: ['', 'Hund', 'kein Hund', 'Summe'],
            rows: [
              [v('Katze'), v('4'), g('6'), v('10')],
              [v('keine Katze'), g('8'), v('12'), g('20')],
              [v('Summe'), v('12'), g('18'), v('30')],
            ],
            family: 'totals',
            fn: null,
            x_in: null,
            topic: 'Vierfeldertafel',
            difficulty: 2,
            prompt_lang: 'de',
          },
          {
            type: 'table_fill',
            prompt: 'Rechne die Zahlenmauer aus: Jeder Stein ist die Summe der zwei darunter.',
            header: null,
            rows: [[g('20')], [v('8'), g('12')], [g('3'), v('5'), v('7')]],
            family: 'wall',
            fn: null,
            x_in: null,
            topic: 'Zahlenmauern',
            difficulty: 1,
            prompt_lang: 'de',
          },
        ],
      };
    },
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
  // Interactive figures (issues #248, #249): the model writes each figure and its key as VALUES —
  // never an id, never a mirror image (code computes that). The server checks that every key lies
  // on a place she can tap or draw, keeps it, and judges her answer without a model. The plane is
  // fine on purpose (12 × 10 steps): on 360×740 a step is under 44 pt there, so the walkthrough
  // goes through the magnifying first tap.
  scriptGenerations({
    when: /Koordinaten antippen/i,
    answer: () => ({
      usable: true,
      title: 'Antippen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured: [
        {
          type: 'figure_tap',
          prompt: 'Tippe den Punkt P(2 | −1) an.',
          plane: {
            x_min: -6,
            x_max: 6,
            y_min: -5,
            y_max: 5,
            step: 1,
            marks: [],
            key: { x: 2, y: -1 },
          },
          number_line: null,
          bars: null,
          clock: null,
          topic: 'Koordinaten',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'Wo liegt $\\frac{3}{4}$ auf dem Zahlenstrahl?',
          plane: null,
          number_line: { min: -2, max: 2, step: 1, snap: 0.25, marks: [], key: 0.75 },
          bars: null,
          clock: null,
          topic: 'Zahlenstrahl',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'In welchem Monat hat es am meisten geregnet?',
          plane: null,
          number_line: null,
          bars: {
            bars: [
              { label: 'Mai', value: 60 },
              { label: 'Juni', value: 85 },
              { label: 'Juli', value: 95 },
              { label: 'Aug', value: 70 },
            ],
            unit: 'mm',
            key: 'Juli',
            extreme: 'max',
          },
          clock: null,
          topic: 'Diagramme',
          difficulty: 1,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'Stell die Uhr auf Viertel nach drei.',
          plane: null,
          number_line: null,
          bars: null,
          clock: { snap: 5, key: { h: 3, m: 15 } },
          topic: 'Uhrzeit',
          difficulty: 1,
          prompt_lang: 'de',
        },
      ],
    }),
  });
  // Karten (issue #251): the model names each feature by NAME — "Bayern", "Italien", "Berlin",
  // "Tropen" — and code resolves it against the Natural Earth data; the key is the data's id or
  // position. The first is the acceptance of #251: Germany with its 16 Länder on 360×740, every
  // one tappable (Berlin, Bremen, Hamburg after the magnifying first tap).
  scriptGenerations({
    when: /Bundesländer auf der Karte/i,
    answer: () => ({
      usable: true,
      title: 'Karten',
      subject: { name: 'Erdkunde', kind: 'other' },
      items: [],
      structured: [
        {
          type: 'figure_tap',
          prompt: 'Tippe auf Bayern.',
          plane: null,
          number_line: null,
          bars: null,
          clock: null,
          map: { area: 'germany', layer: 'areas', ask: 'tap', feature: 'Bayern', graticule: false },
          topic: 'Bundesländer',
          difficulty: 1,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'Wie heißt das markierte Land?',
          plane: null,
          number_line: null,
          bars: null,
          clock: null,
          map: {
            area: 'europe',
            layer: 'areas',
            ask: 'name',
            feature: 'Italien',
            graticule: false,
          },
          topic: 'Europa',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'Welche Koordinaten hat die markierte Hauptstadt?',
          plane: null,
          number_line: null,
          bars: null,
          clock: null,
          map: {
            area: 'germany',
            layer: 'cities',
            ask: 'coords',
            feature: 'Berlin',
            graticule: true,
          },
          topic: 'Gradnetz',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'figure_tap',
          prompt: 'Tippe auf die Zone zwischen den Wendekreisen.',
          plane: null,
          number_line: null,
          bars: null,
          clock: null,
          map: { area: 'world', layer: 'zones', ask: 'tap', feature: 'Tropen', graticule: false },
          topic: 'Beleuchtungszonen',
          difficulty: 2,
          prompt_lang: 'de',
        },
      ],
    }),
  });
  scriptGenerations({
    when: /Auf dem Raster zeichnen/i,
    answer: () => ({
      usable: true,
      title: 'Zeichnen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured: [
        {
          type: 'grid_draw',
          prompt: 'Zeichne die Gerade $y = 2x - 1$.',
          grid: { x_min: -4, x_max: 4, y_min: -4, y_max: 4, step: 1, axes: true },
          task: 'line',
          points: null,
          closed: false,
          cells: null,
          mirror: null,
          fn: '2*x-1',
          count: null,
          bars: null,
          topic: 'Geraden',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'grid_draw',
          prompt: 'Spiegle das Dreieck an der gestrichelten Linie.',
          grid: { x_min: 0, x_max: 10, y_min: 0, y_max: 6, step: 1, axes: false },
          task: 'mirror_points',
          points: [
            { x: 1, y: 1, label: 'A' },
            { x: 4, y: 1, label: 'B' },
            { x: 3, y: 4, label: 'C' },
          ],
          closed: true,
          cells: null,
          mirror: { direction: 'vertical', at: 5 },
          fn: null,
          count: null,
          bars: null,
          topic: 'Achsensymmetrie',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'grid_draw',
          prompt: 'Zeichne das Säulendiagramm: Mo 4, Di 7, Mi 2 Stunden Sonne.',
          grid: { x_min: 0, x_max: 3, y_min: 0, y_max: 8, step: 1, axes: true },
          task: 'bars',
          points: null,
          closed: false,
          cells: null,
          mirror: null,
          fn: null,
          count: null,
          bars: [
            { label: 'Mo', value: 4 },
            { label: 'Di', value: 7 },
            { label: 'Mi', value: 2 },
          ],
          topic: 'Diagramme',
          difficulty: 1,
          prompt_lang: 'de',
        },
      ],
    }),
  });
  // Order items (issue #228): the model writes the elements in the RIGHT order and nothing
  // about a key — the server checks them (Regel 0), shuffles them and keeps the key. The
  // second set is the tallest an order may be: eight elements, the bound of rule 16 on
  // 360×740.
  scriptGenerations({
    when: /Keimung/i,
    answer: () => ({
      usable: true,
      title: 'Keimung',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [],
      structured: [
        {
          type: 'order',
          prompt: 'Bring die Keimung einer Bohne in die richtige Reihenfolge.',
          elements: [
            'Der Samen nimmt Wasser auf und quillt',
            'Die Keimwurzel wächst nach unten',
            'Der Keimstängel streckt sich zum Licht',
            'Die ersten Laubblätter entfalten sich',
          ],
          numeric: null,
          topic: 'Keimung',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'order',
          prompt: 'Ordne die Zahlen der Größe nach, mit der kleinsten zuerst.',
          elements: ['-12', '-3', '0,5', '$\\frac{3}{4}$', '2', '17', '105', '1000'],
          numeric: 'ascending',
          topic: 'Zahlen ordnen',
          difficulty: 2,
          prompt_lang: 'de',
        },
      ],
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
      when: /mit rechenweg üben/i,
      answer: says('Gern – ich hab dir Gleichungen mit Rechenweg vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Gleichungen mit Rechenweg' } },
      ]),
    },
    {
      when: /koordinaten antippen/i,
      answer: says('Gern – tipp mal in ein paar Figuren.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Koordinaten antippen' } },
      ]),
    },
    {
      when: /bundesländer auf der karte/i,
      answer: says('Gern – hier kommt eine stumme Karte.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Bundesländer auf der Karte' } },
      ]),
    },
    {
      when: /raster zeichnen/i,
      answer: says('Klar – ein paar Zeichnungen auf dem Raster.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Auf dem Raster zeichnen' } },
      ]),
    },
    {
      when: /keimung/i,
      answer: says('Klar – ordne mal die Keimung, Schritt für Schritt.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Keimung ordnen' } },
      ]),
    },
    {
      when: /vierfeldertafel/i,
      answer: says('Gern – eine Vierfeldertafel und danach eine Zahlenmauer.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Vierfeldertafel ausfüllen' } },
      ]),
    },
    {
      when: /verfassungsorgane zuordnen/i,
      answer: says('Gern – ordne mal zu, wer was macht.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Verfassungsorgane zuordnen' } },
      ]),
    },
    {
      when: /balken/i,
      answer: says('Gern – ich hab dir Bruchbalken zum Ausprobieren vorbereitet.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Bruchbalken' } },
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
