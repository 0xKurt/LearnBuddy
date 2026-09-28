// UI texts live in locales/<language>/<namespace>.json (de is the default
// and fallback; en, fr, es, it must have every key — see the parity test).
// The language follows the learner profile once known, else an explicit choice
// made on this device (the welcome flags), else the device's system language.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { NAMESPACES, resources, SUPPORTED_LOCALES, type AppLocale } from './resources.js';

/** A language chosen by tapping a flag, kept per device across restarts. */
const CHOSEN_KEY = 'lb.locale.chosen';

export function deviceLocale(): AppLocale {
  for (const l of getLocales()) {
    const code = l.languageCode as AppLocale | null;
    if (code && SUPPORTED_LOCALES.includes(code)) return code;
  }
  return 'de';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLocale(),
  fallbackLng: 'de',
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLocale(locale: AppLocale): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

/**
 * An explicit tap on a flag: applies at once and survives restarts and
 * sign-outs on this device (a French family on a German phone stays French).
 * The learner profile still wins once signed in (applyLocale via follow.ts).
 */
export function chooseDeviceLocale(locale: AppLocale): void {
  applyLocale(locale);
  void AsyncStorage.setItem(CHOSEN_KEY, locale).catch(() => undefined);
}

/** The language for signed-out screens: the device choice, else the system's. */
export async function fallbackLocale(): Promise<AppLocale> {
  const kept = (await AsyncStorage.getItem(CHOSEN_KEY).catch(() => null)) as AppLocale | null;
  return kept && SUPPORTED_LOCALES.includes(kept) ? kept : deviceLocale();
}

/** At start-up, before the first screen: an earlier flag tap applies again. */
export async function restoreChosenLocale(): Promise<void> {
  applyLocale(await fallbackLocale());
}

export function currentLocale(): AppLocale {
  const l = i18n.language as AppLocale;
  return SUPPORTED_LOCALES.includes(l) ? l : 'de';
}

export { i18n };
export type { AppLocale };
