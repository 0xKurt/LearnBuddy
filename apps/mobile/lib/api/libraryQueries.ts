// "Dein Material" and one sheet's questions, from the server (TanStack Query): the learning
// domain's queries (issue #107). Both follow a sheet being read (live finding 3,
// lib/api/libraryCache.ts); the home's part of that is given to the core at app start
// (lib/learning/register.tsx → lib/api/queries.ts `homeFollowers`).

import { useQuery } from '@tanstack/react-query';

import { getLibrary, getMaterialItems } from './learningEndpoints.js';
import { followMaterial, libraryPollMs } from './libraryCache.js';
import { useOnScreen } from '../screenFocus.js';
import { keys, queryClient } from './queries.js';
import { staggered } from './homePoll.js';

/**
 * Follows a sheet being read (live finding 3): fetched often while one is, and on every visit —
 * by the screen she sees only (#637).
 */
export const useLibrary = () =>
  useQuery({
    queryKey: keys.library,
    queryFn: getLibrary,
    subscribed: useOnScreen(),
    refetchInterval: (q) => libraryPollMs(q.state.data),
    refetchOnMount: (q) => (libraryPollMs(q.state.data) === false ? true : 'always'),
  });

/** The questions of one material; follows it while its photos are being read. */
export const useMaterialItems = (id: string) =>
  useQuery({
    queryKey: keys.materialItems(id),
    subscribed: useOnScreen(),
    queryFn: async () => {
      const v = await getMaterialItems(id);
      followMaterial(queryClient, v.material);
      return v;
    },
    refetchInterval: (q) =>
      q.state.data && ['queued', 'processing'].includes(q.state.data.material.status)
        ? staggered(3000)
        : false,
  });
