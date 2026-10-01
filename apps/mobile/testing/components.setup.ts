// Setup for the component project (vitest.components.config.ts).
//
// requires live verification in Claude Code session — this file replaces parts of the
// outside world (CLAUDE.md rule 8): the device's locale list and the two Expo native
// modules the theme talks to. Nothing of the app's own logic is faked, and no database is
// involved at this layer at all.

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// expo-localization reads the phone's languages through a native module. The app falls back
// to German when it finds nothing it supports, and German is what these tests assert, so the
// fake answers with the device the owner's daughter actually uses.
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'de', languageTag: 'de-DE', regionCode: 'DE' }],
  getCalendars: () => [{ timeZone: 'Europe/Berlin' }],
}));

// The theme writes the chosen palette into the system chrome (status and navigation bar).
// There is no chrome in jsdom; the call must simply not throw.
vi.mock('expo-navigation-bar', () => ({
  setBackgroundColorAsync: async () => undefined,
  setButtonStyleAsync: async () => undefined,
  setStyle: () => undefined,
  setVisibilityAsync: async () => undefined,
}));

vi.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: async () => undefined,
  getBackgroundColorAsync: async () => null,
}));

// react-native-web renders real DOM; every test gets a clean document.
afterEach(() => {
  cleanup();
});
