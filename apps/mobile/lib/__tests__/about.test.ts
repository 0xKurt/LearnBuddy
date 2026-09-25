import { describe, expect, it } from 'vitest';

import { aboutLinks } from '../about.js';

describe('aboutLinks', () => {
  it('shows nothing that is not configured', () => {
    expect(aboutLinks({ privacyUrl: '', imprintUrl: '', supportEmail: '' })).toEqual([]);
  });

  it('lists the configured links in a fixed order', () => {
    expect(
      aboutLinks({
        privacyUrl: ' https://example.org/datenschutz ',
        imprintUrl: 'https://example.org/impressum',
        supportEmail: 'hilfe@example.org',
      }),
    ).toEqual([
      { kind: 'privacy', href: 'https://example.org/datenschutz', detail: null },
      { kind: 'imprint', href: 'https://example.org/impressum', detail: null },
      { kind: 'support', href: 'mailto:hilfe@example.org', detail: 'hilfe@example.org' },
    ]);
  });

  it('hides values that are not a web or e-mail address', () => {
    expect(
      aboutLinks({
        privacyUrl: 'example.org/datenschutz',
        imprintUrl: 'javascript:alert(1)',
        supportEmail: 'not an address',
      }),
    ).toEqual([]);
  });
});
