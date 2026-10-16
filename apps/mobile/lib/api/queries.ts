// Server state (TanStack Query). The home is the one screen everything
// feeds back into: mutations that return a fresh home write it into the
// cache instead of refetching.

import type {
  BuddyHome,
  NowCard,
  PracticeTurnView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { currentSession } from '../auth/session.js';
import { homePollMs } from './homePoll.js';
import { useOnScreen } from '../screenFocus.js';
import { onlineFrom } from '../net.js';
import { ApiError } from './client.js';
import { refreshProfileIfChanged, writeHome } from './homeCache.js';
import { keys } from './keys.js';
import { followResumeCard } from './sessionCache.js';
import { getHome, getMe, getMemory, getSession, getSettings } from './endpoints.js';
import { registry } from '../registry.js';

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

/**
 * Who she is changes only through her own actions here (each updates or invalidates it) and
 * through the server's refusals, which invalidate it (app/_layout.tsx): screens opened within
 * five minutes share one answer instead of asking again (#671).
 */
const ME_FRESH_MS = 5 * 60_000;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: getMe, staleTime: ME_FRESH_MS });

/**
 * What a domain keeps in step with each home the server sends (issue #107): the library list
 * that still shows a sheet being read (lib/api/libraryQueries.ts). Given at app start.
 */
export const homeFollowers = registry<string, (home: BuddyHome) => void>('Startseite folgen');

/** The home from the server, and what it carries into the other caches. */
async function loadHome(): Promise<BuddyHome> {
  const home = await getHome();
  // A turn that finished while she waited (a poll brings its home): her profile too (#671).
  refreshProfileIfChanged(queryClient, home, queryClient.getQueryData<BuddyHome>(keys.home));
  for (const follow of homeFollowers.values()) follow(home);
  return home;
}

/**
 * The home, loaded before she gets there (issue #392): the first-start cards come right before
 * it, and without this its request only left on her tap — the home then stood as a skeleton
 * without a word for a round trip (seven empty frames, `tests/web/tour.spec.ts`). Same query as
 * `useHome`, so the home finds it in the cache and refreshes it once it is stale.
 */
export function prefetchHome(): void {
  void queryClient.prefetchQuery({ queryKey: keys.home, queryFn: loadHome });
}

/**
 * Polls faster while something is in progress (a turn, reading photos, Buddy acting on them).
 * Only the screen she sees asks (#637): the chat under a practice neither polls nor redraws; it
 * catches up when she comes back (a stale home is fetched again on return).
 */
export const useHome = () =>
  useQuery({
    queryKey: keys.home,
    queryFn: loadHome,
    subscribed: useOnScreen(),
    refetchInterval: (q) => homePollMs(q.state.data),
  });

/**
 * The home a step brought back, for every screen. Not written when it is older than the one held
 * (`writeHome`: a turn's answer that arrives after a later step's).
 */
export function setHome(home: BuddyHome): void {
  // A turn that finishes after sign-out never refills the cleared cache (shared phone).
  if (!currentSession()) return;
  writeHome(queryClient, home);
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: getSettings });

/**
 * What a place of the ⋯ menu shows, loaded while she looks at the menu (#711): the first open of
 * the settings waited ~3.8 s for its request after the tap on the POCO X3. What is still fresh is
 * not asked again. A domain adds its own places (the learning domain: her library).
 */
export const menuPreloads = registry<string, () => void>('Menü vorladen');

export function preloadPlaces(): void {
  void queryClient.prefetchQuery({ queryKey: keys.settings, queryFn: getSettings });
  void queryClient.prefetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: ME_FRESH_MS });
  for (const preload of menuPreloads.values()) preload();
}
export const useMemory = () => useQuery({ queryKey: keys.memory, queryFn: getMemory });
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

/** One turn of a practice run changed on the server (a kept „für nachher", issue #402). */
export function storeTurn(sessionId: string, turn: PracticeTurnView): void {
  queryClient.setQueryData<SessionView>(keys.session(sessionId), (view) =>
    view ? { ...view, turns: view.turns.map((t) => (t.id === turn.id ? turn : t)) } : view,
  );
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
