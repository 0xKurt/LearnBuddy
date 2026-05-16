// Saved-locale storage. Doc 05 §i18n.
//
// The picker on first launch persists the chosen locale here; the i18n
// init reads it before falling back to device locale. The admin settings
// screen re-uses both functions to edit the locale later.

import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

const KEY = 'lb_app_locale_v1';

export type AppLocale = 'de' | 'en' | 'fr' | 'es' | 'it';

export const SUPPORTED_LOCALES: AppLocale[] = ['de', 'en', 'fr', 'es', 'it'];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
};

export const LOCALE_FLAGS: Record<AppLocale, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
};

function isSupported(code: string | null | undefined): code is AppLocale {
  return code != null && (SUPPORTED_LOCALES as string[]).includes(code);
}

/** Device-language guess, used as the default selection on first launch. */
export function detectDeviceLocale(): AppLocale {
  const code = Localization.getLocales()[0]?.languageCode ?? 'de';
  return isSupported(code) ? code : 'de';
}

/** SYNCHRONOUS read for the i18n initializer (which can't await). Falls back
 *  to the device locale; the asynchronous `loadSavedLocale()` runs right
 *  after mount and patches `i18n.language` if it differs. */
export function readSavedLocaleSync(): AppLocale | null {
  // SecureStore has no sync API; we ship null and patch async after mount.
  return null;
}

export async function loadSavedLocale(): Promise<AppLocale | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return isSupported(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveLocale(locale: AppLocale): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, locale);
  } catch {
    // No-op: SecureStore can fail in some Expo Go contexts; the choice
    // is lost on next cold start, but the rest of the session is fine.
  }
}
