// Numbers the way the learner writes them: with a decimal comma in German,
// French, Spanish and Italian. Stored answers use a decimal point.
// (Plain logic without React Native imports, so it runs in the unit tests.)

const DECIMAL_COMMA: ReadonlySet<string> = new Set(['de', 'fr', 'es', 'it']);

/** "0.75" → "0,75" where a decimal comma is usual; anything that is not a plain decimal stays as it is. */
export function localDecimal(text: string, locale: string): string {
  const plain = text.trim();
  if (!DECIMAL_COMMA.has(locale) || !/^-?\d+\.\d+$/.test(plain)) return text;
  return plain.replace('.', ',');
}
