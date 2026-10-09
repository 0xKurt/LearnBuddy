// Scripted model answers for labelled pictures (issue #252): a plant cell to label (code writes
// one question per number), the plant cell's nucleus, a bicycle's frame and a traffic sign to tap;
// the drawings of the second part, each with six numbers and one part to tap (`LIBRARY_ITEMS`); and
// those of #462 (`LIBRARY_MORE_ITEMS`): the small parts drawn large — lens, pupil, stigma, stamen —
// tapped, and every further drawing numbered and tapped.
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
    taps: [['Tippe auf den Objekttisch.', 'Objekttisch']],
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
    taps: [['Tippe auf den Trichter.', 'Trichter']],
  },
  {
    d: 'heart',
    name: 'Herz',
    n: ['rechter Vorhof', 'linke Kammer', 'Aorta', 'Hohlvene', 'Herzscheidewand', 'Segelklappe'],
    taps: [['Tippe auf die linke Kammer.', 'linke Kammer']],
  },
  {
    d: 'ear',
    name: 'Ohr',
    n: ['Ohrmuschel', 'Gehörgang', 'Trommelfell', 'Gehörknöchelchen', 'Schnecke', 'Hörnerv'],
    taps: [['Tippe auf die Schnecke.', 'Schnecke']],
  },
  {
    d: 'skeleton',
    name: 'Skelett',
    n: ['Schädel', 'Schlüsselbein', 'Brustkorb', 'Wirbelsäule', 'Becken', 'Oberschenkelknochen'],
    taps: [['Tippe auf das Becken.', 'Becken']],
  },
  {
    d: 'organs',
    name: 'Organe',
    n: ['Gehirn', 'Lunge', 'Herz', 'Leber', 'Magen', 'Dünndarm'],
    taps: [['Tippe auf den Magen.', 'Magen']],
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
    taps: [['Tippe auf das Stoppschild.', 'Stoppschild']],
  },
  {
    d: 'instruments',
    name: 'Musikinstrumente',
    n: ['Gitarre', 'Blockflöte', 'Trommel', 'Trompete', 'Triangel', 'Xylofon'],
    taps: [['Tippe auf die Trommel.', 'Trommel']],
  },
  {
    d: 'anlaut',
    name: 'Anlautbilder',
    n: ['Apfel', 'Ball', 'Haus', 'Sonne', 'Mond', 'Fisch'],
    taps: [['Tippe auf das Bild, das mit M anfängt.', 'Mond']],
  },
  {
    d: 'bicycle',
    name: 'Fahrrad',
    n: ['Klingel', 'Scheinwerfer', 'Bremse', 'Rücklicht', 'Speichenreflektor', 'Gepäckträger'],
    taps: [['Tippe auf die Kette.', 'Kette']],
  },
] as const;

/** A drawing of the library as the scenario asks about it: its numbers, then parts to tap. */
type LibraryEntry = {
  d: string;
  name: string;
  n: readonly string[];
  taps: ReadonlyArray<readonly [prompt: string, answer: string]>;
};

/** Per drawing: "Mikroskop: Wie heißt Teil 1?" (typed), then each part to tap. */
const libraryItems = (entries: readonly LibraryEntry[]) =>
  entries.flatMap(({ d, name, n, taps }) => [
    {
      ...base,
      topic: name,
      prompt: `${name}: Wie heißt Teil 1?`,
      answer: n[0]!,
      figure: { type: 'schematic', d, n: [...n], ask: 1 },
    },
    ...taps.map(([prompt, answer]) => ({
      ...base,
      topic: name,
      prompt,
      answer,
      tap: true,
      figure: { type: 'schematic', d, n: [], ask: 0 },
    })),
  ]);

export const LIBRARY_ITEMS = libraryItems(LIBRARY);

/**
 * The drawings of #462, in two runs (a run holds 25 questions, `setProfiles.ts`): the small parts
 * of the flower, the eye and the insect drawn large — the
 * lens, the pupil, the stigma and the stamen, too small to tap in the whole drawing, tapped here —
 * and every further drawing with six numbers and one part to tap.
 */
const LIBRARY_MORE: readonly LibraryEntry[] = [
  {
    d: 'eye_front',
    name: 'Auge',
    n: ['Hornhaut', 'Linse', 'Regenbogenhaut', 'Ziliarmuskel', 'Linsenbänder', 'Glaskörper'],
    taps: [
      ['Tippe auf die Linse.', 'Linse'],
      ['Tippe auf die Pupille.', 'Pupille'],
    ],
  },
  {
    d: 'flower_section',
    name: 'Blüte',
    n: ['Narbe', 'Griffel', 'Fruchtknoten', 'Samenanlage', 'Staubblatt', 'Kronblatt'],
    taps: [
      ['Tippe auf die Narbe.', 'Narbe'],
      ['Tippe auf ein Staubblatt.', 'Staubblatt'],
    ],
  },
  {
    d: 'insect_head',
    name: 'Insektenkopf',
    n: ['Facettenauge', 'Punktaugen', 'Fühler', 'Oberkiefer', 'Kopf'],
    taps: [['Tippe auf ein Facettenauge.', 'Facettenauge']],
  },
  {
    d: 'distillation',
    name: 'Destillation',
    n: ['Rundkolben', 'Thermometer', 'Liebigkühler', 'Kühlwasserzulauf', 'Vorlage', 'Destillat'],
    taps: [['Tippe auf den Liebigkühler.', 'Liebigkühler']],
  },
  {
    d: 'teeth',
    name: 'Gebiss',
    n: ['Schneidezahn', 'Eckzahn', 'Vormahlzahn', 'Mahlzahn', 'Zahnfleisch'],
    taps: [['Tippe auf einen Eckzahn.', 'Eckzahn']],
  },
  {
    d: 'joint',
    name: 'Gelenk',
    n: ['Gelenkkopf', 'Gelenkpfanne', 'Gelenkknorpel', 'Gelenkspalt', 'Gelenkkapsel', 'Knochen'],
    taps: [['Tippe auf die Gelenkpfanne.', 'Gelenkpfanne']],
  },
  {
    d: 'breathing',
    name: 'Atmungsorgane',
    n: ['Nasenhöhle', 'Kehlkopf', 'Luftröhre', 'Bronchien', 'Lunge', 'Zwerchfell'],
    taps: [['Tippe auf das Zwerchfell.', 'Zwerchfell']],
  },
  {
    d: 'digestion',
    name: 'Verdauungsorgane',
    n: ['Speiseröhre', 'Magen', 'Leber', 'Bauchspeicheldrüse', 'Dünndarm', 'Dickdarm'],
    taps: [['Tippe auf die Gallenblase.', 'Gallenblase']],
  },
  {
    d: 'leaf',
    name: 'Blattquerschnitt',
    n: [
      'Kutikula',
      'obere Epidermis',
      'Palisadengewebe',
      'Schwammgewebe',
      'Leitbündel',
      'Spaltöffnung',
    ],
    taps: [['Tippe auf eine Spaltöffnung.', 'Spaltöffnung']],
  },
];

/** The rest of #462's drawings: a second run, a run holds 25 questions at most. */
const LIBRARY_REST: readonly LibraryEntry[] = [
  {
    d: 'neuron',
    name: 'Nervenzelle',
    n: ['Dendriten', 'Zellkörper', 'Zellkern', 'Axon', 'Myelinscheide', 'Endknöpfchen'],
    taps: [['Tippe auf die Myelinscheide.', 'Myelinscheide']],
  },
  {
    d: 'mushroom',
    name: 'Pilz',
    n: ['Hut', 'Lamellen', 'Ring', 'Stiel', 'Myzel'],
    taps: [['Tippe auf das Myzel.', 'Myzel']],
  },
  {
    d: 'earth',
    name: 'Schalenbau der Erde',
    n: ['Erdkruste', 'Erdmantel', 'äußerer Kern', 'innerer Kern'],
    taps: [['Tippe auf den äußeren Kern.', 'äußerer Kern']],
  },
  {
    d: 'volcano',
    name: 'Vulkan',
    n: ['Magmakammer', 'Schlot', 'Krater', 'Lava', 'Aschewolke', 'Nebenschlot'],
    taps: [['Tippe auf die Magmakammer.', 'Magmakammer']],
  },
  {
    d: 'compass',
    name: 'Himmelsrichtungen',
    n: ['Norden', 'Osten', 'Süden', 'Westen', 'Nordosten', 'Südwesten'],
    taps: [['Tippe auf Osten.', 'Osten']],
  },
  {
    d: 'thermometer',
    name: 'Thermometer',
    n: ['Skala', 'Steigröhrchen', 'Thermometerflüssigkeit', 'Vorratsgefäß'],
    taps: [['Tippe auf das Vorratsgefäß.', 'Vorratsgefäß']],
  },
  {
    d: 'moon_phases',
    name: 'Mondphasen',
    n: ['Neumond', 'zunehmender Halbmond', 'Vollmond', 'abnehmender Halbmond'],
    taps: [['Tippe auf den Vollmond.', 'Vollmond']],
  },
  {
    d: 'seedling',
    name: 'Keimling',
    n: ['Hauptwurzel', 'Seitenwurzeln', 'Sprossachse', 'Keimblatt', 'Blatt'],
    taps: [['Tippe auf ein Keimblatt.', 'Keimblatt']],
  },
  {
    d: 'circuit',
    name: 'Stromkreis',
    n: ['Batterie', 'Glühlampe', 'Lampenfassung', 'Schalter', 'Kabel'],
    taps: [['Tippe auf den Schalter.', 'Schalter']],
  },
];

export const LIBRARY_MORE_ITEMS = libraryItems(LIBRARY_MORE);
export const LIBRARY_REST_ITEMS = libraryItems(LIBRARY_REST);

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
  // A part to name on a picture that cannot be read (no such drawing): without its picture
  // "Wie heißt Teil 3?" is no question (#481).
  {
    ...base,
    prompt: 'Wie heißt Teil 3?',
    answer: 'Chloroplast',
    figure: {
      type: 'schematic',
      d: 'spaceship',
      n: ['Zellkern', 'Vakuole', 'Chloroplast'],
      ask: 3,
    },
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
    when: /Neue Bilder/i,
    answer: () => ({
      usable: true,
      title: 'Neue Bilder',
      subject: { name: 'Biologie', kind: 'biology' },
      items: LIBRARY_MORE_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns die neuen bilder/i,
    answer: says('Gern – heute zeige ich dir die neuen Bilder.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Neue Bilder' } },
    ]),
  });
  scriptGenerations({
    when: /Noch mehr Bilder/i,
    answer: () => ({
      usable: true,
      title: 'Noch mehr Bilder',
      subject: { name: 'Sachunterricht', kind: 'other' },
      items: LIBRARY_REST_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns noch mehr bilder/i,
    answer: says('Gern – hier sind noch mehr Bilder.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Noch mehr Bilder' } },
    ]),
  });
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
