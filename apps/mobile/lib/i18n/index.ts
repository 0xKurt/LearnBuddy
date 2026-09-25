// UI texts live in locales/<language>/<namespace>.json (de is the default
// and fallback; en, fr, es, it must have every key — see the parity test).
// The language follows the learner profile once known, else the device.

import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { NAMESPACES, resources, SUPPORTED_LOCALES, type AppLocale } from './resources.js';

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

export function currentLocale(): AppLocale {
  const l = i18n.language as AppLocale;
  return SUPPORTED_LOCALES.includes(l) ? l : 'de';
}

export { i18n };
export type { AppLocale };
