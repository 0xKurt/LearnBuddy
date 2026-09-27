import { describe, expect, it } from 'vitest';

import { announcePlan } from '../announcePlan.js';

describe('announcePlan (M-80)', () => {
  it('announces every status on iOS, queued, because VoiceOver has no live regions', () => {
    expect(announcePlan('Das hat nicht geklappt', 'ios', true)).toBe('queued');
    expect(announcePlan('Buddy: Hallo', 'ios', false)).toBe('queued');
  });

  it('leaves live regions to Android and announces the rest', () => {
    expect(announcePlan('Gesperrt', 'android', true)).toBe('none');
    expect(announcePlan('Buddy: Hallo', 'android', false)).toBe('plain');
  });

  it('never announces empty text, and leaves the web to aria-live', () => {
    expect(announcePlan('  ', 'ios', false)).toBe('none');
    expect(announcePlan('Fehler', 'web', true)).toBe('none');
  });
});
