// Every prepared signature's renderer, keyed like lib/buddy/signatures/index.ts: a key
// without a renderer (or a renderer without a key) does not compile.
import type { ComponentType } from 'react';

import type { SignatureKey } from '../../../lib/buddy/signatures/index.js';
import { MondSignature } from './MondSignature.js';
import type { SignatureProps } from './stage.js';

export const SIGNATURES: Record<SignatureKey, ComponentType<SignatureProps>> = {
  mond: MondSignature,
};
