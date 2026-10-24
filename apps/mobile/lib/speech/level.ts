// How loud she is right now, as 0…1 for the listening moon's glow (pure,
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

/**
 * What a screen shows of a running recording (issue #637): the time in whole seconds (the clock
 * shows no less) and the level in steps of 1/20 (the orb springs between them), room tone as 0. The recorder is
 * read every 120 ms; a reading that changes nothing shown keeps the same object, so the screen
 * does not draw again for it. Before, Talk drew itself anew seven times a second while she was
 * silent.
 */
export type Meter = { elapsedMs: number; level: number };

const LEVEL_STEPS = 20;

/** Display-only floor for the orb; speech gates learn their own background in noiseFloor.ts. */
const ROOM_TONE = 0.12;

export function meterShown(
  prev: Meter,
  durationMillis: number,
  db: number | null | undefined,
): Meter {
  const elapsedMs = Math.floor(Math.max(0, durationMillis) / 1000) * 1000;
  // The room's own hum shows as the silence it is: it flickered 0 ↔ 0.05 on every reading.
  const heard = levelFromDb(db);
  const level = heard <= ROOM_TONE ? 0 : Math.round(heard * LEVEL_STEPS) / LEVEL_STEPS;
  return prev.elapsedMs === elapsedMs && prev.level === level ? prev : { elapsedMs, level };
}
