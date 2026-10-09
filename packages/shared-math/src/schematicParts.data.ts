// The names of the parts more than one drawing of the picture library shows (issues #252, #462):
// a cell's nucleus, the eye's lens in the whole eye and in its front part, the stamen in both
// flowers. A part has one name wherever it is drawn — written once, here, and gathered by the
// drawings' name files (`schematics.data.ts` and the files it gathers).

import type { RegionLang } from './regions.js';

type Names = readonly [de: string, en: string, fr: string, es: string, it: string];

export const named = ([de, en, fr, es, it]: Names): Record<RegionLang, string> => ({
  de,
  en,
  fr,
  es,
  it,
});

export const part = (id: string, names: Names, alt: readonly string[] = []) => ({
  id,
  ...named(names),
  alt,
});

/** The parts every cell has, plant or animal: one name for both drawings. */
export const CYTOPLASM = part(
  'cytoplasm',
  ['Zellplasma', 'cytoplasm', 'cytoplasme', 'citoplasma', 'citoplasma'],
  ['Cytoplasma', 'Zytoplasma', 'Plasma'],
);
export const MEMBRANE = part(
  'membrane',
  ['Zellmembran', 'cell membrane', 'membrane plasmique', 'membrana celular', 'membrana cellulare'],
  ['Membran', 'Plasmamembran', 'Zellhaut'],
);
export const NUCLEUS = part(
  'nucleus',
  ['Zellkern', 'nucleus', 'noyau', 'núcleo', 'nucleo'],
  ['Kern', 'Nukleus', 'Nucleus'],
);
export const MITOCHONDRION = part(
  'mitochondrion',
  ['Mitochondrium', 'mitochondrion', 'mitochondrie', 'mitocondria', 'mitocondrio'],
  ['Mitochondrien', 'Mitochondrion'],
);

export const FLOWER = {
  stalk: part(
    'stalk',
    ['Blütenstiel', 'flower stalk', 'pédoncule', 'pedúnculo', 'peduncolo'],
    ['Stiel', 'Stängel'],
  ),
  sepal: part(
    'sepal',
    ['Kelchblatt', 'sepal', 'sépale', 'sépalo', 'sepalo'],
    ['Kelchblätter', 'Kelch'],
  ),
  petal: part(
    'petal',
    ['Kronblatt', 'petal', 'pétale', 'pétalo', 'petalo'],
    ['Kronblätter', 'Blütenblatt', 'Blütenblätter'],
  ),
  receptacle: part('receptacle', [
    'Blütenboden',
    'receptacle',
    'réceptacle',
    'receptáculo',
    'ricettacolo',
  ]),
  stamen: part(
    'stamen',
    ['Staubblatt', 'stamen', 'étamine', 'estambre', 'stame'],
    ['Staubblätter', 'Staubgefäß', 'Staubgefäße', 'Staubbeutel'],
  ),
  ovary: part('ovary', ['Fruchtknoten', 'ovary', 'ovaire', 'ovario', 'ovario']),
  style: part('style', ['Griffel', 'style', 'style', 'estilo', 'stilo']),
  stigma: part('stigma', ['Narbe', 'stigma', 'stigmate', 'estigma', 'stigma']),
};

export const EYE = {
  optic_nerve: part('optic_nerve', [
    'Sehnerv',
    'optic nerve',
    'nerf optique',
    'nervio óptico',
    'nervo ottico',
  ]),
  vitreous: part(
    'vitreous',
    ['Glaskörper', 'vitreous body', 'corps vitré', 'cuerpo vítreo', 'corpo vitreo'],
    ['Glaskoerper'],
  ),
  retina: part('retina', ['Netzhaut', 'retina', 'rétine', 'retina', 'retina'], ['Retina']),
  sclera: part(
    'sclera',
    ['Lederhaut', 'sclera', 'sclérotique', 'esclerótica', 'sclera'],
    ['Sklera'],
  ),
  cornea: part(
    'cornea',
    ['Hornhaut', 'cornea', 'cornée', 'córnea', 'cornea'],
    ['Cornea', 'Kornea'],
  ),
  lens: part('lens', ['Linse', 'lens', 'cristallin', 'cristalino', 'cristallino'], ['Augenlinse']),
  iris: part('iris', ['Regenbogenhaut', 'iris', 'iris', 'iris', 'iride'], ['Iris']),
  pupil: part('pupil', ['Pupille', 'pupil', 'pupille', 'pupila', 'pupilla'], ['Sehloch']),
};

export const TOOTH = {
  jawbone: part(
    'jawbone',
    ['Kieferknochen', 'jawbone', 'os maxillaire', 'hueso maxilar', 'osso mascellare'],
    ['Kiefer', 'Knochen'],
  ),
  gum: part('gum', ['Zahnfleisch', 'gum', 'gencive', 'encía', 'gengiva'], ['Gingiva']),
  dentin: part('dentin', ['Zahnbein', 'dentin', 'dentine', 'dentina', 'dentina'], ['Dentin']),
  enamel: part('enamel', ['Zahnschmelz', 'enamel', 'émail', 'esmalte', 'smalto'], ['Schmelz']),
  pulp: part('pulp', ['Zahnmark', 'pulp', 'pulpe', 'pulpa', 'polpa'], ['Pulpa', 'Zahnpulpa']),
};

export const INSECT = {
  leg: part('leg', ['Bein', 'leg', 'patte', 'pata', 'zampa'], ['Beine', 'Laufbein']),
  wing: part('wing', ['Flügel', 'wing', 'aile', 'ala', 'ala'], ['Fluegel']),
  abdomen: part('abdomen', ['Hinterleib', 'abdomen', 'abdomen', 'abdomen', 'addome'], ['Abdomen']),
  thorax: part(
    'thorax',
    ['Brust', 'thorax', 'thorax', 'tórax', 'torace'],
    ['Bruststück', 'Thorax'],
  ),
  head: part('head', ['Kopf', 'head', 'tête', 'cabeza', 'testa']),
  eye: part(
    'eye',
    ['Facettenauge', 'compound eye', 'œil composé', 'ojo compuesto', 'occhio composto'],
    ['Komplexauge', 'Auge', 'Augen'],
  ),
  antenna: part(
    'antenna',
    ['Fühler', 'antenna', 'antenne', 'antena', 'antenna'],
    ['Antenne', 'Antennen'],
  ),
};

export const LAB = {
  test_tube: part(
    'test_tube',
    ['Reagenzglas', 'test tube', 'tube à essai', 'tubo de ensayo', 'provetta'],
    ['Reagenzgläser'],
  ),
  beaker: part(
    'beaker',
    ['Becherglas', 'beaker', 'bécher', 'vaso de precipitados', 'becher'],
    ['Becher'],
  ),
  erlenmeyer: part(
    'erlenmeyer',
    ['Erlenmeyerkolben', 'Erlenmeyer flask', 'erlenmeyer', 'matraz Erlenmeyer', 'beuta'],
    ['Erlenmeyer'],
  ),
  round_flask: part(
    'round_flask',
    ['Rundkolben', 'round-bottom flask', 'ballon', 'matraz de fondo redondo', 'pallone'],
    ['Kolben'],
  ),
  cylinder: part(
    'cylinder',
    ['Messzylinder', 'measuring cylinder', 'éprouvette graduée', 'probeta', 'cilindro graduato'],
    ['Standzylinder'],
  ),
  funnel: part('funnel', ['Trichter', 'funnel', 'entonnoir', 'embudo', 'imbuto'], []),
  burner: part(
    'burner',
    ['Bunsenbrenner', 'Bunsen burner', 'bec Bunsen', 'mechero Bunsen', 'becco Bunsen'],
    ['Brenner', 'Gasbrenner'],
  ),
  tripod: part('tripod', ['Dreifuß', 'tripod', 'trépied', 'trípode', 'treppiede'], ['Dreifuss']),
};

export const ORGANS = {
  kidneys: part('kidneys', ['Nieren', 'kidneys', 'reins', 'riñones', 'reni'], ['Niere']),
  large_intestine: part(
    'large_intestine',
    ['Dickdarm', 'large intestine', 'gros intestin', 'intestino grueso', 'intestino crasso'],
    ['Darm'],
  ),
  small_intestine: part(
    'small_intestine',
    ['Dünndarm', 'small intestine', 'intestin grêle', 'intestino delgado', 'intestino tenue'],
    ['Gedärm'],
  ),
  bladder: part('bladder', ['Harnblase', 'bladder', 'vessie', 'vejiga', 'vescica'], ['Blase']),
  liver: part('liver', ['Leber', 'liver', 'foie', 'hígado', 'fegato'], []),
  stomach: part('stomach', ['Magen', 'stomach', 'estomac', 'estómago', 'stomaco'], []),
  lungs: part(
    'lungs',
    ['Lunge', 'lungs', 'poumons', 'pulmones', 'polmoni'],
    ['Lungen', 'Lungenflügel'],
  ),
  trachea: part(
    'trachea',
    ['Luftröhre', 'windpipe', 'trachée', 'tráquea', 'trachea'],
    ['Bronchien'],
  ),
  heart: part('heart', ['Herz', 'heart', 'cœur', 'corazón', 'cuore'], []),
  brain: part('brain', ['Gehirn', 'brain', 'cerveau', 'cerebro', 'cervello'], ['Hirn']),
};

export const PLANT = {
  root: part('root', ['Wurzel', 'root', 'racine', 'raíz', 'radice'], ['Wurzeln']),
  stem: part(
    'stem',
    ['Sprossachse', 'stem', 'tige', 'tallo', 'fusto'],
    ['Stängel', 'Stiel', 'Spross'],
  ),
  leaf: part('leaf', ['Blatt', 'leaf', 'feuille', 'hoja', 'foglia'], ['Blätter', 'Laubblatt']),
  blossom: part('blossom', ['Blüte', 'flower', 'fleur', 'flor', 'fiore'], ['Blütenkopf']),
};
