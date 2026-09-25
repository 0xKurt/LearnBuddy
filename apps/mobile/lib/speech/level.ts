// How loud she is right now, as 0…1 for the orb's sound bars (pure,
// unit-tested). Two sources: the recorder's metering in dBFS (-160…0) and
// the on-device recogniser's volume (-2…10, below 0 = inaudible).

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** Speech is roughly -50…-5 dBFS; quieter is silence. */
export function levelFromDb(db: number | null | undefined): number {
  if (db === null || db === undefined || !Number.isFinite(db)) return 0;
  return clamp((db + 50) / 45);
}

export function levelFromRecognizer(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return clamp(value / 10);
}

/** Bar heights (0…1) for five bars: the middle one moves most, calm when silent. */
export function barHeights(level: number): number[] {
  const l = clamp(level);
  return [0.35, 0.65, 1, 0.65, 0.35].map((w) => 0.25 + 0.75 * w * (0.35 + 0.65 * l));
}
