// requires live verification in Claude Code session (shared safeguarding eval tooling)
// Original safeguarding yardstick, shared by the live runner and its coverage test.
import { CASES as BUDDY_CASES } from '../buddy/cases.js';
import { CONCERN_CASES } from '../concern/cases.js';
import { TUTOR_SAFEGUARDING_CASES } from './safeguardingCases.js';
import { SAFEGUARDING_CONTROLS } from './safeguardingControls.js';

export type SafeguardingCase = {
  id: string;
  says: string;
  concern: boolean;
  locale: 'de' | 'en' | 'fr' | 'es' | 'it';
  surface: 'practice' | 'chat' | 'roleplay';
  category?: string;
  question?: string;
  /** Preserve the original practice endpoint checks, including attempts and stored replies. */
  dictation?: boolean;
};

export const SAFEGUARDING_CASES: readonly SafeguardingCase[] = [
  ...TUTOR_SAFEGUARDING_CASES.map((c) => ({
    ...c,
    locale: 'de' as const,
    surface: 'practice' as const,
    dictation: true,
  })),
  ...BUDDY_CASES.filter((c) => c.id.endsWith('_distress_safeguarding')).map((c) => ({
    id: c.id,
    says: c.message,
    concern: true,
    locale: c.learner?.locale ?? 'de',
    surface: 'practice' as const,
    dictation: true,
  })),
  ...CONCERN_CASES.filter((c) => c.expectConcern).map((c) => ({
    id: c.id,
    says: c.says,
    concern: true,
    locale: 'de' as const,
    surface: 'practice' as const,
    dictation: true,
  })),
  ...SAFEGUARDING_CONTROLS,
];
