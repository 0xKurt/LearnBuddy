// Scripted model answers for labelled pictures (issue #252): a plant cell to label (code writes
// one question per number), the plant cell's nucleus, a bicycle's frame and a traffic sign to tap;
// and the drawings of the second part, each with six numbers and one part to tap (`LIBRARY_ITEMS`).
// Shared by the integration test (`__tests__/schematic-figures.int.test.ts`) and the browser
// walkthrough (tests/web/tap-figures.spec.ts). Every name is a part of its drawing and passes the server's own
// check (`modules/practice/schematicCheck.ts`). Test tooling only; answers are keyed by the
// learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
  kind: 'short',
  topic: 'Zelle',
};

const cell = (n: string[], ask = 0) => ({ type: 'schematic', d: 'plant_cell', n, ask });

/** The drafts the model writes, in order; the first becomes three questions. */
export const SCHEMATIC_ITEMS = [
  {
    ...base,
    prompt: 'Beschrifte die Pflanzenzelle.',
    // What the model writes as a key here is no key: code writes one per number.
    answer: 'Zellkern',
    figure: cell(['Zellkern', 'Vakuole', 'Chloroplast']),
  },
  {
    ...base,
    prompt: 'Tippe auf den Zellkern.',
    answer: 'Zellkern',
    tap: true,
    figure: cell([]),
  },
  {
    ...base,
    prompt: 'Tippe auf den Rahmen.',
    answer: 'Rahmen',
    topic: 'Fahrrad',
    tap: true,
    figure: { type: 'schematic', d: 'bicycle', n: [], ask: 0 },
  },
  {
    ...base,
    prompt: 'Tippe auf das Schild für den Radweg.',
    answer: 'Radweg',
    topic: 'Verkehr',
    tap: true,
    figure: { type: 'schematic', d: 'signs', n: [], ask: 0 },
  },
];

/** The questions as stored and shown, in order: the label task as code writes it, then the taps. */
export const SCHEMATIC_PROMPTS = [
  'Pflanzenzelle: Wie heißt Teil 1?',
  'Pflanzenzelle: Wie heißt Teil 2?',
  'Pflanzenzelle: Wie heißt Teil 3?',
  'Tippe auf den Zellkern.',
  'Tippe auf den Rahmen.',
  'Tippe auf das Schild für den Radweg.',
];

/**
 * The drawings of the second part (and the bicycle with its safety check): six parts numbered and
 * the first asked for by name, then one part to tap — the numbers a schoolbook prints, the parts
 * school asks to tap.
 */
const LIBRARY = [
  {
    d: 'microscope',
    name: 'Mikroskop',
    n: ['Okular', 'Tubus', 'Objektiv', 'Objekttisch', 'Grobtrieb', 'Fuß'],
    tap: ['Tippe auf den Objekttisch.', 'Objekttisch'],
  },
  {
    d: 'lab',
    name: 'Laborgeräte',
    n: [
      'Reagenzglas',
      'Becherglas',
      'Erlenmeyerkolben',
      'Rundkolben',
      'Messzylinder',
      'Bunsenbrenner',
    ],
    tap: ['Tippe auf den Trichter.', 'Trichter'],
  },
  {
    d: 'heart',
    name: 'Herz',
    n: ['rechter Vorhof', 'linke Kammer', 'Aorta', 'Hohlvene', 'Herzscheidewand', 'Segelklappe'],
    tap: ['Tippe auf die linke Kammer.', 'linke Kammer'],
  },
  {
    d: 'ear',
    name: 'Ohr',
    n: ['Ohrmuschel', 'Gehörgang', 'Trommelfell', 'Gehörknöchelchen', 'Schnecke', 'Hörnerv'],
    tap: ['Tippe auf die Schnecke.', 'Schnecke'],
  },
  {
    d: 'skeleton',
    name: 'Skelett',
    n: ['Schädel', 'Schlüsselbein', 'Brustkorb', 'Wirbelsäule', 'Becken', 'Oberschenkelknochen'],
    tap: ['Tippe auf das Becken.', 'Becken'],
  },
  {
    d: 'organs',
    name: 'Organe',
    n: ['Gehirn', 'Lunge', 'Herz', 'Leber', 'Magen', 'Dünndarm'],
    tap: ['Tippe auf den Magen.', 'Magen'],
  },
  {
    d: 'signs',
    name: 'Verkehrszeichen',
    n: [
      'Stoppschild',
      'Vorfahrt gewähren',
      'Vorfahrtstraße',
      'Fußgängerüberweg',
      'Radweg',
      'Einbahnstraße',
    ],
    tap: ['Tippe auf das Stoppschild.', 'Stoppschild'],
  },
  {
    d: 'instruments',
    name: 'Musikinstrumente',
    n: ['Gitarre', 'Blockflöte', 'Trommel', 'Trompete', 'Triangel', 'Xylofon'],
    tap: ['Tippe auf die Trommel.', 'Trommel'],
  },
  {
    d: 'anlaut',
    name: 'Anlautbilder',
    n: ['Apfel', 'Ball', 'Haus', 'Sonne', 'Mond', 'Fisch'],
    tap: ['Tippe auf das Bild, das mit M anfängt.', 'Mond'],
  },
  {
    d: 'bicycle',
    name: 'Fahrrad',
    n: ['Klingel', 'Scheinwerfer', 'Bremse', 'Rücklicht', 'Speichenreflektor', 'Gepäckträger'],
    tap: ['Tippe auf die Kette.', 'Kette'],
  },
] as const;

/** Per drawing: "Mikroskop: Wie heißt Teil 1?" (typed), then a part to tap. */
export const LIBRARY_ITEMS = LIBRARY.flatMap(({ d, name, n, tap: [prompt, answer] }) => [
  {
    ...base,
    topic: name,
    prompt: `${name}: Wie heißt Teil 1?`,
    answer: n[0],
    figure: { type: 'schematic', d, n: [...n], ask: 1 },
  },
  {
    ...base,
    topic: name,
    prompt,
    answer,
    tap: true,
    figure: { type: 'schematic', d, n: [], ask: 0 },
  },
]);

/** Picture questions that cannot be asked as written: none of them may reach the database. */
export const BROKEN_SCHEMATIC_ITEMS = [
  // A part the drawing does not have: a plant cell has no lens.
  { ...SCHEMATIC_ITEMS[0]!, prompt: 'Beschrifte die Zelle.', figure: cell(['Zellkern', 'Linse']) },
  // A tap that asks a number.
  { ...SCHEMATIC_ITEMS[1]!, prompt: 'Tippe auf Teil 1.', figure: cell(['Zellkern'], 1) },
  // A tap on a picture with numbers: they stand beside the drawing and shrink it.
  {
    ...SCHEMATIC_ITEMS[1]!,
    prompt: 'Tippe auf den Zellkern, Teil 1.',
    figure: cell(['Zellkern', 'Vakuole']),
  },
  // A part too small for a finger on a phone: the bell is named, never tapped.
  {
    ...SCHEMATIC_ITEMS[2]!,
    prompt: 'Tippe auf die Klingel.',
    answer: 'Klingel',
    figure: { type: 'schematic', d: 'bicycle', n: [], ask: 0 },
  },
  // A tap asks for a whole finger (44 pt): the lens is 24 pt wide on the narrowest phone — enough
  // for a country on a map, not for a part of a picture.
  {
    ...SCHEMATIC_ITEMS[2]!,
    prompt: 'Tippe auf die Linse.',
    answer: 'Linse',
    figure: { type: 'schematic', d: 'eye', n: [], ask: 0 },
  },
  // The second part's drawings have small parts too: the fibula beside the shin is named, never
  // tapped.
  {
    ...SCHEMATIC_ITEMS[2]!,
    prompt: 'Tippe auf das Wadenbein.',
    answer: 'Wadenbein',
    figure: { type: 'schematic', d: 'skeleton', n: [], ask: 0 },
  },
  // The typed key is not the part asked for.
  { ...base, prompt: 'Wie heißt Teil 1?', answer: 'Vakuole', figure: cell(['Zellkern'], 1) },
  // One number and nothing asked: no question at all.
  { ...base, prompt: 'Was siehst du?', answer: 'Zellkern', figure: cell(['Zellkern']) },
  // A fact the library does not hold.
  {
    ...base,
    prompt: 'Was macht Teil 1?',
    answer: 'Er steuert die Zelle.',
    figure: cell(['Zellkern'], 1),
  },
  // A picture question that is no short answer.
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches Teil ist 1?',
    choices: ['Zellkern', 'Vakuole'],
    correct_choice: 0,
    answer: 'Zellkern',
    figure: cell(['Zellkern'], 1),
  },
];

export function scriptSchematic(): void {
  scriptGenerations({
    when: /Bildbibliothek/i,
    answer: () => ({
      usable: true,
      title: 'Bildbibliothek',
      subject: { name: 'Sachunterricht', kind: 'other' },
      items: LIBRARY_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns die bildbibliothek/i,
    answer: says('Gern – heute zeige ich dir die Bilder der Bibliothek.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Bildbibliothek' } },
    ]),
  });
  scriptGenerations({
    when: /Bilder beschriften/i,
    answer: () => ({
      usable: true,
      title: 'Bilder beschriften',
      subject: { name: 'Biologie', kind: 'biology' },
      items: SCHEMATIC_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns bilder beschriften/i,
    answer: says('Gern – heute beschriftest du Bilder und tippst Teile an.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Bilder beschriften' } },
    ]),
  });
}
