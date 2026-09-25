// Static imports so Metro bundles every language; no network loading.
import deAuth from '../../locales/de/auth.json';
import deBuddy from '../../locales/de/buddy.json';
import deCapture from '../../locales/de/capture.json';
import deCommon from '../../locales/de/common.json';
import deErrors from '../../locales/de/errors.json';
import deLibrary from '../../locales/de/library.json';
import deMemory from '../../locales/de/memory.json';
import dePractice from '../../locales/de/practice.json';
import deSettings from '../../locales/de/settings.json';
import enAuth from '../../locales/en/auth.json';
import enBuddy from '../../locales/en/buddy.json';
import enCapture from '../../locales/en/capture.json';
import enCommon from '../../locales/en/common.json';
import enErrors from '../../locales/en/errors.json';
import enLibrary from '../../locales/en/library.json';
import enMemory from '../../locales/en/memory.json';
import enPractice from '../../locales/en/practice.json';
import enSettings from '../../locales/en/settings.json';
import esAuth from '../../locales/es/auth.json';
import esBuddy from '../../locales/es/buddy.json';
import esCapture from '../../locales/es/capture.json';
import esCommon from '../../locales/es/common.json';
import esErrors from '../../locales/es/errors.json';
import esLibrary from '../../locales/es/library.json';
import esMemory from '../../locales/es/memory.json';
import esPractice from '../../locales/es/practice.json';
import esSettings from '../../locales/es/settings.json';
import frAuth from '../../locales/fr/auth.json';
import frBuddy from '../../locales/fr/buddy.json';
import frCapture from '../../locales/fr/capture.json';
import frCommon from '../../locales/fr/common.json';
import frErrors from '../../locales/fr/errors.json';
import frLibrary from '../../locales/fr/library.json';
import frMemory from '../../locales/fr/memory.json';
import frPractice from '../../locales/fr/practice.json';
import frSettings from '../../locales/fr/settings.json';
import itAuth from '../../locales/it/auth.json';
import itBuddy from '../../locales/it/buddy.json';
import itCapture from '../../locales/it/capture.json';
import itCommon from '../../locales/it/common.json';
import itErrors from '../../locales/it/errors.json';
import itLibrary from '../../locales/it/library.json';
import itMemory from '../../locales/it/memory.json';
import itPractice from '../../locales/it/practice.json';
import itSettings from '../../locales/it/settings.json';

export const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'es', 'it'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const NAMESPACES = [
  'common',
  'auth',
  'buddy',
  'practice',
  'capture',
  'memory',
  'settings',
  'library',
  'errors',
] as const;

export const resources = {
  de: {
    common: deCommon,
    auth: deAuth,
    buddy: deBuddy,
    practice: dePractice,
    capture: deCapture,
    memory: deMemory,
    settings: deSettings,
    library: deLibrary,
    errors: deErrors,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    buddy: enBuddy,
    practice: enPractice,
    capture: enCapture,
    memory: enMemory,
    settings: enSettings,
    library: enLibrary,
    errors: enErrors,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    buddy: frBuddy,
    practice: frPractice,
    capture: frCapture,
    memory: frMemory,
    settings: frSettings,
    library: frLibrary,
    errors: frErrors,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    buddy: esBuddy,
    practice: esPractice,
    capture: esCapture,
    memory: esMemory,
    settings: esSettings,
    library: esLibrary,
    errors: esErrors,
  },
  it: {
    common: itCommon,
    auth: itAuth,
    buddy: itBuddy,
    practice: itPractice,
    capture: itCapture,
    memory: itMemory,
    settings: itSettings,
    library: itLibrary,
    errors: itErrors,
  },
} as const;
