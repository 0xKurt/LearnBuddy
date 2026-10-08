// The names of the picture library's drawings of the non-living world from issue #462: the
// distillation of chemistry 7–8, the earth, a volcano, the compass rose, a thermometer, the moon's
// phases and a circuit. A part another drawing shows too keeps its one name (`schematicParts.data.ts`). Gathered by
// `schematics.data.ts`; where each part stands is `schematicWorld.data.ts`.

import { LAB, named, part } from './schematicParts.data.js';
import type { Schematic } from './schematics.js';

export const SCHEMATIC_WORLD_NAMES = {
  distillation: {
    names: named([
      'Destillation (Versuchsaufbau)',
      'distillation (set-up)',
      'distillation (montage)',
      'destilación (montaje)',
      'distillazione (apparato)',
    ]),
    parts: [
      part(
        'stand',
        ['Stativ', 'stand', 'support', 'soporte', 'sostegno'],
        ['Stativstange', 'Stativ mit Klemme', 'Klemme', 'Muffe'],
      ),
      LAB.burner,
      part(
        'receiver',
        [
          'Vorlage',
          'receiver',
          'récipient collecteur',
          'recipiente colector',
          'recipiente di raccolta',
        ],
        ['Auffanggefäß', 'Becherglas'],
      ),
      part('distillate', ['Destillat', 'distillate', 'distillat', 'destilado', 'distillato'], []),
      LAB.round_flask,
      part(
        'boiling_chips',
        [
          'Siedesteinchen',
          'boiling chips',
          'pierre ponce',
          'piedras de ebullición',
          'pietre di ebollizione',
        ],
        ['Siedesteine', 'Siedestein'],
      ),
      part(
        'thermometer',
        ['Thermometer', 'thermometer', 'thermomètre', 'termómetro', 'termometro'],
        [],
      ),
      part(
        'condenser',
        [
          'Liebigkühler',
          'Liebig condenser',
          'réfrigérant de Liebig',
          'refrigerante Liebig',
          'refrigerante di Liebig',
        ],
        ['Kühler', 'Liebig-Kühler', 'condenser'],
      ),
      part(
        'water_in',
        [
          'Kühlwasserzulauf',
          'cooling water in',
          'entrée d’eau',
          'entrada de agua',
          'ingresso dell’acqua',
        ],
        ['Kühlwasser ein', 'Wasserzulauf', 'Zulauf'],
      ),
      part(
        'water_out',
        [
          'Kühlwasserablauf',
          'cooling water out',
          'sortie d’eau',
          'salida de agua',
          'uscita dell’acqua',
        ],
        ['Kühlwasser aus', 'Wasserablauf', 'Ablauf'],
      ),
    ],
  },
  earth: {
    names: named([
      'Schalenbau der Erde',
      'layers of the Earth',
      'structure de la Terre',
      'capas de la Tierra',
      'struttura della Terra',
    ]),
    parts: [
      part(
        'crust',
        ['Erdkruste', 'crust', 'croûte terrestre', 'corteza terrestre', 'crosta terrestre'],
        ['Kruste'],
      ),
      part('mantle', ['Erdmantel', 'mantle', 'manteau', 'manto', 'mantello'], ['Mantel']),
      part(
        'outer_core',
        ['äußerer Kern', 'outer core', 'noyau externe', 'núcleo externo', 'nucleo esterno'],
        ['äußerer Erdkern'],
      ),
      part(
        'inner_core',
        ['innerer Kern', 'inner core', 'noyau interne', 'núcleo interno', 'nucleo interno'],
        ['innerer Erdkern'],
      ),
    ],
  },
  volcano: {
    names: named([
      'Vulkan (Schnitt)',
      'volcano (section)',
      'volcan (coupe)',
      'volcán (corte)',
      'vulcano (sezione)',
    ]),
    parts: [
      part(
        'magma_chamber',
        [
          'Magmakammer',
          'magma chamber',
          'chambre magmatique',
          'cámara magmática',
          'camera magmatica',
        ],
        ['Magmaherd'],
      ),
      part(
        'layers',
        [
          'Asche- und Lavaschichten',
          'layers of ash and lava',
          'couches de cendres et de lave',
          'capas de ceniza y lava',
          'strati di cenere e lava',
        ],
        ['Schichten', 'Ascheschichten', 'Lavaschichten', 'Vulkankegel'],
      ),
      part(
        'vent',
        ['Schlot', 'vent', 'cheminée', 'chimenea', 'camino'],
        ['Hauptschlot', 'Förderschlot'],
      ),
      part(
        'side_vent',
        [
          'Nebenschlot',
          'side vent',
          'cheminée secondaire',
          'chimenea secundaria',
          'camino secondario',
        ],
        ['Nebenkrater'],
      ),
      part('crater', ['Krater', 'crater', 'cratère', 'cráter', 'cratere'], ['Hauptkrater']),
      part('lava', ['Lava', 'lava', 'lave', 'lava', 'lava'], ['Lavastrom']),
      part(
        'ash_cloud',
        ['Aschewolke', 'ash cloud', 'nuage de cendres', 'nube de ceniza', 'nube di cenere'],
        ['Asche', 'Eruptionswolke', 'Rauchwolke'],
      ),
    ],
  },
  compass: {
    names: named([
      'Himmelsrichtungen',
      'compass rose',
      'rose des vents',
      'rosa de los vientos',
      'rosa dei venti',
    ]),
    parts: [
      part(
        'northeast',
        ['Nordosten', 'northeast', 'nord-est', 'noreste', 'nord-est'],
        ['NO', 'NE'],
      ),
      part('southeast', ['Südosten', 'southeast', 'sud-est', 'sureste', 'sud-est'], ['SO', 'SE']),
      part('southwest', ['Südwesten', 'southwest', 'sud-ouest', 'suroeste', 'sud-ovest'], ['SW']),
      part(
        'northwest',
        ['Nordwesten', 'northwest', 'nord-ouest', 'noroeste', 'nord-ovest'],
        ['NW'],
      ),
      part('north', ['Norden', 'north', 'nord', 'norte', 'nord'], ['N']),
      part('east', ['Osten', 'east', 'est', 'este', 'est'], ['O', 'E']),
      part('south', ['Süden', 'south', 'sud', 'sur', 'sud'], ['S']),
      part('west', ['Westen', 'west', 'ouest', 'oeste', 'ovest'], ['W']),
    ],
  },
  thermometer: {
    names: named(['Thermometer', 'thermometer', 'thermomètre', 'termómetro', 'termometro']),
    parts: [
      part('scale', ['Skala', 'scale', 'graduation', 'escala', 'scala'], ['Temperaturskala']),
      part(
        'capillary',
        ['Steigröhrchen', 'capillary tube', 'tube capillaire', 'tubo capilar', 'tubo capillare'],
        ['Steigrohr', 'Kapillare', 'Glasröhrchen', 'Röhrchen'],
      ),
      part(
        'liquid',
        ['Thermometerflüssigkeit', 'liquid', 'liquide', 'líquido', 'liquido'],
        ['Flüssigkeit', 'Flüssigkeitssäule', 'Alkohol', 'Quecksilber'],
      ),
      part(
        'bulb',
        ['Vorratsgefäß', 'bulb', 'réservoir', 'bulbo', 'bulbo'],
        ['Thermometerkugel', 'Kugel'],
      ),
    ],
  },
  moon_phases: {
    names: named([
      'Mondphasen',
      'phases of the moon',
      'phases de la Lune',
      'fases de la Luna',
      'fasi lunari',
    ]),
    parts: [
      part('new_moon', ['Neumond', 'new moon', 'nouvelle lune', 'luna nueva', 'luna nuova']),
      part(
        'first_quarter',
        [
          'zunehmender Halbmond',
          'first quarter',
          'premier quartier',
          'cuarto creciente',
          'primo quarto',
        ],
        ['zunehmender Mond', 'erstes Viertel', 'Halbmond zunehmend'],
      ),
      part('full_moon', ['Vollmond', 'full moon', 'pleine lune', 'luna llena', 'luna piena']),
      part(
        'last_quarter',
        [
          'abnehmender Halbmond',
          'last quarter',
          'dernier quartier',
          'cuarto menguante',
          'ultimo quarto',
        ],
        ['abnehmender Mond', 'letztes Viertel', 'Halbmond abnehmend'],
      ),
    ],
  },
  circuit: {
    names: named([
      'Stromkreis',
      'electric circuit',
      'circuit électrique',
      'circuito eléctrico',
      'circuito elettrico',
    ]),
    parts: [
      part('wire', ['Kabel', 'wire', 'fil', 'cable', 'filo'], ['Leitung', 'Leitungen', 'Draht']),
      part(
        'battery',
        ['Batterie', 'battery', 'pile', 'pila', 'pila'],
        ['Stromquelle', 'Spannungsquelle', 'Flachbatterie'],
      ),
      part(
        'holder',
        ['Lampenfassung', 'lamp holder', 'douille', 'portalámparas', 'portalampada'],
        ['Fassung'],
      ),
      part(
        'bulb',
        ['Glühlampe', 'light bulb', 'ampoule', 'bombilla', 'lampadina'],
        ['Lampe', 'Glühbirne', 'Birne'],
      ),
      part('switch', ['Schalter', 'switch', 'interrupteur', 'interruptor', 'interruttore'], []),
    ],
  },
} as const satisfies Record<string, Schematic>;
