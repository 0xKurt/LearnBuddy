// The picture library by name (issue #252): every drawing and every part with its name in the
// five languages and the other names a teacher accepts. Small and static: the server checks every
// question against it and the tap mechanism resolves a name with it (`schematics.ts`). Where each
// part stands is `schematicShapes.data.ts`, loaded by the app with the first picture.

import type { RegionLang } from './regions.js';
import type { SchematicNames } from './schematics.js';

type Names = readonly [de: string, en: string, fr: string, es: string, it: string];

const named = ([de, en, fr, es, it]: Names): Record<RegionLang, string> => ({ de, en, fr, es, it });

const part = (id: string, names: Names, alt: readonly string[] = []) => ({
  id,
  ...named(names),
  alt,
});

/** The parts every cell has, plant or animal: one name for both drawings. */
const CYTOPLASM = part(
  'cytoplasm',
  ['Zellplasma', 'cytoplasm', 'cytoplasme', 'citoplasma', 'citoplasma'],
  ['Cytoplasma', 'Zytoplasma', 'Plasma'],
);
const MEMBRANE = part(
  'membrane',
  ['Zellmembran', 'cell membrane', 'membrane plasmique', 'membrana celular', 'membrana cellulare'],
  ['Membran', 'Plasmamembran', 'Zellhaut'],
);
const NUCLEUS = part(
  'nucleus',
  ['Zellkern', 'nucleus', 'noyau', 'núcleo', 'nucleo'],
  ['Kern', 'Nukleus', 'Nucleus'],
);
const MITOCHONDRION = part(
  'mitochondrion',
  ['Mitochondrium', 'mitochondrion', 'mitochondrie', 'mitocondria', 'mitocondrio'],
  ['Mitochondrien', 'Mitochondrion'],
);

export const SCHEMATIC_NAMES: SchematicNames = {
  plant_cell: {
    names: named([
      'Pflanzenzelle',
      'plant cell',
      'cellule végétale',
      'célula vegetal',
      'cellula vegetale',
    ]),
    height: 720,
    parts: [
      CYTOPLASM,
      MEMBRANE,
      part(
        'wall',
        ['Zellwand', 'cell wall', 'paroi cellulaire', 'pared celular', 'parete cellulare'],
        ['Wand'],
      ),
      part(
        'vacuole',
        ['Vakuole', 'vacuole', 'vacuole', 'vacuola', 'vacuolo'],
        ['Zellsaftvakuole', 'Zentralvakuole'],
      ),
      NUCLEUS,
      part(
        'chloroplast',
        ['Chloroplast', 'chloroplast', 'chloroplaste', 'cloroplasto', 'cloroplasto'],
        ['Chloroplasten', 'Blattgrünkorn', 'Blattgrünkörner'],
      ),
      MITOCHONDRION,
    ],
  },
  animal_cell: {
    names: named([
      'Tierzelle',
      'animal cell',
      'cellule animale',
      'célula animal',
      'cellula animale',
    ]),
    height: 640,
    parts: [
      CYTOPLASM,
      MEMBRANE,
      NUCLEUS,
      part(
        'nucleolus',
        ['Kernkörperchen', 'nucleolus', 'nucléole', 'nucléolo', 'nucleolo'],
        ['Nukleolus', 'Nucleolus'],
      ),
      MITOCHONDRION,
    ],
  },
  flower: {
    names: named([
      'Blüte (Längsschnitt)',
      'flower (section)',
      'fleur (coupe)',
      'flor (corte)',
      'fiore (sezione)',
    ]),
    height: 820,
    parts: [
      part(
        'stalk',
        ['Blütenstiel', 'flower stalk', 'pédoncule', 'pedúnculo', 'peduncolo'],
        ['Stiel', 'Stängel'],
      ),
      part(
        'sepal',
        ['Kelchblatt', 'sepal', 'sépale', 'sépalo', 'sepalo'],
        ['Kelchblätter', 'Kelch'],
      ),
      part(
        'petal',
        ['Kronblatt', 'petal', 'pétale', 'pétalo', 'petalo'],
        ['Kronblätter', 'Blütenblatt', 'Blütenblätter'],
      ),
      part('receptacle', ['Blütenboden', 'receptacle', 'réceptacle', 'receptáculo', 'ricettacolo']),
      part(
        'stamen',
        ['Staubblatt', 'stamen', 'étamine', 'estambre', 'stame'],
        ['Staubblätter', 'Staubgefäß', 'Staubgefäße', 'Staubbeutel'],
      ),
      part('ovary', ['Fruchtknoten', 'ovary', 'ovaire', 'ovario', 'ovario']),
      part('style', ['Griffel', 'style', 'style', 'estilo', 'stilo']),
      part('stigma', ['Narbe', 'stigma', 'stigmate', 'estigma', 'stigma']),
    ],
  },
  plant: {
    names: named(['Pflanze', 'plant', 'plante', 'planta', 'pianta']),
    height: 880,
    parts: [
      part('root', ['Wurzel', 'root', 'racine', 'raíz', 'radice'], ['Wurzeln']),
      part(
        'stem',
        ['Sprossachse', 'stem', 'tige', 'tallo', 'fusto'],
        ['Stängel', 'Stiel', 'Spross'],
      ),
      part('leaf', ['Blatt', 'leaf', 'feuille', 'hoja', 'foglia'], ['Blätter', 'Laubblatt']),
      part('blossom', ['Blüte', 'flower', 'fleur', 'flor', 'fiore'], ['Blütenkopf']),
    ],
  },
  eye: {
    names: named([
      'Auge (Querschnitt)',
      'eye (section)',
      'œil (coupe)',
      'ojo (corte)',
      'occhio (sezione)',
    ]),
    height: 640,
    parts: [
      part('optic_nerve', [
        'Sehnerv',
        'optic nerve',
        'nerf optique',
        'nervio óptico',
        'nervo ottico',
      ]),
      part(
        'vitreous',
        ['Glaskörper', 'vitreous body', 'corps vitré', 'cuerpo vítreo', 'corpo vitreo'],
        ['Glaskoerper'],
      ),
      part('retina', ['Netzhaut', 'retina', 'rétine', 'retina', 'retina'], ['Retina']),
      part('sclera', ['Lederhaut', 'sclera', 'sclérotique', 'esclerótica', 'sclera'], ['Sklera']),
      part('cornea', ['Hornhaut', 'cornea', 'cornée', 'córnea', 'cornea'], ['Cornea', 'Kornea']),
      part('lens', ['Linse', 'lens', 'cristallin', 'cristalino', 'cristallino'], ['Augenlinse']),
      part('iris', ['Regenbogenhaut', 'iris', 'iris', 'iris', 'iride'], ['Iris']),
      part('pupil', ['Pupille', 'pupil', 'pupille', 'pupila', 'pupilla'], ['Sehloch']),
    ],
  },
  tooth: {
    names: named([
      'Zahn (Längsschnitt)',
      'tooth (section)',
      'dent (coupe)',
      'diente (corte)',
      'dente (sezione)',
    ]),
    height: 900,
    parts: [
      part(
        'jawbone',
        ['Kieferknochen', 'jawbone', 'os maxillaire', 'hueso maxilar', 'osso mascellare'],
        ['Kiefer', 'Knochen'],
      ),
      part('gum', ['Zahnfleisch', 'gum', 'gencive', 'encía', 'gengiva'], ['Gingiva']),
      part('dentin', ['Zahnbein', 'dentin', 'dentine', 'dentina', 'dentina'], ['Dentin']),
      part('enamel', ['Zahnschmelz', 'enamel', 'émail', 'esmalte', 'smalto'], ['Schmelz']),
      part('pulp', ['Zahnmark', 'pulp', 'pulpe', 'pulpa', 'polpa'], ['Pulpa', 'Zahnpulpa']),
    ],
  },
  insect: {
    names: named(['Insekt', 'insect', 'insecte', 'insecto', 'insetto']),
    height: 820,
    parts: [
      part('leg', ['Bein', 'leg', 'patte', 'pata', 'zampa'], ['Beine', 'Laufbein']),
      part('wing', ['Flügel', 'wing', 'aile', 'ala', 'ala'], ['Fluegel']),
      part('abdomen', ['Hinterleib', 'abdomen', 'abdomen', 'abdomen', 'addome'], ['Abdomen']),
      part('thorax', ['Brust', 'thorax', 'thorax', 'tórax', 'torace'], ['Bruststück', 'Thorax']),
      part('head', ['Kopf', 'head', 'tête', 'cabeza', 'testa']),
      part(
        'eye',
        ['Facettenauge', 'compound eye', 'œil composé', 'ojo compuesto', 'occhio composto'],
        ['Komplexauge', 'Auge', 'Augen'],
      ),
      part(
        'antenna',
        ['Fühler', 'antenna', 'antenne', 'antena', 'antenna'],
        ['Antenne', 'Antennen'],
      ),
    ],
  },
  bicycle: {
    names: named(['Fahrrad', 'bicycle', 'vélo', 'bicicleta', 'bicicletta']),
    height: 620,
    parts: [
      part('rear_wheel', [
        'Hinterrad',
        'rear wheel',
        'roue arrière',
        'rueda trasera',
        'ruota posteriore',
      ]),
      part('front_wheel', [
        'Vorderrad',
        'front wheel',
        'roue avant',
        'rueda delantera',
        'ruota anteriore',
      ]),
      part('chain', ['Kette', 'chain', 'chaîne', 'cadena', 'catena'], ['Fahrradkette']),
      part('frame', ['Rahmen', 'frame', 'cadre', 'cuadro', 'telaio'], ['Fahrradrahmen']),
      part('pedal', ['Pedal', 'pedal', 'pédale', 'pedal', 'pedale'], ['Tretkurbel', 'Pedale']),
      part('saddle', ['Sattel', 'saddle', 'selle', 'sillín', 'sella']),
      part('handlebar', ['Lenker', 'handlebar', 'guidon', 'manillar', 'manubrio'], ['Lenkstange']),
      part('bell', ['Klingel', 'bell', 'sonnette', 'timbre', 'campanello'], ['Fahrradklingel']),
      part(
        'headlight',
        ['Scheinwerfer', 'headlight', 'phare', 'faro', 'faro anteriore'],
        ['Vorderlicht', 'Frontlicht', 'Lampe'],
      ),
      part(
        'rear_light',
        ['Rücklicht', 'rear light', 'feu arrière', 'luz trasera', 'luce posteriore'],
        ['Rückleuchte', 'Schlusslicht'],
      ),
    ],
  },
};
