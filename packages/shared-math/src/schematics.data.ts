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
      part(
        'carrier',
        ['Gepäckträger', 'rack', 'porte-bagages', 'portaequipajes', 'portapacchi'],
        ['Gepäcktraeger', 'carrier'],
      ),
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
        'spoke_reflector',
        [
          'Speichenreflektor',
          'spoke reflector',
          'catadioptre de rayon',
          'reflector de radios',
          'catarifrangente per raggi',
        ],
        ['Speichenreflektoren', 'Katzenauge', 'Katzenaugen', 'Reflektor', 'Rückstrahler'],
      ),
      part('brake', ['Bremse', 'brake', 'frein', 'freno', 'freno'], ['Bremsen', 'Felgenbremse']),
      part(
        'rear_light',
        ['Rücklicht', 'rear light', 'feu arrière', 'luz trasera', 'luce posteriore'],
        ['Rückleuchte', 'Schlusslicht'],
      ),
    ],
  },
  microscope: {
    names: named(['Mikroskop', 'microscope', 'microscope', 'microscopio', 'microscopio']),
    height: 960,
    parts: [
      part('arm', ['Stativ', 'arm', 'potence', 'brazo', 'braccio'], ['Arm', 'Mikroskoparm']),
      part('foot', ['Fuß', 'base', 'pied', 'pie', 'base'], ['Stativfuß', 'Standfuß']),
      part(
        'light',
        ['Lichtquelle', 'light source', 'source lumineuse', 'fuente de luz', 'sorgente luminosa'],
        ['Lampe', 'Beleuchtung', 'Spiegel'],
      ),
      part('stage', ['Objekttisch', 'stage', 'platine', 'platina', 'tavolino'], ['Tisch']),
      part(
        'diaphragm',
        ['Blende', 'diaphragm', 'diaphragme', 'diafragma', 'diaframma'],
        ['Lochblende', 'Irisblende'],
      ),
      part('tube', ['Tubus', 'tube', 'tube', 'tubo', 'tubo'], ['Rohr']),
      part(
        'revolver',
        ['Objektivrevolver', 'nosepiece', 'revolver', 'revólver', 'revolver'],
        ['Revolver'],
      ),
      part(
        'objective',
        ['Objektiv', 'objective lens', 'objectif', 'objetivo', 'obiettivo'],
        ['Objektive'],
      ),
      part('eyepiece', ['Okular', 'eyepiece', 'oculaire', 'ocular', 'oculare'], []),
      part(
        'coarse_focus',
        [
          'Grobtrieb',
          'coarse focus knob',
          'vis macrométrique',
          'tornillo macrométrico',
          'vite macrometrica',
        ],
        ['Grobtriebrad', 'Triebrad', 'Stellrad'],
      ),
      part(
        'fine_focus',
        [
          'Feintrieb',
          'fine focus knob',
          'vis micrométrique',
          'tornillo micrométrico',
          'vite micrometrica',
        ],
        ['Feintriebrad'],
      ),
    ],
  },
  lab: {
    names: named([
      'Laborgeräte',
      'lab equipment',
      'matériel de laboratoire',
      'material de laboratorio',
      'attrezzatura da laboratorio',
    ]),
    height: 1060,
    parts: [
      part(
        'test_tube',
        ['Reagenzglas', 'test tube', 'tube à essai', 'tubo de ensayo', 'provetta'],
        ['Reagenzgläser'],
      ),
      part(
        'beaker',
        ['Becherglas', 'beaker', 'bécher', 'vaso de precipitados', 'becher'],
        ['Becher'],
      ),
      part(
        'erlenmeyer',
        ['Erlenmeyerkolben', 'Erlenmeyer flask', 'erlenmeyer', 'matraz Erlenmeyer', 'beuta'],
        ['Erlenmeyer'],
      ),
      part(
        'round_flask',
        ['Rundkolben', 'round-bottom flask', 'ballon', 'matraz de fondo redondo', 'pallone'],
        ['Kolben'],
      ),
      part(
        'cylinder',
        [
          'Messzylinder',
          'measuring cylinder',
          'éprouvette graduée',
          'probeta',
          'cilindro graduato',
        ],
        ['Standzylinder'],
      ),
      part('funnel', ['Trichter', 'funnel', 'entonnoir', 'embudo', 'imbuto'], []),
      part(
        'burner',
        ['Bunsenbrenner', 'Bunsen burner', 'bec Bunsen', 'mechero Bunsen', 'becco Bunsen'],
        ['Brenner', 'Gasbrenner'],
      ),
      part('tripod', ['Dreifuß', 'tripod', 'trépied', 'trípode', 'treppiede'], ['Dreifuss']),
    ],
  },
  heart: {
    names: named(['Herz', 'heart', 'cœur', 'corazón', 'cuore']),
    height: 900,
    parts: [
      part(
        'myocardium',
        ['Herzmuskel', 'heart muscle', 'muscle cardiaque', 'músculo cardíaco', 'muscolo cardiaco'],
        ['Herzmuskulatur', 'Herzwand', 'Myokard', 'myocardium'],
      ),
      part(
        'septum',
        ['Herzscheidewand', 'septum', 'septum', 'tabique', 'setto'],
        ['Scheidewand', 'Trennwand'],
      ),
      part(
        'vena_cava',
        ['Hohlvene', 'vena cava', 'veine cave', 'vena cava', 'vena cava'],
        ['obere Hohlvene', 'untere Hohlvene', 'Hohlvenen'],
      ),
      part(
        'pulmonary_vein',
        ['Lungenvene', 'pulmonary vein', 'veine pulmonaire', 'vena pulmonar', 'vena polmonare'],
        ['Lungenvenen'],
      ),
      part(
        'aorta',
        ['Aorta', 'aorta', 'aorte', 'aorta', 'aorta'],
        ['Hauptschlagader', 'Körperschlagader'],
      ),
      part(
        'pulmonary_artery',
        [
          'Lungenarterie',
          'pulmonary artery',
          'artère pulmonaire',
          'arteria pulmonar',
          'arteria polmonare',
        ],
        ['Lungenschlagader', 'Lungenarterien'],
      ),
      part(
        'right_atrium',
        ['rechter Vorhof', 'right atrium', 'oreillette droite', 'aurícula derecha', 'atrio destro'],
        ['rechte Vorkammer'],
      ),
      part(
        'left_atrium',
        [
          'linker Vorhof',
          'left atrium',
          'oreillette gauche',
          'aurícula izquierda',
          'atrio sinistro',
        ],
        ['linke Vorkammer'],
      ),
      part(
        'right_ventricle',
        [
          'rechte Kammer',
          'right ventricle',
          'ventricule droit',
          'ventrículo derecho',
          'ventricolo destro',
        ],
        ['rechte Herzkammer'],
      ),
      part(
        'left_ventricle',
        [
          'linke Kammer',
          'left ventricle',
          'ventricule gauche',
          'ventrículo izquierdo',
          'ventricolo sinistro',
        ],
        ['linke Herzkammer'],
      ),
      part(
        'valve',
        [
          'Segelklappe',
          'atrioventricular valve',
          'valve auriculo-ventriculaire',
          'válvula auriculoventricular',
          'valvola atrioventricolare',
        ],
        ['Segelklappen', 'Herzklappe', 'Herzklappen', 'heart valve'],
      ),
    ],
  },
  ear: {
    names: named([
      'Ohr (Querschnitt)',
      'ear (section)',
      'oreille (coupe)',
      'oído (corte)',
      'orecchio (sezione)',
    ]),
    height: 700,
    parts: [
      part(
        'eustachian_tube',
        [
          'Ohrtrompete',
          'Eustachian tube',
          'trompe d’Eustache',
          'trompa de Eustaquio',
          'tromba di Eustachio',
        ],
        ['eustachische Röhre', 'Tube'],
      ),
      part(
        'middle_ear',
        ['Paukenhöhle', 'middle ear', 'caisse du tympan', 'caja timpánica', 'cassa timpanica'],
        ['Mittelohr', 'Mittelohrraum', 'Paukenhöhle'],
      ),
      part(
        'pinna',
        ['Ohrmuschel', 'outer ear', 'pavillon', 'pabellón auricular', 'padiglione auricolare'],
        ['Ohrläppchen'],
      ),
      part(
        'canal',
        ['Gehörgang', 'ear canal', 'conduit auditif', 'conducto auditivo', 'condotto uditivo'],
        [],
      ),
      part('eardrum', ['Trommelfell', 'eardrum', 'tympan', 'tímpano', 'timpano'], []),
      part(
        'ossicles',
        ['Gehörknöchelchen', 'ossicles', 'osselets', 'huesecillos', 'ossicini'],
        ['Hammer, Amboss, Steigbügel', 'Hammer', 'Amboss', 'Steigbügel'],
      ),
      part(
        'canals',
        [
          'Bogengänge',
          'semicircular canals',
          'canaux semi-circulaires',
          'canales semicirculares',
          'canali semicircolari',
        ],
        ['Gleichgewichtsorgan'],
      ),
      part(
        'cochlea',
        ['Schnecke', 'cochlea', 'cochlée', 'cóclea', 'coclea'],
        ['Hörschnecke', 'Cochlea'],
      ),
      part(
        'nerve',
        ['Hörnerv', 'auditory nerve', 'nerf auditif', 'nervio auditivo', 'nervo acustico'],
        [],
      ),
    ],
  },
  skeleton: {
    names: named(['Skelett', 'skeleton', 'squelette', 'esqueleto', 'scheletro']),
    height: 1030,
    parts: [
      part(
        'spine',
        ['Wirbelsäule', 'spine', 'colonne vertébrale', 'columna vertebral', 'colonna vertebrale'],
        ['Wirbel', 'Rückgrat'],
      ),
      part(
        'pelvis',
        ['Becken', 'pelvis', 'bassin', 'pelvis', 'bacino'],
        ['Hüfte', 'Hüftknochen', 'Beckenknochen'],
      ),
      part(
        'ribcage',
        ['Brustkorb', 'ribcage', 'cage thoracique', 'caja torácica', 'gabbia toracica'],
        ['Rippen', 'Rippe'],
      ),
      part('sternum', ['Brustbein', 'breastbone', 'sternum', 'esternón', 'sterno'], ['Sternum']),
      part('skull', ['Schädel', 'skull', 'crâne', 'cráneo', 'cranio'], ['Kopf', 'Schädelknochen']),
      part(
        'collarbone',
        ['Schlüsselbein', 'collarbone', 'clavicule', 'clavícula', 'clavicola'],
        [],
      ),
      part(
        'humerus',
        ['Oberarmknochen', 'upper arm bone', 'humérus', 'húmero', 'omero'],
        ['Oberarm', 'humerus'],
      ),
      part('radius', ['Speiche', 'radius', 'radius', 'radio', 'radio'], []),
      part('ulna', ['Elle', 'ulna', 'cubitus', 'cúbito', 'ulna'], []),
      part(
        'hand',
        ['Handknochen', 'hand bones', 'os de la main', 'huesos de la mano', 'ossa della mano'],
        ['Hand', 'Fingerknochen', 'Handwurzelknochen'],
      ),
      part(
        'femur',
        ['Oberschenkelknochen', 'thigh bone', 'fémur', 'fémur', 'femore'],
        ['Oberschenkel', 'femur'],
      ),
      part('kneecap', ['Kniescheibe', 'kneecap', 'rotule', 'rótula', 'rotula'], ['Patella']),
      part('tibia', ['Schienbein', 'shinbone', 'tibia', 'tibia', 'tibia'], []),
      part('fibula', ['Wadenbein', 'fibula', 'péroné', 'peroné', 'perone'], []),
      part(
        'foot',
        ['Fußknochen', 'foot bones', 'os du pied', 'huesos del pie', 'ossa del piede'],
        ['Fuß', 'Zehenknochen', 'Fußwurzelknochen'],
      ),
    ],
  },
  organs: {
    names: named(['Organe', 'organs', 'organes', 'órganos', 'organi']),
    height: 1000,
    parts: [
      part('kidneys', ['Nieren', 'kidneys', 'reins', 'riñones', 'reni'], ['Niere']),
      part(
        'large_intestine',
        ['Dickdarm', 'large intestine', 'gros intestin', 'intestino grueso', 'intestino crasso'],
        ['Darm'],
      ),
      part(
        'small_intestine',
        ['Dünndarm', 'small intestine', 'intestin grêle', 'intestino delgado', 'intestino tenue'],
        ['Gedärm'],
      ),
      part('bladder', ['Harnblase', 'bladder', 'vessie', 'vejiga', 'vescica'], ['Blase']),
      part('liver', ['Leber', 'liver', 'foie', 'hígado', 'fegato'], []),
      part('stomach', ['Magen', 'stomach', 'estomac', 'estómago', 'stomaco'], []),
      part(
        'lungs',
        ['Lunge', 'lungs', 'poumons', 'pulmones', 'polmoni'],
        ['Lungen', 'Lungenflügel'],
      ),
      part('trachea', ['Luftröhre', 'windpipe', 'trachée', 'tráquea', 'trachea'], ['Bronchien']),
      part('heart', ['Herz', 'heart', 'cœur', 'corazón', 'cuore'], []),
      part('brain', ['Gehirn', 'brain', 'cerveau', 'cerebro', 'cervello'], ['Hirn']),
    ],
  },
  signs: {
    names: named([
      'Verkehrszeichen',
      'traffic signs',
      'panneaux',
      'señales de tráfico',
      'segnali stradali',
    ]),
    height: 900,
    parts: [
      part(
        'stop',
        ['Stoppschild', 'stop sign', 'panneau stop', 'señal de stop', 'segnale di stop'],
        ['Stopp', 'Stop', 'Halt'],
      ),
      part(
        'give_way',
        ['Vorfahrt gewähren', 'give way', 'cédez le passage', 'ceda el paso', 'dare la precedenza'],
        ['Vorfahrt achten'],
      ),
      part(
        'priority_road',
        [
          'Vorfahrtstraße',
          'priority road',
          'route prioritaire',
          'calzada con prioridad',
          'strada con diritto di precedenza',
        ],
        [],
      ),
      part(
        'crossing',
        [
          'Fußgängerüberweg',
          'pedestrian crossing',
          'passage piéton',
          'paso de peatones',
          'attraversamento pedonale',
        ],
        ['Zebrastreifen'],
      ),
      part(
        'cycle_path',
        ['Radweg', 'cycle path', 'piste cyclable', 'carril bici', 'pista ciclabile'],
        ['Fahrradweg'],
      ),
      part(
        'one_way',
        ['Einbahnstraße', 'one-way street', 'sens unique', 'calle de sentido único', 'senso unico'],
        [],
      ),
    ],
  },
  instruments: {
    names: named([
      'Musikinstrumente',
      'musical instruments',
      'instruments de musique',
      'instrumentos musicales',
      'strumenti musicali',
    ]),
    height: 900,
    parts: [
      part('guitar', ['Gitarre', 'guitar', 'guitare', 'guitarra', 'chitarra'], []),
      part(
        'recorder',
        ['Blockflöte', 'recorder', 'flûte à bec', 'flauta dulce', 'flauto dolce'],
        ['Flöte'],
      ),
      part('drum', ['Trommel', 'drum', 'tambour', 'tambor', 'tamburo'], ['Pauke']),
      part('trumpet', ['Trompete', 'trumpet', 'trompette', 'trompeta', 'tromba'], []),
      part('triangle', ['Triangel', 'triangle', 'triangle', 'triángulo', 'triangolo'], []),
      part(
        'xylophone',
        ['Xylofon', 'xylophone', 'xylophone', 'xilófono', 'xilofono'],
        ['Xylophon', 'Glockenspiel', 'Metallophon'],
      ),
    ],
  },
  anlaut: {
    names: named([
      'Anlautbilder',
      'first sounds',
      'sons initiaux',
      'sonidos iniciales',
      'suoni iniziali',
    ]),
    height: 1060,
    parts: [
      part('apple', ['Apfel', 'apple', 'pomme', 'manzana', 'mela'], []),
      part('ball', ['Ball', 'ball', 'ballon', 'pelota', 'palla'], []),
      part('house', ['Haus', 'house', 'maison', 'casa', 'casa'], []),
      part('sun', ['Sonne', 'sun', 'soleil', 'sol', 'sole'], []),
      part('moon', ['Mond', 'moon', 'lune', 'luna', 'luna'], []),
      part('fish', ['Fisch', 'fish', 'poisson', 'pez', 'pesce'], []),
      part('ice_cream', ['Eis', 'ice cream', 'glace', 'helado', 'gelato'], ['Eiscreme', 'Eistüte']),
      part('clock', ['Uhr', 'clock', 'horloge', 'reloj', 'orologio'], ['Wecker']),
    ],
  },
};
