// Password rules and the recovery link from the reset e-mail. Pure: no React
// Native, no Supabase, so it runs under the Node test runner.
//
// Supabase Auth sends the learner back to the redirect URL in one of three
// shapes, depending on the client's flow and the e-mail template:
//   implicit (this app's client): #access_token=…&refresh_token=…&type=recovery
//   PKCE:                         ?code=…
//   token-hash e-mail template:   ?token_hash=…&type=recovery
// An expired or already used link arrives as ?error=…&error_code=otp_expired
// (in the query or the fragment).

/** Same rule as signing up (app/welcome.tsx). */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem = 'too_short' | 'mismatch';

/** Why a new password (typed twice) cannot be saved yet, or null when it can. */
export function passwordProblem(password: string, repeat: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password !== repeat) return 'mismatch';
  return null;
}

export function looksLikeEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string }
  /** No usable recovery data: expired, already used, wrong link or opened by hand. */
  | { kind: 'invalid' };

// React Native's URLSearchParams is incomplete, so the parameters are split by hand.
function params(part: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of part.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      out.set(
        decodeURIComponent(rawKey.replace(/\+/g, ' ')),
        decodeURIComponent(rawValue.replace(/\+/g, ' ')),
      );
    } catch {
      // A malformed escape: skip this pair rather than guessing.
    }
  }
  return out;
}

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: 'invalid' };
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const hash = params(hashAt < 0 ? '' : url.slice(hashAt + 1));
  const queryAt = beforeHash.indexOf('?');
  const query = params(queryAt < 0 ? '' : beforeHash.slice(queryAt + 1));
  const get = (key: string): string => hash.get(key) ?? query.get(key) ?? '';

  if (get('error') || get('error_code')) return { kind: 'invalid' };

  const accessToken = hash.get('access_token') ?? '';
  const refreshToken = hash.get('refresh_token') ?? '';
  if (accessToken && refreshToken) {
    return hash.get('type') === 'recovery'
      ? { kind: 'tokens', accessToken, refreshToken }
      : { kind: 'invalid' };
  }

  const tokenHash = query.get('token_hash') ?? '';
  if (tokenHash) {
    return query.get('type') === 'recovery'
      ? { kind: 'token_hash', tokenHash }
      : { kind: 'invalid' };
  }

  const code = query.get('code') ?? '';
  if (code) return { kind: 'code', code };

  return { kind: 'invalid' };
}

/** The same URL without query and fragment, so tokens do not linger in the address bar (web). */
export function withoutSecrets(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}
