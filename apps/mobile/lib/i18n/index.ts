// i18next setup. Namespaces are loaded statically; missing-key handler
// falls back to the key itself in non-prod and logs a warning.

import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import deCommon from '../../locales/de/common.json';
import deOnboarding from '../../locales/de/onboarding.json';
import enCommon from '../../locales/en/common.json';
import enOnboarding from '../../locales/en/onboarding.json';

const resources = {
  de: { common: deCommon, onboarding: deOnboarding },
  en: { common: enCommon, onboarding: enOnboarding },
} as const;

export type AppLocale = keyof typeof resources;

const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'de';
const initialLng: AppLocale = (deviceLocale === 'de' ? 'de' : 'en');

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: 'de',
  ns: ['common', 'onboarding'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
