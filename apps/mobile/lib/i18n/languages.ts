// The five app languages, each named in itself (a French family finds
// "Français" whatever language the screen happens to speak). Used by the
// welcome screen's language picker and the profile step.
import type { AppLocale } from '@learnbuddy/shared-types/contracts';

export const LANGUAGES: Array<{ value: AppLocale; label: string; flag: string }> = [
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
];
