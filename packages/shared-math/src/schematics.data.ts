// The picture library by name (issue #252): every drawing and every part with its name in the
// five languages and the other names a teacher accepts. The server checks every question against
// it and the tap mechanism resolves a name with it (`schematics.ts`); the app loads it with the
// first map or picture (`figureNames.data.ts`, #440). This file names the drawings of #252 and
// gathers those of #462 (`schematicLifeNames.data.ts`, `schematicWorldNames.data.ts`); a part more
// than one drawing shows is named once (`schematicParts.data.ts`). Where each part stands is
// `schematicShapes.data.ts`, loaded by the app with the first picture.

import type { SchematicNames } from './schematics.js';
import {
  CYTOPLASM,
  EYE,
  FLOWER,
  INSECT,
  LAB,
  MEMBRANE,
  MITOCHONDRION,
  named,
  NUCLEUS,
  ORGANS,
  part,
  PLANT,
  TOOTH,
} from './schematicParts.data.js';
import { SCHEMATIC_LIFE_NAMES } from './schematicLifeNames.data.js';
import { SCHEMATIC_WORLD_NAMES } from './schematicWorldNames.data.js';

export const SCHEMATIC_NAMES: SchematicNames = {
  plant_cell: {
    names: named([
      'Pflanzenzelle',
      'plant cell',
      'cellule végétale',
      'célula vegetal',
      'cellula vegetale',
    ]),
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
    parts: Object.values(FLOWER),
  },
  plant: {
    names: named(['Pflanze', 'plant', 'plante', 'planta', 'pianta']),
    parts: Object.values(PLANT),
  },
  eye: {
    names: named([
      'Auge (Querschnitt)',
      'eye (section)',
      'œil (coupe)',
      'ojo (corte)',
      'occhio (sezione)',
    ]),
    parts: Object.values(EYE),
  },
  tooth: {
    names: named([
      'Zahn (Längsschnitt)',
      'tooth (section)',
      'dent (coupe)',
      'diente (corte)',
      'dente (sezione)',
    ]),
    parts: Object.values(TOOTH),
  },
  insect: {
    names: named(['Insekt', 'insect', 'insecte', 'insecto', 'insetto']),
    parts: Object.values(INSECT),
  },
  bicycle: {
    names: named(['Fahrrad', 'bicycle', 'vélo', 'bicicleta', 'bicicletta']),
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
    parts: Object.values(LAB),
  },
  heart: {
    names: named(['Herz', 'heart', 'cœur', 'corazón', 'cuore']),
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
    parts: Object.values(ORGANS),
  },
  signs: {
    names: named([
      'Verkehrszeichen',
      'traffic signs',
      'panneaux',
      'señales de tráfico',
      'segnali stradali',
    ]),
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
  ...SCHEMATIC_LIFE_NAMES,
  ...SCHEMATIC_WORLD_NAMES,
};
