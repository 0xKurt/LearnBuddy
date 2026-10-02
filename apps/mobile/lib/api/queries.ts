// Server state (TanStack Query). The home is the one screen everything
// feeds back into: mutations that return a fresh home write it into the
// cache instead of refetching.

import type { BuddyHome, NowCard, SessionView } from '@learnbuddy/shared-types/contracts';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { currentSession } from '../auth/session.js';
import { onlineFrom } from '../net.js';
import { ApiError } from './client.js';
import { writeHome } from './homeCache.js';
import { followHome, followMaterial, libraryPollMs } from './libraryCache.js';
import { keys } from './keys.js';
import { followResumeCard } from './sessionCache.js';
import {
  getHome,
  getLibrary,
  getMaterialItems,
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

// Offline, queries and mutations pause instead of failing and continue once
// the device is back online. Phones: NetInfo; its own reachability ping (a
// Google address) is switched off: only isConnected is used (lib/net.ts), and
// no extra third-party request. Web: the browser's online/offline events —
// NetInfo on Chromium only follows navigator.connection "change", which does
// not fire when the connection simply comes back.
NetInfo.configure({ reachabilityShouldRun: () => false });
onlineManager.setEventListener((setOnline) => {
  if (Platform.OS !== 'web') {
    return NetInfo.addEventListener((state) => setOnline(onlineFrom(state)));
  }
  const update = () => setOnline(navigator.onLine);
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
});

/** Whether the device counts as online (the same answer TanStack Query uses). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export { keys };

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: getMe });

/** Polls faster while something is in progress (a turn, reading photos, Buddy acting on them). */
export const useHome = () =>
  useQuery({
    queryKey: keys.home,
    queryFn: async () => {
      const home = await getHome();
      followHome(queryClient, home);
      return home;
    },
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
  // A turn that finishes after sign-out never refills the cleared cache (shared phone).
  if (!currentSession()) return;
  writeHome(queryClient, home);
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: getSettings });
export const useMemory = () => useQuery({ queryKey: keys.memory, queryFn: getMemory });
/** Follows a sheet being read (live finding 3): fetched often while one is, and on every visit. */
export const useLibrary = () =>
  useQuery({
    queryKey: keys.library,
    queryFn: getLibrary,
    refetchInterval: (q) => libraryPollMs(q.state.data),
    refetchOnMount: (q) => (libraryPollMs(q.state.data) === false ? true : 'always'),
  });

/** The questions of one material; follows it while its photos are being read. */
export const useMaterialItems = (id: string) =>
  useQuery({
    queryKey: keys.materialItems(id),
    queryFn: async () => {
      const v = await getMaterialItems(id);
      followMaterial(queryClient, v.material);
      return v;
    },
    refetchInterval: (q) =>
      q.state.data && ['queued', 'processing'].includes(q.state.data.material.status)
        ? 3000
        : false,
  });

/**
 * One practice run. It is normally not polled at all — every change comes back in the answer to
 * what she just did — with one exception: while the server says more questions are still being
 * written (issue #220, `SessionView.preparing`), nothing she does brings them, so the screen asks
 * until they are there. The same second-and-a-half rhythm the sheet reading uses.
 */
export const usePracticeSession = (id: string) =>
  useQuery({
    queryKey: keys.session(id),
    queryFn: () => getSession(id),
    refetchInterval: (q) => (q.state.data?.preparing ? 1500 : false),
  });

/** A session the server just started (and returned): its first question shows at once. */
export function seedSession(view: SessionView): void {
  queryClient.setQueryData(keys.session(view.id), view);
}

/**
 * A practice to go on with is on screen (Buddy's card): it is loaded now, so "Weiter üben"
 * shows the question at once (gaps.md #2). Loaded, never started — nothing changes on the
 * server until she taps. When the card changes (a page joined the help), the copy is loaded
 * again (lib/api/sessionCache.ts).
 */
export function usePrefetchSession(card: NowCard | null | undefined): void {
  const resume = card?.type === 'resume_practice' ? card : null;
  const id = resume?.session_id ?? null;
  const remaining = resume?.remaining ?? null;
  const title = resume?.title ?? null;
  const mode = resume?.mode ?? null;
  useEffect(() => {
    if (!resume) return;
    followResumeCard(queryClient, resume, getSession);
    // The card's content, not its object identity (every poll makes a new one).
  }, [id, remaining, title, mode]);
}
