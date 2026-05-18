// Durable pending-session pointer. Doc 05 §session ("Quit mid-session …
// state is preserved"), USER-FLOWS §7 (resume).
//
// Stores just enough to resume: the SERVER session id + the learner. The
// full transcript + item set is fetched back from GET /sessions/:id, so a
// resume is deterministic (same questions, same thread) and survives a full
// app restart — the previous in-memory zustand value did not.

import * as SecureStore from 'expo-secure-store';

const KEY = 'lb.pending_session';

export type PendingSession = {
  session_id: string;
  learner_id: string;
  test_mode: boolean;
};

export async function savePendingSession(p: PendingSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(p));
  } catch {
    /* best-effort — resume is a nicety, never block the session on it */
  }
}

export async function loadPendingSession(): Promise<PendingSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingSession>;
    if (typeof v.session_id === 'string' && typeof v.learner_id === 'string') {
      return { session_id: v.session_id, learner_id: v.learner_id, test_mode: !!v.test_mode };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
