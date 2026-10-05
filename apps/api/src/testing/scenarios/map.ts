// Scripted model answers for questions on a stumme Karte (issue #251): a Land to tap on the map of
// Germany, a marked country to name on the map of Europe, a country too small for the whole of
// Europe that code zooms to (#429), a river to tap and a marked one to name, a capital to tap, a marked range to name, a
// continent to tap on the world map. Shared by the integration test
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
  scriptTurns({
    when: /lass uns karten üben/i,
    answer: says('Gern – heute zeigst du mir die Orte direkt auf der Karte.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Karten lesen' } },
    ]),
  });
}
