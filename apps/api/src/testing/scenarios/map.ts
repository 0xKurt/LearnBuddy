// Scripted model answers for questions on a stumme Karte (issue #251): a Land to tap on the map of
// Germany, a marked country to name on the map of Europe, a country too small for the whole of
// Europe that code zooms to (#429), a river to tap and a marked one to name, a capital to tap, a marked range to name, a
// continent to tap on the world map; and on the Gradnetz (#429) a crossing to tap on Germany and on
// Europe and the coordinates of a marked one on the world map to type. Shared by the integration test
// (`__tests__/map-figures.int.test.ts`) and the browser walkthrough (tests/web/tap-figures.spec.ts). Every name here is a region of its map and passes the server's own
// check (`modules/practice/mapCheck.ts`). Test tooling only; answers are keyed by the learner's
// text, never guessed.
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
};

/** The questions, in the order the walkthrough answers them. */
export const MAP_ITEMS = [
  {
    ...base,
    prompt: 'Tippe auf Bayern.',
    answer: 'Bayern',
    topic: 'Bundesländer',
    tap: true,
    figure: { type: 'map', v: 'de', hl: [] },
  },
  {
    ...base,
    prompt: 'Wie heißt das markierte Land?',
    answer: 'Frankreich',
    topic: 'Länder Europas',
    // Named as the model may write it: in English. Code resolves it, and stores the id.
    figure: { type: 'map', v: 'europe', hl: ['France'] },
  },
  // Too small to tap on the whole of Europe: code shows the closer Ausschnitt (#429).
  {
    ...base,
    prompt: 'Tippe auf Luxemburg.',
    answer: 'Luxemburg',
    topic: 'Länder Europas',
    tap: true,
    figure: { type: 'map', v: 'europe', hl: [] },
  },
  {
    ...base,
    prompt: 'Tippe auf den Rhein.',
    answer: 'Rhein',
    topic: 'Flüsse',
    tap: true,
    figure: { type: 'map', v: 'de', hl: [], l: 'rivers' },
  },
  {
    ...base,
    prompt: 'Wie heißt der markierte Fluss?',
    answer: 'Elbe',
    topic: 'Flüsse',
    figure: { type: 'map', v: 'de', hl: ['Elbe'], l: 'rivers' },
  },
  {
    ...base,
    prompt: 'Tippe auf München.',
    answer: 'München',
    topic: 'Landeshauptstädte',
    tap: true,
    figure: { type: 'map', v: 'de', hl: [], l: 'cities' },
  },
  {
    ...base,
    prompt: 'Wie heißt das markierte Gebirge?',
    answer: 'Harz',
    topic: 'Gebirge',
    figure: { type: 'map', v: 'de', hl: ['Harz'], l: 'mountains' },
  },
  {
    ...base,
    prompt: 'Tippe auf Südamerika.',
    answer: 'Südamerika',
    topic: 'Kontinente',
    tap: true,
    figure: { type: 'map', v: 'world', hl: [] },
  },
];

/** The Gradnetz (#429): a crossing to tap, every degree on Germany, every ten on Europe… */
export const GRID_ITEMS = [
  {
    ...base,
    prompt: 'Tippe auf den Punkt 50° N, 10° O.',
    answer: '50° N, 10° O',
    topic: 'Gradnetz',
    tap: true,
    figure: { type: 'map', v: 'de', hl: [], l: 'grid' },
  },
  {
    ...base,
    prompt: 'Tippe auf den Punkt 60° N, 10° O.',
    answer: '60°N 10°O',
    topic: 'Gradnetz',
    tap: true,
    figure: { type: 'map', v: 'europe', hl: [], l: 'grid' },
  },
  // …and the coordinates of a marked one to type, on the world map.
  {
    ...base,
    prompt: 'Welche Koordinaten hat der markierte Punkt?',
    answer: '30° S, 60° W',
    topic: 'Gradnetz',
    figure: { type: 'map', v: 'world', hl: ['30° S, 60° W'], l: 'grid' },
  },
];

/**
 * The marked crossing as a French model writes it: "60° O" is WEST in French (ouest). Code reads
 * it in her language and stores what reads one way everywhere (`mapGrid.ts`).
 */
export const FRENCH_GRID_ITEM = {
  ...GRID_ITEMS[2]!,
  prompt: 'Quelles sont les coordonnées du point marqué ?',
  answer: '30° S, 60° O',
  prompt_lang: 'fr',
  figure: { type: 'map', v: 'world', hl: ['30° S, 60° O'], l: 'grid' },
};

/** Map questions that cannot be asked as written: none of them may reach the database. */
export const BROKEN_MAP_ITEMS = [
  // A region the map does not have: Bavaria is no country of Europe.
  {
    ...MAP_ITEMS[1]!,
    prompt: 'Wie heißt das markierte Gebiet?',
    figure: { type: 'map', v: 'europe', hl: ['Bayern'] },
  },
  // The key to tap is marked already: the tap would only copy it.
  {
    ...MAP_ITEMS[0]!,
    prompt: 'Tippe auf Hessen.',
    answer: 'Hessen',
    figure: { type: 'map', v: 'de', hl: ['Hessen'] },
  },
  // A country too small for a finger even on the closest Ausschnitt: Kosovo is named, never tapped.
  {
    ...MAP_ITEMS[0]!,
    prompt: 'Tippe auf den Kosovo.',
    answer: 'Kosovo',
    figure: { type: 'map', v: 'europe', hl: [] },
  },
  // A key that is no region of the map: a city on the layer of regions.
  { ...MAP_ITEMS[0]!, prompt: 'Tippe auf Stuttgart.', answer: 'Stuttgart' },
  // A capital too close to another for a finger: Potsdam beside Berlin.
  {
    ...MAP_ITEMS[0]!,
    prompt: 'Tippe auf Potsdam.',
    answer: 'Potsdam',
    figure: { type: 'map', v: 'de', hl: [], l: 'cities' },
  },
  // A river the map does not have: the Volga does not flow through Germany.
  {
    ...MAP_ITEMS[0]!,
    prompt: 'Tippe auf die Wolga.',
    answer: 'Wolga',
    figure: { type: 'map', v: 'de', hl: [], l: 'rivers' },
  },
  // A layer the map does not have: the world map shows continents only.
  {
    ...MAP_ITEMS[0]!,
    prompt: 'Tippe auf den Nil.',
    answer: 'Nil',
    figure: { type: 'map', v: 'world', hl: [], l: 'rivers' },
  },
  // A point where no two lines of the Gradnetz cross: Europe's run every ten degrees.
  {
    ...GRID_ITEMS[1]!,
    prompt: 'Tippe auf den Punkt 55° N, 10° O.',
    answer: '55° N, 10° O',
  },
  // A crossing off the map: 40° N, 40° O lies beyond the frame of Europe.
  {
    ...GRID_ITEMS[1]!,
    prompt: 'Tippe auf den Punkt 40° N, 40° O.',
    answer: '40° N, 40° O',
  },
  // Too close for a finger: towards the poles the world's meridians close in.
  {
    ...GRID_ITEMS[0]!,
    prompt: 'Tippe auf den Punkt 60° N, 90° O.',
    answer: '60° N, 90° O',
    figure: { type: 'map', v: 'world', hl: [], l: 'grid' },
  },
  // What lies at a point is no fact of the Gradnetz: the key is no crossing.
  {
    ...GRID_ITEMS[2]!,
    prompt: 'Welcher Kontinent liegt am markierten Punkt?',
    answer: 'Südamerika',
  },
  // The typed key is not the marked crossing.
  {
    ...GRID_ITEMS[2]!,
    prompt: 'Welche Koordinaten hat der Punkt östlich davon?',
    answer: '30° S, 30° W',
  },
  // A Gradnetz on a closer Ausschnitt, which has none.
  {
    ...GRID_ITEMS[1]!,
    prompt: 'Tippe in Mitteleuropa auf den Punkt 50° N, 10° O.',
    answer: '50° N, 10° O',
    figure: { type: 'map', v: 'eu_central', hl: [], l: 'grid' },
  },
  // The typed key is not the marked region.
  { ...MAP_ITEMS[1]!, prompt: 'Welches Land liegt westlich davon?', answer: 'Spanien' },
  // A fact the map data does not hold: a capital.
  { ...MAP_ITEMS[1]!, prompt: 'Wie heißt die Hauptstadt des markierten Landes?', answer: 'Paris' },
  // Two marked regions, one name asked: which?
  { ...MAP_ITEMS[1]!, figure: { type: 'map', v: 'europe', hl: ['Frankreich', 'Spanien'] } },
  // A map question that is no short answer.
  {
    ...MAP_ITEMS[1]!,
    kind: 'multiple_choice',
    choices: ['Frankreich', 'Spanien'],
    correct_choice: 0,
  },
];

/**
 * Maps as the OPTIONS of a multiple choice (#479): each option marks one Land, its text names it.
 * Named as the model may write them; code stores each marked Land by its id.
 */
export const MAP_OPTION_ITEM = {
  ...base,
  kind: 'multiple_choice',
  prompt: 'Auf welcher Karte ist Bayern markiert?',
  answer: 'Bayern',
  topic: 'Bundesländer',
  choices: ['Bayern', 'Hessen', 'Sachsen'],
  correct_choice: 0,
  choice_figures: [
    { type: 'map', v: 'de', hl: ['Bavaria'] },
    { type: 'map', v: 'de', hl: ['Hessen'] },
    { type: 'map', v: 'de', hl: ['Sachsen'] },
  ],
};

/** What the map check holds a question to beyond its own map (#479): none may be stored. */
export const BROKEN_MAP_OPTION_ITEMS = [
  // An option marks a region the map does not have.
  {
    ...MAP_OPTION_ITEM,
    prompt: 'Welche Karte zeigt Bayern?',
    choice_figures: [
      { type: 'map', v: 'de', hl: ['Bayern'] },
      { type: 'map', v: 'de', hl: ['Atlantis'] },
      { type: 'map', v: 'de', hl: ['Sachsen'] },
    ],
  },
  // An option marks another Land than its text names: "Hessen" shows Thüringen.
  {
    ...MAP_OPTION_ITEM,
    prompt: 'Wo liegt Bayern?',
    choice_figures: [
      { type: 'map', v: 'de', hl: ['Bayern'] },
      { type: 'map', v: 'de', hl: ['Thüringen'] },
      { type: 'map', v: 'de', hl: ['Sachsen'] },
    ],
  },
  // The marked country to name on a map that cannot be read (no such view): without its map the
  // question is none.
  {
    ...MAP_ITEMS[1]!,
    prompt: 'Wie heißt das markierte Land in Europa?',
    figure: { type: 'map', v: 'mars', hl: ['Frankreich'] },
  },
];

export function scriptMap(): void {
  scriptGenerations({
    when: /Karten lesen/i,
    answer: () => ({
      usable: true,
      title: 'Karten lesen',
      subject: { name: 'Erdkunde', kind: 'geography' },
      items: MAP_ITEMS,
    }),
  });
  scriptGenerations({
    when: /Lage im Gradnetz/i,
    answer: () => ({
      usable: true,
      title: 'Lage im Gradnetz',
      subject: { name: 'Erdkunde', kind: 'geography' },
      items: GRID_ITEMS,
    }),
  });
  scriptTurns({
    when: /lass uns karten üben/i,
    answer: says('Gern – heute zeigst du mir die Orte direkt auf der Karte.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Karten lesen' } },
    ]),
  });
  scriptTurns({
    when: /lass uns das gradnetz üben/i,
    answer: says('Gern – heute findest du Punkte im Gradnetz.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Lage im Gradnetz' } },
    ]),
  });
}
