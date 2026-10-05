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
  // Written without the raised digit, as a phone keyboard leaves it (issue #227 A6).
  mm2: 'mm²',
  cm2: 'cm²',
  dm2: 'dm²',
  m2: 'm²',
  km2: 'km²',
  'mm³': 'mm³',
  'mm^3': 'mm³',
  mm3: 'mm³',
  cm3: 'cm³',
  dm3: 'dm³',
  m3: 'm³',
  ha: 'ha',
  hektar: 'ha',
  hectare: 'ha',
  hectares: 'ha',

  // angle (issue #227 A6): a bare degree sign; "°C" above is longer and wins.
  '°': '°',
  grad: '°',
  degree: '°',
  degrees: '°',

  // force: only the unit's name here — "N" is a capital letter, see CASE_SENSITIVE_UNITS.
  newton: 'N',
  kilonewton: 'kN',
  // electricity (issue #261): the names only — V, A and Ω are capitals (CASE_SENSITIVE_UNITS).
  volt: 'V',
  millivolt: 'mV',
  kilovolt: 'kV',
  ampere: 'A',
  milliampere: 'mA',
  ohm: 'Ω',
  kiloohm: 'kΩ',

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
  ct: 'ct',
  cent: 'ct',
  cents: 'ct',
  stück: 'stk',
  stueck: 'stk',
  pieces: 'pcs',
};

/**
 * Units whose symbol is a capital letter that, written small, is something else: "5 N" is five
 * newton, "5 n" or "2n" is a variable. Matched as written, never lower-cased (issue #227 A6).
 */
export const CASE_SENSITIVE_UNITS: Record<string, string> = {
  N: 'N',
  kN: 'kN',
  // "5 V" is five volt, "5 v" a variable; "2 A" two ampere, "2 a" two years or a variable.
  V: 'V',
  mV: 'mV',
  kV: 'kV',
  A: 'A',
  mA: 'mA',
  Ω: 'Ω',
  kΩ: 'kΩ',
};

export function canonicalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return CASE_SENSITIVE_UNITS[trimmed] ?? UNIT_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

// ─────────────── converting between units of one quantity (issue #227 A6) ───────────────
//
// "1,5 m" for a key of 150 cm is the same length; "1,4 m" is certainly another one. Without a
// conversion both reached the tutor as "not decidable by rules". Every unit below is an exact
// rational multiple of one base unit of its quantity, so a conversion never rounds. Units that
// are not a pure multiple (°C and kelvin, a currency against another) are deliberately absent:
// for those another unit stays the tutor's.

type Ratio = { num: bigint; den: bigint };
type Scale = { quantity: string; ratio: Ratio };

const r = (num: bigint, den: bigint = 1n): Ratio => ({ num, den });

const SCALES: Record<string, Scale> = {
  // length, in metres
  mm: { quantity: 'length', ratio: r(1n, 1000n) },
  cm: { quantity: 'length', ratio: r(1n, 100n) },
  dm: { quantity: 'length', ratio: r(1n, 10n) },
  m: { quantity: 'length', ratio: r(1n) },
  km: { quantity: 'length', ratio: r(1000n) },
  in: { quantity: 'length', ratio: r(127n, 5000n) },
  // area, in square metres
  'mm²': { quantity: 'area', ratio: r(1n, 1_000_000n) },
  'cm²': { quantity: 'area', ratio: r(1n, 10_000n) },
  'dm²': { quantity: 'area', ratio: r(1n, 100n) },
  'm²': { quantity: 'area', ratio: r(1n) },
  ha: { quantity: 'area', ratio: r(10_000n) },
  'km²': { quantity: 'area', ratio: r(1_000_000n) },
  // volume, in litres (1 dm³ = 1 l, 1 cm³ = 1 ml)
  'mm³': { quantity: 'volume', ratio: r(1n, 1_000_000n) },
  ml: { quantity: 'volume', ratio: r(1n, 1000n) },
  'cm³': { quantity: 'volume', ratio: r(1n, 1000n) },
  l: { quantity: 'volume', ratio: r(1n) },
  'dm³': { quantity: 'volume', ratio: r(1n) },
  'm³': { quantity: 'volume', ratio: r(1000n) },
  // mass, in grams
  mg: { quantity: 'mass', ratio: r(1n, 1000n) },
  g: { quantity: 'mass', ratio: r(1n) },
  kg: { quantity: 'mass', ratio: r(1000n) },
  t: { quantity: 'mass', ratio: r(1_000_000n) },
  // time, in seconds
  s: { quantity: 'time', ratio: r(1n) },
  min: { quantity: 'time', ratio: r(60n) },
  h: { quantity: 'time', ratio: r(3600n) },
  d: { quantity: 'time', ratio: r(86_400n) },
  // speed, in metres per second (1 km/h = 5/18 m/s)
  'm/s': { quantity: 'speed', ratio: r(1n) },
  'km/h': { quantity: 'speed', ratio: r(5n, 18n) },
  // force, in newton
  N: { quantity: 'force', ratio: r(1n) },
  kN: { quantity: 'force', ratio: r(1000n) },
  // voltage in volt, current in ampere, resistance in ohm (issue #261)
  mV: { quantity: 'voltage', ratio: r(1n, 1000n) },
  V: { quantity: 'voltage', ratio: r(1n) },
  kV: { quantity: 'voltage', ratio: r(1000n) },
  mA: { quantity: 'current', ratio: r(1n, 1000n) },
  A: { quantity: 'current', ratio: r(1n) },
  Ω: { quantity: 'resistance', ratio: r(1n) },
  kΩ: { quantity: 'resistance', ratio: r(1000n) },
  // money in euro, in cents — cents of another currency are another quantity
  ct: { quantity: 'euro', ratio: r(1n) },
  EUR: { quantity: 'euro', ratio: r(100n) },
};

/**
 * The exact factor that turns an amount in `from` into the same amount in `to` (canonical
 * symbols): 100 for m → cm, 1/60 for s → min. Null when the two are not units of the same
 * quantity, or when either is not convertible at all.
 */
export function unitFactor(from: string, to: string): Ratio | null {
  const a = SCALES[from];
  const b = SCALES[to];
  if (!a || !b || a.quantity !== b.quantity) return null;
  return { num: a.ratio.num * b.ratio.den, den: a.ratio.den * b.ratio.num };
}
