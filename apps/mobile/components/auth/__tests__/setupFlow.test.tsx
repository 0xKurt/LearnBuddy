// The setup as the design has it (#599; ui_kits/app/Welcome.jsx, Onboarding.jsx, Gaps.jsx:16–39,
// Flows.jsx `ResetInvalid`), as far as source and locale files can say it. What only a browser
// can measure — a field whole above the pinned action, a title on one line — is tests/web.
//
//   · one count for the whole way: privacy 1, the profile 2, the voice 3, the colours 4 of 4;
//     the cards that explain Buddy and the hand-over carry none;
//   · the count reads as the design writes it ("2 von 4"), in five languages;
//   · the pages before the app keep their 20 pt margin, not the app's 16;
//   · no lavender box on a setup page;
//   · the hand-over's lines name what is set in bold, and are only ever drawn through `Trans`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GUTTER_APP, GUTTER_OUTER, pinnedBar } from '../../../lib/theme/space.js';
import { SETUP_STATIONS, setupStep } from '../setupSteps.js';

const ROOT = join(__dirname, '../../..');
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const LANGUAGES = ['de', 'en', 'fr', 'es', 'it'] as const;
const locale = (lang: string, ns: string) =>
  JSON.parse(source(`locales/${lang}/${ns}.json`)) as Record<string, Record<string, string>>;

const PAGES = [
  'app/welcome.tsx',
  'app/reset-password.tsx',
  'app/consent.tsx',
  'app/profile.tsx',
  'app/onboarding.tsx',
  'components/auth/SetupStep.tsx',
  'components/auth/ContactStep.tsx',
  'components/auth/CheckPoints.tsx',
];

describe('the setup counts once, one to four', () => {
  it('numbers the four things it settles in the design’s order', () => {
    expect(SETUP_STATIONS).toEqual(['consent', 'profile', 'voice', 'look']);
    expect(SETUP_STATIONS.map(setupStep)).toEqual([
      { n: 1, count: 4 },
      { n: 2, count: 4 },
      { n: 3, count: 4 },
      { n: 4, count: 4 },
    ]);
  });

  it('gives every page its station and leaves the explaining cards and the hand-over without', () => {
    // Privacy counts only while it is the setup (no profile yet), not when a text changed later.
    expect(source('app/consent.tsx')).toContain("step={settingUp ? 'consent' : undefined}");
    const profile = source('app/profile.tsx');
    // Who learns and the parents' part are one shell; the voice is its own.
    expect(profile.match(/step="profile"/g)).toHaveLength(1);
    expect(profile.match(/step="voice"/g)).toHaveLength(1);
    const handover = profile.slice(profile.indexOf('function Handover('));
    expect(handover.slice(0, handover.indexOf('function VoiceStep('))).not.toContain('step=');
    expect(source('components/auth/ContactStep.tsx')).toContain('step="profile"');
    // The colours are the last card of the tour; the three before it settle nothing.
    const tour = source('app/onboarding.tsx');
    expect(tour).toContain("step={last ? 'look' : undefined}");
    expect(tour).not.toContain('step_label');
  });

  it('gives Buddy the pose the design gives him on each page', () => {
    // Onboarding.jsx: resting on privacy, the parents' page and the colours (Gaps.jsx:20), happy
    // on the hand-over, speaking on the voice page — there only while a sample is being read.
    expect(source('app/consent.tsx')).not.toContain('orbState');
    expect(source('app/onboarding.tsx')).not.toContain('orbState');
    expect(source('components/auth/ContactStep.tsx')).not.toContain('orbState');
    const profile = source('app/profile.tsx');
    expect(profile.match(/orbState=/g)).toHaveLength(2);
    expect(profile).toContain('orbState="happy"');
    expect(profile).toContain("orbState={voice.phase === 'speaking' ? 'speak' : 'idle'}");
  });

  it.each(LANGUAGES)(
    'writes the count as the design does, without a word before it (%s)',
    (lang) => {
      expect(locale(lang, 'common').onboarding!.step_label).toMatch(
        /^\{\{n\}\} \S+ \{\{count\}\}$/,
      );
    },
  );
});

describe('the pages before the app', () => {
  it('keep the 20 pt margin, also under the page', () => {
    expect(GUTTER_OUTER).toBe(20);
    expect(GUTTER_APP).toBe(16);
    expect(pinnedBar(0).paddingHorizontal).toBe(GUTTER_OUTER);
    for (const page of [
      'app/welcome.tsx',
      'app/reset-password.tsx',
      'components/auth/SetupStep.tsx',
    ]) {
      const text = source(page);
      expect(text, page).toContain('paddingHorizontal: GUTTER_OUTER');
      // The alias every page used so far (16) is gone from them.
      expect(text, page).not.toMatch(/\bGUTTER\b(?!_)/);
    }
  });

  it('draw no lavender box and nothing above Buddy', () => {
    for (const page of PAGES) {
      const text = source(page);
      expect(text, page).not.toContain('tone="lavender"');
      expect(text, page).not.toContain('palette.lavender');
      expect(text, page).not.toMatch(/\btop=\{/);
    }
  });

  it('shows an address to type in the e-mail field, as the design does', () => {
    expect(source('app/welcome.tsx')).toContain("placeholder={t('welcome.email_placeholder')}");
    for (const lang of LANGUAGES) {
      expect(locale(lang, 'auth').welcome!.email_placeholder, lang).toMatch(/^\S+@\S+\.\S+$/);
    }
  });
});

describe('the hand-over’s lines', () => {
  const LINES = ['handover_consent', 'handover_pin', 'handover_contact_on', 'handover_contact_off'];

  it.each(LANGUAGES)('name what is set in bold, with its colon, and nothing else (%s)', (lang) => {
    const profile = locale(lang, 'auth').profile!;
    for (const key of LINES) {
      const line = profile[key]!;
      // Design Onboarding.jsx:141: `<b>{k}:</b> {v}`.
      expect(line, key).toMatch(/^<strong>[^<>]+:<\/strong> [^<>]+$/);
    }
  });

  it('are drawn through Trans only, so no markup is ever shown as text', () => {
    const readers = PAGES.filter((page) =>
      /handover_(consent|pin)|handoverContactKey/.test(source(page)),
    );
    expect(readers).toEqual(['app/profile.tsx']);
    const profile = source('app/profile.tsx');
    expect(profile).toContain('components={{ strong: <Text style={TYPE.paragraphStrong} /> }}');
    // Never through plain `t()`, which would print the tags.
    expect(profile).not.toMatch(/t\(\s*'profile\.handover_(consent|pin|contact_on|contact_off)'/);
  });

  it('no other text of the setup carries markup', () => {
    for (const lang of LANGUAGES) {
      const auth = locale(lang, 'auth');
      for (const [group, texts] of Object.entries(auth)) {
        for (const [key, text] of Object.entries(texts)) {
          if (typeof text !== 'string' || (group === 'profile' && LINES.includes(key))) continue;
          expect(text, `${lang}:${group}.${key}`).not.toMatch(/<\/?[a-z]+>/);
        }
      }
    }
  });
});
