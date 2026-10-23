/** Main school-language locales; regional variants use the same fallback across providers. */
const BY_LANGUAGE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  ru: 'ru-RU',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-BR',
  tr: 'tr-TR',
  uk: 'uk-UA',
};
export function mainSpeechLocale(locale: string): string | null {
  return BY_LANGUAGE[locale.split('-')[0] ?? ''] ?? null;
}
