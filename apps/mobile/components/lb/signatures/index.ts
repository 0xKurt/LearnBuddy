// Every prepared signature's renderer, keyed like lib/buddy/signatures/index.ts: a key
// without a renderer (or a renderer without a key) does not compile.
import type { ComponentType } from 'react';

import type { SignatureKey } from '../../../lib/buddy/signatures/index.js';
import { KernSignature } from './KernSignature.js';
import { MondfunkenSignature } from './MondfunkenSignature.js';
import { MondSignature } from './MondSignature.js';
import { NurfunkenSignature } from './NurfunkenSignature.js';
import { PrismaSignature } from './PrismaSignature.js';
import { PunkteSignature } from './PunkteSignature.js';
import { RingSignature } from './RingSignature.js';
import { NursternSignature, SternchenSignature } from './SternchenSignature.js';
import { SternSignature } from './SternSignature.js';
import type { SignatureProps } from './stage.js';

export const SIGNATURES: Record<SignatureKey, ComponentType<SignatureProps>> = {
  mond: MondSignature,
  ring: RingSignature,
  kern: KernSignature,
  punkte: PunkteSignature,
  stern: SternSignature,
  sternchen: SternchenSignature,
  nurstern: NursternSignature,
  mondfunken: MondfunkenSignature,
  nurfunken: NurfunkenSignature,
  prisma: PrismaSignature,
};
