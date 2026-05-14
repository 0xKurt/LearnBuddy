// Connectivity probe. Doc 02 §F4: "not just the OS state — a HEAD to the
// API with a tight timeout."

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.learnbuddy.app/v1';

export async function isOnline(timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
