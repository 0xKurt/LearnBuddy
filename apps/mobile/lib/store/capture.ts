// Hand-off from capture (Slice C1) to upload (Slice C2). Doc 04 §materials.
//
// The capture screen pushes the user-confirmed photo set + chosen target
// (subject_id, folder_id?) here. The C2 upload flow will read it back when
// requesting signed PUT URLs and posting the materials row. Photos live on
// disk under the Expo cache directory — this store only carries the URIs,
// the dimensions, and the local quality scores that the API will receive
// as `client_quality_scores` per Doc 04 §POST /materials.

import { create } from 'zustand';

import type { QualityScore } from '../camera/quality.js';

export type CapturedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** Local Laplacian / luminance / tilt scores. Forwarded verbatim to the
   *  API as `client_quality_scores` in Slice C2. */
  quality: QualityScore;
  /** Local id, used for thumbnail keys and delete operations. */
  localId: string;
};

export type PendingCapture = {
  photos: CapturedPhoto[];
  subject_id: string;
  folder_id: string | null;
  created_at: string;
};

type CaptureState = {
  pending: PendingCapture | null;
  setPending: (p: PendingCapture | null) => void;
  clearPending: () => void;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
}));
