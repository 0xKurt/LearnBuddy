import { describe, expect, it } from 'vitest';

import { DaySpecSchema, UntilSpecSchema } from '../decision.js';

describe('day and duration specs (flat for the model, exact for the server)', () => {
  it('turns the flat form into the exact spec the server resolves', () => {
    expect(DaySpecSchema.parse({ kind: 'in_days', days: 3, date: null, weekday: null })).toEqual({
      kind: 'in_days',
      days: 3,
    });
    expect(DaySpecSchema.parse({ kind: 'weekday', weekday: 4 })).toEqual({
      kind: 'weekday',
      weekday: 4,
      weeks_ahead: 0,
    });
    expect(
      UntilSpecSchema.parse({ kind: 'through', day: { kind: 'date', date: '2026-10-02' } }),
    ).toEqual({ kind: 'through', day: { kind: 'date', date: '2026-10-02' } });
  });

  it('refuses a kind without the field it needs — no guessed dates', () => {
    expect(DaySpecSchema.safeParse({ kind: 'date' }).success).toBe(false);
    expect(DaySpecSchema.safeParse({ kind: 'in_days', days: null }).success).toBe(false);
    expect(DaySpecSchema.safeParse({ kind: 'date', date: 'next friday' }).success).toBe(false);
    expect(UntilSpecSchema.safeParse({ kind: 'through' }).success).toBe(false);
  });
});
