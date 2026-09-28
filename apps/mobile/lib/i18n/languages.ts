// The five app languages, each named in itself (a French family finds
// "Français" whatever language the screen happens to speak). Used by the
// welcome screen's language picker and the profile step.
import type { AppLocale } from '@learnbuddy/shared-types/contracts';

export const LANGUAGES: Array<{ value: AppLocale; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
];
