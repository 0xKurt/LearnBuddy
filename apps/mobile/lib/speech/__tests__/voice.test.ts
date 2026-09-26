import { describe, expect, it } from 'vitest';

import {
  baseLanguage,
  formatClock,
  pickVoice,
  speakMime,
  speakMimeForFile,
  voiceLocale,
} from '../voice.js';

describe('voiceLocale', () => {
  it('reads each school language in its regional voice', () => {
    expect(voiceLocale('fr')).toBe('fr-FR');
    expect(voiceLocale('en')).toBe('en-GB');
    expect(voiceLocale('es')).toBe('es-ES');
    expect(voiceLocale('ru')).toBe('ru-RU');
    expect(voiceLocale('it')).toBe('it-IT');
    expect(voiceLocale('de')).toBe('de-DE');
    expect(voiceLocale('FR')).toBe('fr-FR');
  });

  it('keeps a region the item already names and passes other languages through', () => {
    expect(voiceLocale('fr-CA')).toBe('fr-CA');
    expect(voiceLocale('en_US')).toBe('en-US');
    expect(voiceLocale('pt')).toBe('pt');
  });

  it('finds the base language', () => {
    expect(baseLanguage('fr_FR')).toBe('fr');
    expect(baseLanguage('')).toBeNull();
    expect(baseLanguage(null)).toBeNull();
  });
});

describe('pickVoice', () => {
  const voices = [
    { identifier: 'ca', language: 'fr-CA', quality: 'Default' },
    { identifier: 'fr', language: 'fr-FR', quality: 'Default' },
    { identifier: 'fr+', language: 'fr_FR', quality: 'Enhanced' },
    { identifier: 'gb', language: 'en-GB', quality: 'Default' },
  ];

  it('prefers the exact region, enhanced over default', () => {
    expect(pickVoice(voices, 'fr-FR')).toBe('fr+');
    expect(pickVoice(voices, 'en-GB')).toBe('gb');
  });

  it('falls back to any voice of the language, or none', () => {
    expect(pickVoice(voices, 'en-US')).toBe('gb');
    expect(pickVoice(voices, 'es-ES')).toBeNull();
  });
});

describe('recording types', () => {
  it('maps browser blob types to what the server takes', () => {
    expect(speakMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(speakMime('audio/mp4')).toBe('audio/mp4');
    expect(speakMime('audio/ogg')).toBeNull();
    expect(speakMime('')).toBeNull();
  });

  it('maps native file extensions', () => {
    expect(speakMimeForFile('file:///cache/rec-1.m4a')).toBe('audio/mp4');
    expect(speakMimeForFile('file:///cache/rec.3gp')).toBeNull();
  });

  it('formats the timer', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7_900)).toBe('0:07');
    expect(formatClock(15_000)).toBe('0:15');
  });
});
