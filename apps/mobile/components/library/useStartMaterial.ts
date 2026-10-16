// Practising a sheet, or reading its sentences aloud (issue #223 point 2): one way in from every
// place a sheet stands — the list, its subject, its own page. One server call decides what the
// run holds; starting is not idempotent, so it goes through the one-at-a-time lock.
import { router } from 'expo-router';
import type { MutableRefObject } from 'react';

import { startPractice } from '../../lib/api/learningEndpoints.js';
import { seedSession } from '../../lib/api/sessionQueries.js';
import { useMaterialAct } from '../../lib/api/useMaterialAct.js';

export function useStartMaterial(shared?: MutableRefObject<boolean>) {
  const { busyId, act } = useMaterialAct(shared);
  const start = (materialId: string, mode: 'practice' | 'speak') =>
    void act(materialId, async () => {
      const session = await startPractice({ material_id: materialId, mode });
      seedSession(session);
      router.push(`/practice/${session.id}`);
    });
  return { busyId, act, start };
}
