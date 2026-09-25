// Short-lived admin session (the adult's PIN) for a minor's profile. Kept in
// memory only: it expires after 10 minutes and never survives a restart.

type AdminToken = { token: string; expiresAt: number };

let current: AdminToken | null = null;
const listeners = new Set<() => void>();

export function setAdminToken(token: string, expiresAtIso: string): void {
  current = { token, expiresAt: new Date(expiresAtIso).getTime() };
  for (const l of listeners) l();
}

export function adminToken(): string | null {
  if (!current || current.expiresAt <= Date.now()) return null;
  return current.token;
}

export function clearAdminToken(): void {
  current = null;
  for (const l of listeners) l();
}

export function onAdminChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
