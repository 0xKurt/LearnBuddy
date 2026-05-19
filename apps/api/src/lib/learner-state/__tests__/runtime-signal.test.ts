import { describe, expect, it } from 'vitest';

import {
  buildRecentRhythmFragment,
  computeRuntimeSignal,
  type SignalTurn,
} from '../runtime-signal.js';

// Stable timeline for tests. Each entry is +1s after the previous unless
// stated. Keeps latency math deterministic.
function timeline(
  turns: Array<Omit<SignalTurn, 'created_at'>>,
  startMs = Date.UTC(2026, 0, 1, 12, 0, 0),
) {
  return turns.map((t, i) => ({ ...t, created_at: new Date(startMs + i * 1000).toISOString() }));
}

const tutor = (
  item_id: string | null,
  verdict: SignalTurn['verdict'],
): Omit<SignalTurn, 'created_at'> => ({ role: 'tutor', item_id, verdict });

const learner = (
  item_id: string | null,
  content_length: number,
): Omit<SignalTurn, 'created_at'> => ({
  role: 'learner',
  item_id,
  verdict: null,
  content_length,
});

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 5, 0));
const START = new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString();

const emptyMaps = {
  itemDifficulty: new Map<string, number>(),
  itemTopic: new Map<string, string | null>(),
};

describe('computeRuntimeSignal — streak counts', () => {
  it('returns zeros for an empty session', () => {
    const s = computeRuntimeSignal({
      turns: [],
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.consecutive_wrong).toBe(0);
    expect(s.consecutive_correct).toBe(0);
    expect(s.consecutive_give_ups).toBe(0);
  });

  it('counts 3 consecutive correct at the tail', () => {
    const turns = timeline([
      learner('i1', 5),
      tutor('i1', 'incorrect'),
      learner('i1', 6),
      tutor('i1', 'correct'),
      learner('i2', 4),
      tutor('i2', 'correct'),
      learner('i3', 5),
      tutor('i3', 'correct'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.consecutive_correct).toBe(3);
    expect(s.consecutive_wrong).toBe(0);
  });

  it('counts 2 trailing skips + 3 trailing wrongs (skips count as wrongs)', () => {
    const turns = timeline([
      learner('i1', 5),
      tutor('i1', 'correct'),
      learner('i2', 5),
      tutor('i2', 'incorrect'),
      learner('i2', 5),
      tutor('i2', 'skipped'),
      learner('i2', 5),
      tutor('i2', 'skipped'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.consecutive_wrong).toBe(3);
    expect(s.consecutive_give_ups).toBe(2);
  });
});

describe('computeRuntimeSignal — scaffolded_correct_by_topic (Phase A5 silent retry)', () => {
  it('counts a correct as scaffolded when the same item had prior wrong/skipped', () => {
    const turns = timeline([
      learner('i1', 5),
      tutor('i1', 'incorrect'),
      learner('i1', 5),
      tutor('i1', 'correct'), // ← scaffolded correct on i1
      learner('i2', 5),
      tutor('i2', 'correct'), // ← NOT scaffolded (first attempt)
    ]);
    const itemTopic = new Map([
      ['i1', 'Brüche'],
      ['i2', 'Brüche'],
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty: new Map(),
      itemTopic,
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.scaffolded_correct_by_topic).toEqual({ Brüche: 1 });
  });

  it('groups items without topic under __no_topic__', () => {
    const turns = timeline([
      learner('ix', 5),
      tutor('ix', 'skipped'),
      learner('ix', 5),
      tutor('ix', 'correct'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty: new Map(),
      itemTopic: new Map(),
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.scaffolded_correct_by_topic).toEqual({ __no_topic__: 1 });
  });
});

describe('computeRuntimeSignal — ceiling_signal (Phase E + bored-genius)', () => {
  it('is high when last few hard-item turns are fast+correct', () => {
    // Each pair is learner+1s+tutor, so latency = 1000ms < 8000.
    const turns = timeline([
      learner('h1', 5),
      tutor('h1', 'correct'),
      learner('h2', 5),
      tutor('h2', 'correct'),
      learner('h3', 5),
      tutor('h3', 'correct'),
    ]);
    const itemDifficulty = new Map([
      ['h1', 4],
      ['h2', 4],
      ['h3', 5],
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty,
      itemTopic: new Map(),
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.ceiling_signal).toBe(1);
  });

  it('is 0 when all recent items are easy difficulty <3', () => {
    const turns = timeline([
      learner('e1', 5),
      tutor('e1', 'correct'),
      learner('e2', 5),
      tutor('e2', 'correct'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty: new Map([
        ['e1', 1],
        ['e2', 2],
      ]),
      itemTopic: new Map(),
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.ceiling_signal).toBe(0);
  });
});

describe('computeRuntimeSignal — fatigue', () => {
  it('starts low for short, recent sessions', () => {
    const turns = timeline([learner('i1', 5), tutor('i1', 'correct')]);
    const s = computeRuntimeSignal({
      turns,
      ...emptyMaps,
      sessionStartedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      now: NOW,
    });
    // 1 turn / 1 minute → very low fatigue
    expect(s.fatigue).toBeLessThan(0.1);
  });

  it('rises with turn count and minutes', () => {
    const turns = timeline(
      Array.from({ length: 40 }, (_, i) =>
        i % 2 === 0 ? learner(`i${i}`, 5) : tutor(`i${i - 1}`, 'correct'),
      ),
    );
    const s = computeRuntimeSignal({
      turns,
      ...emptyMaps,
      sessionStartedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      now: NOW,
    });
    // 20 tutor turns + 30 minutes → mid-fatigue
    expect(s.fatigue).toBeGreaterThan(0.4);
    expect(s.fatigue).toBeLessThan(0.95);
  });
});

describe('computeRuntimeSignal — emotional_temperature (derived, never labeled)', () => {
  it('returns "cratering" on 3+ wrong with shrinking message length', () => {
    const turns = timeline([
      learner('i1', 20),
      tutor('i1', 'incorrect'),
      learner('i1', 15),
      tutor('i1', 'incorrect'),
      learner('i1', 8),
      tutor('i1', 'skipped'),
      learner('i1', 3),
      tutor('i1', 'skipped'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.emotional_temperature).toBe('cratering');
  });

  it('returns "curious" on consistent fast-correct on hard items', () => {
    const turns = timeline([
      learner('h1', 12),
      tutor('h1', 'correct'),
      learner('h2', 14),
      tutor('h2', 'correct'),
    ]);
    const itemDifficulty = new Map([
      ['h1', 4],
      ['h2', 4],
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty,
      itemTopic: new Map(),
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.emotional_temperature).toBe('curious');
  });

  it('returns "engaged" on plain correct streak (no ceiling signal)', () => {
    const turns = timeline([
      learner('i1', 8),
      tutor('i1', 'correct'),
      learner('i2', 8),
      tutor('i2', 'correct'),
    ]);
    const s = computeRuntimeSignal({
      turns,
      itemDifficulty: new Map([
        ['i1', 2],
        ['i2', 2],
      ]),
      itemTopic: new Map(),
      sessionStartedAt: START,
      now: NOW,
    });
    expect(s.emotional_temperature).toBe('engaged');
  });
});

describe('buildRecentRhythmFragment — L1 invariant', () => {
  it('emits observations, never analytical labels', () => {
    const s = computeRuntimeSignal({
      turns: timeline([
        learner('i1', 20),
        tutor('i1', 'incorrect'),
        learner('i1', 8),
        tutor('i1', 'incorrect'),
        learner('i1', 3),
        tutor('i1', 'skipped'),
      ]),
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    const frag = buildRecentRhythmFragment(s, ['incorrect', 'incorrect', 'skipped']);
    // Observation words allowed
    expect(frag).toMatch(/Last \d+ tutor verdicts/);
    expect(frag).toMatch(/incorrect, incorrect, skipped/);
    expect(frag).toMatch(/Time in session/);
    // Analytical labels FORBIDDEN
    expect(frag.toLowerCase()).not.toMatch(/frustrated|frustriert|cratering|bored|tired|stuck/);
    // Especially must NOT include first-person framing
    expect(frag.toLowerCase()).not.toMatch(/the student is|du bist|seems to/);
  });

  it('handles an empty session', () => {
    const s = computeRuntimeSignal({
      turns: [],
      ...emptyMaps,
      sessionStartedAt: START,
      now: NOW,
    });
    const frag = buildRecentRhythmFragment(s, []);
    expect(frag).toMatch(/Recent rhythm/);
    expect(frag).toMatch(/none yet/);
  });
});
