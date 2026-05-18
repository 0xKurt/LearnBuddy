// PIN + biometric admin gate. Doc 05 §10 + §Unlock + Doc 09 §8.
//
// PIN is hashed with bcryptjs (cost 8) and persisted in expo-secure-store
// (OS-encrypted Keychain on iOS, EncryptedSharedPreferences on Android). The
// 4-digit search space is small, so the bcrypt cost matters less than the
// OS-level encryption — both are defense in depth.
//
// Biometric is gated by `expo-local-authentication`. Hardware + enrollment
// must both be present before we surface the option in setup or fire the
// prompt in unlock.
//
// Lockout (per Doc 05 §Unlock): 5 wrong PIN entries in 5 minutes triggers a
// 15-minute lock. State persists in secure-store so killing the app doesn't
// reset the counter. Biometric remains usable during a PIN lockout.

import bcrypt from 'bcryptjs';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_HASH = 'lb.pin.hash';
const KEY_BIOMETRIC = 'lb.pin.biometric_enabled';
const KEY_LOCKOUT = 'lb.pin.lockout';

const LOCK_WINDOW_MS = 5 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const LOCK_THRESHOLD = 5;

// bcryptjs defaults to Math.random for salt when no fallback is set.
// React Native (RN 0.74+ on Hermes) ships globalThis.crypto.getRandomValues,
// so wire it once here to avoid a weak salt.
const rng = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
if (rng) {
  bcrypt.setRandomFallback((len: number) => {
    const buf = new Uint8Array(len);
    rng(buf);
    return Array.from(buf);
  });
}

// ── Pure hash / verify ──────────────────────────────────────────────────

/** Hash a 4-digit PIN. Slow (~200–400ms on a phone); call off the main loop. */
export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 8);
}

/** Constant-time PIN check against a stored bcrypt hash. */
export function verifyPinHash(pin: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(pin, hash);
  } catch {
    return false;
  }
}

// ── PIN storage ─────────────────────────────────────────────────────────

export async function setPin(pin: string): Promise<void> {
  const hash = hashPin(pin);
  await SecureStore.setItemAsync(KEY_HASH, hash);
  await clearLockout();
}

export async function hasPin(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_HASH);
  return !!v;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const hash = await SecureStore.getItemAsync(KEY_HASH);
  if (!hash) return false;
  return verifyPinHash(pin, hash);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_HASH);
  await SecureStore.deleteItemAsync(KEY_BIOMETRIC);
  await clearLockout();
}

// ── Biometric preference + capability ───────────────────────────────────

export async function hasBiometricHardware(): Promise<boolean> {
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    if (!hw) return false;
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<'face' | 'fingerprint' | null> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    // Android face unlock is class-2 (weaker); fingerprint is class-3 (hardware-backed).
    // Prefer fingerprint on Android so devices that have both don't get labelled "Face ID".
    if (Platform.OS === 'android') {
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    } else {
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    }
    return null;
  } catch {
    return null;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_BIOMETRIC);
  return v === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(KEY_BIOMETRIC, '1');
  else await SecureStore.deleteItemAsync(KEY_BIOMETRIC);
}

/** Returns true on a successful biometric prompt. The caller passes both the
 *  prompt and cancel labels already localised — no copy lives in this module. */
export async function authenticateBiometric(
  promptMessage: string,
  cancelLabel: string,
): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // Don't fall back to device passcode — we have our own PIN.
      disableDeviceFallback: true,
      cancelLabel,
    });
    return res.success;
  } catch {
    return false;
  }
}

// ── 5-fail lockout state ────────────────────────────────────────────────

type LockoutState = {
  failures: number;
  first_failure_at: number;
  locked_until: number;
};

async function loadLockout(): Promise<LockoutState> {
  const raw = await SecureStore.getItemAsync(KEY_LOCKOUT);
  if (!raw) return { failures: 0, first_failure_at: 0, locked_until: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<LockoutState>;
    return {
      failures: Number(parsed.failures ?? 0),
      first_failure_at: Number(parsed.first_failure_at ?? 0),
      locked_until: Number(parsed.locked_until ?? 0),
    };
  } catch {
    return { failures: 0, first_failure_at: 0, locked_until: 0 };
  }
}

async function saveLockout(state: LockoutState): Promise<void> {
  await SecureStore.setItemAsync(KEY_LOCKOUT, JSON.stringify(state));
}

/** Returns the ms until PIN entry is allowed again; 0 if not locked. */
export async function pinLockedUntil(now = Date.now()): Promise<number> {
  const state = await loadLockout();
  return state.locked_until > now ? state.locked_until : 0;
}

/** Record a failed PIN attempt. Returns the (possibly new) locked-until ms. */
export async function recordPinFailure(now = Date.now()): Promise<number> {
  const state = await loadLockout();
  // Drop stale window — failures older than LOCK_WINDOW_MS reset the counter.
  if (state.failures > 0 && now - state.first_failure_at > LOCK_WINDOW_MS) {
    state.failures = 0;
    state.first_failure_at = 0;
  }
  state.failures += 1;
  if (state.failures === 1) state.first_failure_at = now;
  if (state.failures >= LOCK_THRESHOLD) {
    state.locked_until = now + LOCK_DURATION_MS;
  }
  await saveLockout(state);
  return state.locked_until > now ? state.locked_until : 0;
}

export async function clearLockout(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_LOCKOUT);
}
