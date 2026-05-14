// Unit alias map for parseNumericInput. Doc 07 §4.3.
// Maps German + English words to canonical SI symbols.

export const UNIT_ALIASES: Record<string, string> = {
  // length
  meter: 'm',
  meters: 'm',
  metern: 'm',
  m: 'm',
  zentimeter: 'cm',
  cm: 'cm',
  millimeter: 'mm',
  mm: 'mm',
  kilometer: 'km',
  km: 'km',
  inch: 'in',
  inches: 'in',
  zoll: 'in',

  // time
  sekunde: 's',
  sekunden: 's',
  second: 's',
  seconds: 's',
  s: 's',
  minute: 'min',
  minuten: 'min',
  minutes: 'min',
  min: 'min',
  stunde: 'h',
  stunden: 'h',
  hour: 'h',
  hours: 'h',
  h: 'h',
  tag: 'd',
  tage: 'd',
  day: 'd',
  days: 'd',

  // speed
  'km/h': 'km/h',
  kmh: 'km/h',
  'kilometer pro stunde': 'km/h',
  'meilen pro stunde': 'mph',
  'miles per hour': 'mph',
  mph: 'mph',
  'm/s': 'm/s',
  'meter pro sekunde': 'm/s',
  'meters per second': 'm/s',

  // mass
  gramm: 'g',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogramm: 'kg',
  kilogram: 'kg',
  kg: 'kg',
  milligramm: 'mg',
  mg: 'mg',
  tonne: 't',
  tonnen: 't',

  // volume
  liter: 'l',
  litern: 'l',
  l: 'l',
  milliliter: 'ml',
  ml: 'ml',

  // currency / counts
  euro: 'EUR',
  '€': 'EUR',
  dollar: 'USD',
  $: 'USD',
  stück: 'stk',
  stueck: 'stk',
  pieces: 'pcs',
};

export function canonicalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? raw.trim();
}
