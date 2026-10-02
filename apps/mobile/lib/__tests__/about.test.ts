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

  // The three lines a support reply would otherwise have to ask for, and only those
  // (audit 30.09., #133 position 14). What must NOT be in here is the point of the second
  // case: no name, no account, nothing about the child.
  const supportHref = (diagnostics: { app: string; os: string; device: string }): string => {
    const [support] = aboutLinks({
      privacyUrl: '',
      imprintUrl: '',
      supportEmail: 'hilfe@example.org',
      diagnostics,
    });
    if (!support) throw new Error('the support address was dropped');
    return decodeURIComponent(support.href);
  };

  it('pre-fills the support mail with the build, the OS and the model', () => {
    expect(supportHref({ app: '0.1.0', os: 'Android 14', device: 'Redmi Note 12' })).toBe(
      'mailto:hilfe@example.org?body=\n\n---\nLearnBuddy 0.1.0\nAndroid 14\nRedmi Note 12',
    );
  });

  it('leaves out a line this build cannot answer instead of writing a placeholder', () => {
    // The web knows no model name.
    expect(supportHref({ app: '0.1.0', os: 'Web', device: '' })).toBe(
      'mailto:hilfe@example.org?body=\n\n---\nLearnBuddy 0.1.0\nWeb',
    );
  });

  it('writes no body at all when the build knows nothing to say', () => {
    expect(supportHref({ app: '', os: '', device: '' })).toBe('mailto:hilfe@example.org');
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
