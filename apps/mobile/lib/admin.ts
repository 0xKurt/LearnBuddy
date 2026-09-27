// Short-lived admin session (the adult's PIN) for a minor's profile
// (docs/privacy.md §PIN gate). Kept in memory only, and only for the one step
// the parents unlocked: the gated call clears it when it is done
// (components/settings/adultGate.tsx), leaving the settings clears it, and so
// does the app going to the background (installAdminAutoClear). The server
// lets it lapse after 5 minutes regardless.

type AdminToken = { token: string; expiresAt: number };

let current: AdminToken | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function setAdminToken(token: string, expiresAtIso: string): void {
  current = { token, expiresAt: new Date(expiresAtIso).getTime() };
  notify();
}

export function adminToken(now: number = Date.now()): string | null {
  if (!current) return null;
  if (current.expiresAt <= now) {
    // Expired: forget it, so nothing keeps showing an unlocked state.
    current = null;
    notify();
    return null;
  }
  return current.token;
}

export function clearAdminToken(): void {
  if (!current) return;
  current = null;
  notify();
}

export function onAdminChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The part of React Native's AppState this needs (kept narrow for tests). */
export type AppStateLike = {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
};

/**
 * Drops the token whenever the app leaves the foreground: the phone may be
 * handed back to the child, and the unlocked step is over. Returns the
 * unsubscribe.
 */
export function installAdminAutoClear(appState: AppStateLike): () => void {
  const sub = appState.addEventListener('change', (state) => {
    if (state === 'background') clearAdminToken();
  });
  return () => sub.remove();
}
