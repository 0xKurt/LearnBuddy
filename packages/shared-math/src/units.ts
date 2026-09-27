// Unit alias map for parseNumericInput (docs/architecture.md §Practice, grading).
// Maps unit symbols and unit names to one canonical symbol. Keys are lower case.

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

  // area, volume, temperature (school units; audit p2-NM-06)
  dm: 'dm',
  'mm²': 'mm²',
  'mm^2': 'mm²',
  'cm²': 'cm²',
  'cm^2': 'cm²',
  'dm²': 'dm²',
  'dm^2': 'dm²',
  'm²': 'm²',
  'm^2': 'm²',
  'km²': 'km²',
  'km^2': 'km²',
  'cm³': 'cm³',
  'cm^3': 'cm³',
  'dm³': 'dm³',
  'dm^3': 'dm³',
  'm³': 'm³',
  'm^3': 'm³',
  '°c': '°C',
  std: 'h',
  t: 't',

  // percent and per mille: a unit, never "÷ 100" (audit C-4). The unit's names as they are
  // said, so a dictated "25 Prozent" is read like "25 %".
  '%': '%',
  prozent: '%',
  percent: '%',
  'per cent': '%',
  'pour cent': '%',
  pourcent: '%',
  'por ciento': '%',
  'per cento': '%',
  '‰': '‰',
  promille: '‰',

  // currency / counts
  euro: 'EUR',
  eur: 'EUR',
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
