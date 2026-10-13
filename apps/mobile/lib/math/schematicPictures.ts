// The picture library's images and where their parts stand (issue #599): each picture's bundled
// image by its id, and its anchors (`schematicAnchors.data.ts`, shared-math — the same data the
// server decides with). Loaded with the first picture on the screen (`useSchematicPictures`), so
// neither the anchors nor the asset list is part of the start bundle.
//
// The images are the design package's `assets/figures/<id>.png`, unchanged: real pictures from
// Wikimedia Commons and others, each with its licence in `assets/figures/sources.json`
// (`lib/figureLicences.ts` shows them all on the Lizenzen page). `flower_section` shows the same
// image as `flower`; the circuit has none and is drawn (`SCHEMATIC_DRAWN`).

import type { ImageSourcePropType } from 'react-native';

import { SCHEMATIC_ANCHORS } from '../../../../packages/shared-math/src/schematicAnchors.data.js';
import type { SchematicImageId } from '../../../../packages/shared-math/src/schematics.js';
import animalCell from '../../assets/figures/animal_cell.png';
import anlaut from '../../assets/figures/anlaut.png';
import bicycle from '../../assets/figures/bicycle.png';
import breathing from '../../assets/figures/breathing.png';
import compass from '../../assets/figures/compass.png';
import digestion from '../../assets/figures/digestion.png';
import distillation from '../../assets/figures/distillation.png';
import ear from '../../assets/figures/ear.png';
import earth from '../../assets/figures/earth.png';
import eye from '../../assets/figures/eye.png';
import eyeFront from '../../assets/figures/eye_front.png';
import flower from '../../assets/figures/flower.png';
import heart from '../../assets/figures/heart.png';
import insect from '../../assets/figures/insect.png';
import insectHead from '../../assets/figures/insect_head.png';
import instruments from '../../assets/figures/instruments.png';
import joint from '../../assets/figures/joint.png';
import lab from '../../assets/figures/lab.png';
import leaf from '../../assets/figures/leaf.png';
import microscope from '../../assets/figures/microscope.png';
import moonPhases from '../../assets/figures/moon_phases.png';
import mushroom from '../../assets/figures/mushroom.png';
import neuron from '../../assets/figures/neuron.png';
import organs from '../../assets/figures/organs.png';
import plant from '../../assets/figures/plant.png';
import plantCell from '../../assets/figures/plant_cell.png';
import seedling from '../../assets/figures/seedling.png';
import signs from '../../assets/figures/signs.png';
import skeleton from '../../assets/figures/skeleton.png';
import teeth from '../../assets/figures/teeth.png';
import thermometer from '../../assets/figures/thermometer.png';
import tooth from '../../assets/figures/tooth.png';
import volcano from '../../assets/figures/volcano.png';

/** Each image picture's file — every id of the library that is an image has one (the type says so). */
const IMAGES: Readonly<Record<SchematicImageId, ImageSourcePropType>> = {
  plant_cell: plantCell,
  animal_cell: animalCell,
  flower,
  plant,
  eye,
  tooth,
  insect,
  bicycle,
  microscope,
  lab,
  heart,
  ear,
  skeleton,
  organs,
  signs,
  instruments,
  anlaut,
  flower_section: flower,
  eye_front: eyeFront,
  insect_head: insectHead,
  teeth,
  joint,
  breathing,
  digestion,
  leaf,
  neuron,
  mushroom,
  seedling,
  distillation,
  earth,
  volcano,
  compass,
  thermometer,
  moon_phases: moonPhases,
};

/** The images and the anchors of the library's pictures. */
export const SCHEMATIC_PICTURES = { images: IMAGES, anchors: SCHEMATIC_ANCHORS } as const;
export type SchematicPictures = typeof SCHEMATIC_PICTURES;
