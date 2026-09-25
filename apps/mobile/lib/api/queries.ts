// Server state (TanStack Query). The home is the one screen everything
// feeds back into: mutations that return a fresh home write it into the
// cache instead of refetching.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { focusManager, QueryClient, useQuery } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError } from './client.js';
import {
  getHome,
  getLibrary,
  getMaterial,
  getMe,
  getMemory,
  getSession,
  getSettings,
} from './endpoints.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Coming back to the app (e.g. from a notification) refreshes what is on screen.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}

export const keys = {
  me: ['me'] as const,
  home: ['buddy', 'home'] as const,
  settings: ['buddy', 'settings'] as const,
  memory: ['buddy', 'memory'] as const,
  library: ['library'] as const,
  material: (id: string) => ['material', id] as const,
  session: (id: string) => ['practice', id] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: getMe });

/** Polls faster while something is in progress (a turn, reading photos, Buddy acting on them). */
export const useHome = () =>
  useQuery({
    queryKey: keys.home,
    queryFn: getHome,
    refetchInterval: (q) => {
      const h = q.state.data;
      if (!h) return false;
      const busy =
        h.working !== null ||
        h.thread.some((m) => m.status === 'processing') ||
        h.now?.type === 'material_processing';
      return busy ? 3000 : 60_000;
    },
  });

export function setHome(home: BuddyHome): void {
  queryClient.setQueryData(keys.home, home);
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: getSettings });
export const useMemory = () => useQuery({ queryKey: keys.memory, queryFn: getMemory });
export const useLibrary = () => useQuery({ queryKey: keys.library, queryFn: getLibrary });

export const useMaterial = (id: string) =>
  useQuery({
    queryKey: keys.material(id),
    queryFn: () => getMaterial(id),
    refetchInterval: (q) =>
      q.state.data && ['queued', 'processing'].includes(q.state.data.status) ? 3000 : false,
  });

export const usePracticeSession = (id: string) =>
  useQuery({ queryKey: keys.session(id), queryFn: () => getSession(id) });
