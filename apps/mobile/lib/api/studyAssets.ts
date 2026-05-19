// Study-asset (numbered diagram) fetch. Doc 06 §P1.3 / Doc 07.

import { StudyAssetView } from '@learnbuddy/shared-types';

import { api } from './client.js';

export async function getStudyAsset(learnerId: string, id: string): Promise<StudyAssetView> {
  return api(`/study-assets/${id}`, {
    method: 'GET',
    schema: StudyAssetView,
    learnerId,
  });
}
