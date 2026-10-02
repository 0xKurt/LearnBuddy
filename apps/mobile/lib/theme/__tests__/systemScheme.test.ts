// What the OS is told about light and dark (issues #177, #194). The OS draws a sheet's
// navigation bar, the keyboard and alerts from it — and the provider reads the phone's own
// scheme back through the same channel, so the `system` answer is the one that must not drift.

import { describe, expect, it } from 'vitest';

import { MODES } from '../palettes.js';
import { systemSchemeFor } from '../systemScheme.js';

describe('the light/dark the OS draws its own parts in', () => {
  it('follows an explicit choice, so a sheet over the night palette gets a dark bar', () => {
    expect(systemSchemeFor('dark')).toBe('dark');
    expect(systemSchemeFor('light')).toBe('light');
  });

  it('hands the decision back to the phone when she follows the phone', () => {
    // Pinning here would make useColorScheme() report the app's own choice back to the app,
    // and "like the phone" would stop following the phone.
    expect(systemSchemeFor('system')).toBeNull();
  });

  it('has an answer for every mode the app knows', () => {
    for (const mode of MODES) expect(systemSchemeFor(mode)).not.toBeUndefined();
  });
});
