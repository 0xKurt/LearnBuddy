// The names of the picture library's drawings of living things from issue #462: the flower, the
// eye and the insect's head drawn large, and the body and plants that school asks to label beyond
// the first two parts (#252). A part another drawing shows too keeps its one name
// (`schematicParts.data.ts`). Gathered by `schematics.data.ts`; where each part stands is
// `schematicDetail.data.ts` and `schematicLife.data.ts`.

import {
  EYE,
  FLOWER,
  INSECT,
  named,
  NUCLEUS,
  ORGANS,
  part,
  PLANT,
  TOOTH,
} from './schematicParts.data.js';
import type { Schematic } from './schematics.js';

export const SCHEMATIC_LIFE_NAMES = {
  flower_section: {
    names: named([
      'Blüte im Längsschnitt (groß)',
      'flower in section (large)',
      'fleur en coupe (grande)',
      'flor en corte (grande)',
      'fiore in sezione (grande)',
    ]),
    parts: [
      ...Object.values(FLOWER),
      part(
        'ovule',
        ['Samenanlage', 'ovule', 'ovule', 'óvulo', 'ovulo'],
        ['Samenanlagen', 'Eizelle'],
      ),
    ],
  },
  eye_front: {
    names: named([
      'Auge (vorderer Teil)',
      'eye (front part)',
      'œil (partie antérieure)',
      'ojo (parte anterior)',
      'occhio (parte anteriore)',
    ]),
    parts: [
      EYE.vitreous,
      EYE.sclera,
      EYE.cornea,
      part(
        'ciliary',
        ['Ziliarmuskel', 'ciliary muscle', 'muscle ciliaire', 'músculo ciliar', 'muscolo ciliare'],
        ['Ziliarkörper', 'Ciliarmuskel', 'Strahlenkörper'],
      ),
      part(
        'zonule',
        ['Linsenbänder', 'zonular fibres', 'zonule', 'zónula', 'zonula'],
        ['Linsenband', 'Zonulafasern', 'Aufhängefasern', 'zonular fibers', 'Zonula'],
      ),
      EYE.lens,
      EYE.iris,
      EYE.pupil,
    ],
  },
  insect_head: {
    names: named([
      'Insektenkopf',
      'insect head',
      'tête d’insecte',
      'cabeza de insecto',
      'testa di insetto',
    ]),
    parts: [
      INSECT.head,
      INSECT.eye,
      part(
        'ocelli',
        ['Punktaugen', 'ocelli', 'ocelles', 'ocelos', 'ocelli'],
        ['Punktauge', 'Stirnaugen', 'Nebenaugen', 'Ocellen'],
      ),
      INSECT.antenna,
      part(
        'mandible',
        ['Oberkiefer', 'mandibles', 'mandibules', 'mandíbulas', 'mandibole'],
        ['Mandibeln', 'Mandibel', 'Mundwerkzeuge', 'Kiefer', 'Beißwerkzeuge'],
      ),
    ],
  },
  teeth: {
    names: named([
      'Gebiss (Unterkiefer)',
      'teeth (lower jaw)',
      'dents (mâchoire inférieure)',
      'dientes (mandíbula)',
      'denti (mandibola)',
    ]),
    parts: [
      TOOTH.gum,
      part(
        'incisor',
        ['Schneidezahn', 'incisor', 'incisive', 'incisivo', 'incisivo'],
        ['Schneidezähne'],
      ),
      part('canine', ['Eckzahn', 'canine', 'canine', 'canino', 'canino'], ['Eckzähne']),
      part(
        'premolar',
        ['Vormahlzahn', 'premolar', 'prémolaire', 'premolar', 'premolare'],
        ['Vormahlzähne', 'kleiner Backenzahn', 'kleine Backenzähne', 'Prämolar'],
      ),
      part(
        'molar',
        ['Mahlzahn', 'molar', 'molaire', 'molar', 'molare'],
        ['Mahlzähne', 'großer Backenzahn', 'große Backenzähne', 'Molar'],
      ),
    ],
  },
  joint: {
    names: named(['Gelenk', 'joint', 'articulation', 'articulación', 'articolazione']),
    parts: [
      part(
        'cavity',
        ['Gelenkspalt', 'joint cavity', 'cavité synoviale', 'cavidad sinovial', 'cavità sinoviale'],
        ['Gelenkschmiere', 'Gelenkhöhle', 'Gelenkflüssigkeit', 'Synovia', 'synovial fluid'],
      ),
      part('bone', ['Knochen', 'bone', 'os', 'hueso', 'osso'], []),
      part(
        'socket',
        ['Gelenkpfanne', 'socket', 'cavité articulaire', 'cavidad articular', 'cavità articolare'],
        ['Pfanne'],
      ),
      part(
        'joint_head',
        ['Gelenkkopf', 'joint head', 'tête articulaire', 'cabeza articular', 'testa articolare'],
        [],
      ),
      part(
        'cartilage',
        [
          'Gelenkknorpel',
          'cartilage',
          'cartilage articulaire',
          'cartílago articular',
          'cartilagine articolare',
        ],
        ['Knorpel'],
      ),
      part(
        'capsule',
        [
          'Gelenkkapsel',
          'joint capsule',
          'capsule articulaire',
          'cápsula articular',
          'capsula articolare',
        ],
        ['Kapsel'],
      ),
    ],
  },
  breathing: {
    names: named([
      'Atmungsorgane',
      'respiratory organs',
      'organes respiratoires',
      'órganos respiratorios',
      'organi respiratori',
    ]),
    parts: [
      part(
        'nasal_cavity',
        ['Nasenhöhle', 'nasal cavity', 'fosses nasales', 'fosas nasales', 'cavità nasale'],
        ['Nase', 'Nasenraum'],
      ),
      part(
        'mouth',
        ['Mundhöhle', 'oral cavity', 'cavité buccale', 'cavidad bucal', 'cavità orale'],
        ['Mund'],
      ),
      part('pharynx', ['Rachen', 'pharynx', 'pharynx', 'faringe', 'faringe'], ['Rachenraum']),
      part('larynx', ['Kehlkopf', 'larynx', 'larynx', 'laringe', 'laringe'], []),
      ORGANS.lungs,
      { ...ORGANS.trachea, alt: [] },
      part(
        'bronchi',
        ['Bronchien', 'bronchi', 'bronches', 'bronquios', 'bronchi'],
        ['Bronchie', 'Bronchus'],
      ),
      part('diaphragm', ['Zwerchfell', 'diaphragm', 'diaphragme', 'diafragma', 'diaframma'], []),
    ],
  },
  digestion: {
    names: named([
      'Verdauungsorgane',
      'digestive organs',
      'organes digestifs',
      'órganos digestivos',
      'organi digestivi',
    ]),
    parts: [
      ORGANS.liver,
      part(
        'gallbladder',
        ['Gallenblase', 'gallbladder', 'vésicule biliaire', 'vesícula biliar', 'cistifellea'],
        ['Galle'],
      ),
      part(
        'esophagus',
        ['Speiseröhre', 'oesophagus', 'œsophage', 'esófago', 'esofago'],
        ['Ösophagus', 'esophagus', 'gullet'],
      ),
      part(
        'pancreas',
        ['Bauchspeicheldrüse', 'pancreas', 'pancréas', 'páncreas', 'pancreas'],
        ['Pankreas'],
      ),
      ORGANS.stomach,
      ORGANS.small_intestine,
      { ...ORGANS.large_intestine, alt: [] },
      part(
        'appendix',
        ['Blinddarm', 'appendix', 'appendice', 'apéndice', 'appendice'],
        ['Wurmfortsatz', 'Appendix'],
      ),
      part(
        'rectum',
        ['Enddarm', 'rectum', 'rectum', 'recto', 'retto'],
        ['Mastdarm', 'After', 'Darmausgang'],
      ),
    ],
  },
  leaf: {
    names: named([
      'Blattquerschnitt',
      'leaf cross-section',
      'coupe transversale de feuille',
      'corte transversal de hoja',
      'sezione trasversale della foglia',
    ]),
    parts: [
      part(
        'cuticle',
        ['Kutikula', 'cuticle', 'cuticule', 'cutícula', 'cuticola'],
        ['Cuticula', 'Wachsschicht'],
      ),
      part(
        'upper_epidermis',
        [
          'obere Epidermis',
          'upper epidermis',
          'épiderme supérieur',
          'epidermis superior',
          'epidermide superiore',
        ],
        ['obere Oberhaut'],
      ),
      part(
        'palisade',
        [
          'Palisadengewebe',
          'palisade layer',
          'parenchyme palissadique',
          'parénquima en empalizada',
          'tessuto a palizzata',
        ],
        ['Palisadenschicht', 'Palisadenzellen'],
      ),
      part(
        'spongy',
        [
          'Schwammgewebe',
          'spongy layer',
          'parenchyme lacuneux',
          'parénquima esponjoso',
          'tessuto spugnoso',
        ],
        ['Schwammschicht', 'Schwammzellen'],
      ),
      part(
        'vascular_bundle',
        [
          'Leitbündel',
          'vascular bundle',
          'faisceau conducteur',
          'haz vascular',
          'fascio vascolare',
        ],
        ['Blattader', 'Leitgewebe'],
      ),
      part(
        'lower_epidermis',
        [
          'untere Epidermis',
          'lower epidermis',
          'épiderme inférieur',
          'epidermis inferior',
          'epidermide inferiore',
        ],
        ['untere Oberhaut'],
      ),
      part(
        'stoma',
        ['Spaltöffnung', 'stoma', 'stomate', 'estoma', 'stoma'],
        ['Spaltöffnungen', 'Schließzellen', 'Stomata'],
      ),
    ],
  },
  neuron: {
    names: named(['Nervenzelle', 'nerve cell', 'neurone', 'neurona', 'neurone']),
    parts: [
      part(
        'dendrites',
        ['Dendriten', 'dendrites', 'dendrites', 'dendritas', 'dendriti'],
        ['Dendrit'],
      ),
      part(
        'cell_body',
        ['Zellkörper', 'cell body', 'corps cellulaire', 'cuerpo celular', 'corpo cellulare'],
        ['Soma'],
      ),
      NUCLEUS,
      part('axon', ['Axon', 'axon', 'axone', 'axón', 'assone'], ['Neurit', 'Nervenfaser']),
      part(
        'myelin',
        [
          'Myelinscheide',
          'myelin sheath',
          'gaine de myéline',
          'vaina de mielina',
          'guaina mielinica',
        ],
        ['Markscheide', 'Schwann-Zelle', 'Schwannsche Zelle', 'Schwann-Zellen'],
      ),
      part(
        'terminals',
        [
          'Endknöpfchen',
          'axon terminals',
          'boutons terminaux',
          'botones terminales',
          'bottoni sinaptici',
        ],
        ['synaptische Endknöpfchen', 'Synapse', 'Synapsen'],
      ),
    ],
  },
  mushroom: {
    names: named(['Pilz', 'mushroom', 'champignon', 'seta', 'fungo']),
    parts: [
      part(
        'mycelium',
        ['Myzel', 'mycelium', 'mycélium', 'micelio', 'micelio'],
        ['Pilzgeflecht', 'Pilzfäden', 'Hyphen', 'Mycel'],
      ),
      part('stem', ['Stiel', 'stem', 'pied', 'pie', 'gambo'], ['Pilzstiel']),
      part('ring', ['Ring', 'ring', 'anneau', 'anillo', 'anello'], ['Manschette']),
      part('gills', ['Lamellen', 'gills', 'lamelles', 'láminas', 'lamelle'], ['Lamelle']),
      part('cap', ['Hut', 'cap', 'chapeau', 'sombrero', 'cappello'], ['Pilzhut']),
    ],
  },
  seedling: {
    names: named([
      'Keimling (Bohne)',
      'seedling (bean)',
      'plantule (haricot)',
      'plántula (judía)',
      'plantula (fagiolo)',
    ]),
    parts: [
      part(
        'main_root',
        ['Hauptwurzel', 'main root', 'racine principale', 'raíz principal', 'radice principale'],
        ['Keimwurzel', 'Pfahlwurzel'],
      ),
      part(
        'lateral_roots',
        [
          'Seitenwurzeln',
          'lateral roots',
          'racines secondaires',
          'raíces laterales',
          'radici laterali',
        ],
        ['Seitenwurzel', 'Nebenwurzeln'],
      ),
      PLANT.stem,
      part(
        'cotyledon',
        ['Keimblatt', 'cotyledon', 'cotylédon', 'cotiledón', 'cotiledone'],
        ['Keimblätter', 'Speicherblatt'],
      ),
      PLANT.leaf,
    ],
  },
} as const satisfies Record<string, Schematic>;
