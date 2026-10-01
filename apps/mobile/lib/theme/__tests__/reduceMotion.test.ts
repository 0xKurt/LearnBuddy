// Reduce motion means "replace movement with a cross-fade", not "show nothing moving at
// all" (issue #126, WCAG 2.3.3). The file's own comment promised that for months while the
// code switched the animation off entirely.

import { describe, expect, it } from 'vitest';

import { entersWith } from '../reduceMotion.js';

describe('how something enters', () => {
  it('rises on a phone with motion allowed', () => {
    expect(entersWith(false, 'ios')).toBe('rise');
    expect(entersWith(false, 'android')).toBe('rise');
  });

  it('fades in place when the system asks for less motion', () => {
    expect(entersWith(true, 'ios')).toBe('fade');
    expect(entersWith(true, 'android')).toBe('fade');
  });

  it('never rises on the web, whatever the setting', () => {
    // Reanimated 4.1 pins a web element with custom initial values to an absolute
    // position once the animation ends.
    expect(entersWith(false, 'web')).toBe('fade');
    expect(entersWith(true, 'web')).toBe('fade');
  });
});
