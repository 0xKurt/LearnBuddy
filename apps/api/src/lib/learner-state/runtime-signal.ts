// Runtime signal — Phase A3.
//
// Pure derivation of "what's been happening this session" from the
// conversation_turns rows. NO LLM call. Lives at the runtime tier (L2):
// the only inferences allowed here are those that have to drive the
// NEXT turn — strategy selector overrides, FSRS pickup overrides, and
// the tutor's "recent rhythm" prompt block.
//
// L1: the prompt block we generate is OBSERVATIONS, never LABELS. We
// emit "last 5 turns: incorrect, incorrect, skipped, skipped, ?" — not
// "the student is frustrated." Labels invite first-person empathy from
// the model, which violates the wall.

export type SignalTurn = {
  role: 'learner' | 'tutor';
  item_id: string | null;
  verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
  created_at: string; // ISO
  /** Optional: total characters of learner content. Used for the
   *  message-length-trend signal. tutor turns ignore this. */
  content_length?: number;
};

export type RuntimeSignal = {
  // ── Streak counts (across items in this session, no item boundary) ──
  consecutive_wrong: number;
  consecutive_give_ups: number;
  consecutive_correct: number;

  // ── Per-concept (item) scaffolded-success count — for A5 silent retry ──
  scaffolded_correct_by_topic: Record<string, number>;

  // ── Latency + length trends ──
  /** Average learner→tutor turn latency over the last 5 turns (ms). */
  avg_response_latency_ms: number;
  latency_trend: 'faster' | 'slower' | 'stable';
  message_length_trend: 'growing' | 'shrinking' | 'stable';

  // ── Session arc ──
  turns_in_session: number;
  minutes_in_session: number;
  /** Sigmoid of (turns, minutes). 0 = fresh, 1 = tired. The break
   *  suggestion threshold is 0.85; the easier-items threshold is 0.5. */
  fatigue: number;

  // ── Aggregate states — DERIVED from the above, never inferred ──
  emotional_temperature: 'engaged' | 'pressured' | 'flat' | 'curious' | 'cratering';
  cognitive_load: 'low' | 'medium' | 'high';
  /** 0..1 — fraction of recent fast+correct on items with difficulty>=3. */
  ceiling_signal: number;
};

export type ComputeSignalInput = {
  turns: ReadonlyArray<SignalTurn>;
  /** Item difficulty + topic per item_id, for the ceiling + per-topic
   *  rollups. The map can be sparse; missing items default to
   *  difficulty 2 and topic null. */
  itemDifficulty: ReadonlyMap<string, number>;
  itemTopic: ReadonlyMap<string, string | null>;
  /** Session start time (ISO). Used for the minutes/fatigue terms. */
  sessionStartedAt: string;
  /** Effective "now" — pulled from deps.now() so tests can pin time. */
  now: Date;
};

const FATIGUE_TURN_HALFLIFE = 40; // turns
const FATIGUE_MIN_HALFLIFE = 45; // minutes
const LATENCY_TREND_TOLERANCE_MS = 500;
const LENGTH_TREND_TOLERANCE = 3; // chars
const CEILING_FAST_LATENCY_MS = 8000;

export function computeRuntimeSignal(input: ComputeSignalInput): RuntimeSignal {
  // Pull tutor turns in chronological order — they carry the verdicts
  // that summarize each exchange.
  const tutorTurns = input.turns
    .filter((t) => t.role === 'tutor')
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Streaks: walk from the end, count consecutive matching verdicts.
  const consecutive_correct = trailingCount(tutorTurns, (v) => v === 'correct');
  const consecutive_wrong = trailingCount(tutorTurns, (v) => v === 'incorrect' || v === 'skipped');
  const consecutive_give_ups = trailingCount(tutorTurns, (v) => v === 'skipped');

  // Per-topic scaffolded correct: tutor turns where verdict='correct'
  // AND the same item had a prior wrong/skipped/partial turn earlier
  // in the session (i.e., the learner needed help on it). Counts by
  // the item's topic.
  const scaffolded_correct_by_topic: Record<string, number> = {};
  const itemPriorHelp = new Map<string, boolean>();
  for (const t of tutorTurns) {
    if (!t.item_id) continue;
    const prior = itemPriorHelp.get(t.item_id) ?? false;
    if (t.verdict === 'correct' && prior) {
      const topic = input.itemTopic.get(t.item_id) ?? null;
      const key = topic ?? '__no_topic__';
      scaffolded_correct_by_topic[key] = (scaffolded_correct_by_topic[key] ?? 0) + 1;
    }
    // Update for next loop: this item has now seen non-correct help.
    if (t.verdict === 'incorrect' || t.verdict === 'skipped' || t.verdict === 'partially_correct') {
      itemPriorHelp.set(t.item_id, true);
    }
  }

  // Latency: pair each learner turn with the following tutor turn,
  // measure the wall-clock delta. Rolling window of last 5 deltas.
  const deltas = pairLearnerToTutorLatencies(input.turns).slice(-5);
  const avg_response_latency_ms = deltas.length
    ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
    : 0;
  const latency_trend = computeTrend(
    deltas,
    LATENCY_TREND_TOLERANCE_MS,
    // For latency "growing average" means SLOWER — invert.
    (later, earlier) =>
      later > earlier + LATENCY_TREND_TOLERANCE_MS
        ? 'slower'
        : later < earlier - LATENCY_TREND_TOLERANCE_MS
          ? 'faster'
          : 'stable',
  );

  // Message length trend over the last 5 learner messages.
  const lengths = input.turns
    .filter((t) => t.role === 'learner' && typeof t.content_length === 'number')
    .map((t) => t.content_length as number)
    .slice(-5);
  const message_length_trend = computeTrend(lengths, LENGTH_TREND_TOLERANCE, (later, earlier) =>
    later > earlier + LENGTH_TREND_TOLERANCE
      ? 'growing'
      : later < earlier - LENGTH_TREND_TOLERANCE
        ? 'shrinking'
        : 'stable',
  );

  // Session arc.
  const turns_in_session = tutorTurns.length;
  const startMs = Date.parse(input.sessionStartedAt);
  const minutes_in_session = Number.isFinite(startMs)
    ? Math.max(0, Math.round((input.now.getTime() - startMs) / 60_000))
    : 0;

  // Fatigue: sigmoid on the SUM of normalized turn-count and minute-count.
  // half-life means the value reaches ~0.5 at FATIGUE_TURN_HALFLIFE turns
  // OR at FATIGUE_MIN_HALFLIFE minutes; both contribute.
  const fatigue_raw =
    turns_in_session / FATIGUE_TURN_HALFLIFE + minutes_in_session / FATIGUE_MIN_HALFLIFE;
  const fatigue = sigmoidLike(fatigue_raw);

  // Ceiling signal: fraction of last 5 tutor turns on difficulty>=3
  // items that are correct AND had a sub-CEILING_FAST_LATENCY_MS latency.
  const last5Tutor = tutorTurns.slice(-5);
  const lat5 = pairLearnerToTutorLatencies(input.turns).slice(-5);
  let ceilingHits = 0;
  let ceilingPossible = 0;
  for (let i = 0; i < last5Tutor.length; i++) {
    const t = last5Tutor[i]!;
    if (!t.item_id) continue;
    const diff = input.itemDifficulty.get(t.item_id) ?? 2;
    if (diff < 3) continue;
    ceilingPossible++;
    if (t.verdict === 'correct' && (lat5[i] ?? Infinity) < CEILING_FAST_LATENCY_MS) {
      ceilingHits++;
    }
  }
  const ceiling_signal = ceilingPossible > 0 ? ceilingHits / ceilingPossible : 0;

  // Aggregate emotional_temperature — DERIVED, no LLM, no labels in
  // the prompt unless the strategy selector explicitly asks for them.
  const emotional_temperature: RuntimeSignal['emotional_temperature'] = (() => {
    if (
      consecutive_wrong >= 3 &&
      (latency_trend === 'slower' || message_length_trend === 'shrinking')
    )
      return 'cratering';
    if (consecutive_wrong >= 2) return 'pressured';
    if (ceiling_signal >= 0.6 && consecutive_correct >= 2) return 'curious';
    if (consecutive_correct >= 2) return 'engaged';
    return 'flat';
  })();

  const cognitive_load: RuntimeSignal['cognitive_load'] = (() => {
    if (consecutive_wrong >= 3 || message_length_trend === 'shrinking') return 'high';
    if (consecutive_wrong >= 1) return 'medium';
    return 'low';
  })();

  return {
    consecutive_wrong,
    consecutive_give_ups,
    consecutive_correct,
    scaffolded_correct_by_topic,
    avg_response_latency_ms,
    latency_trend,
    message_length_trend,
    turns_in_session,
    minutes_in_session,
    fatigue,
    emotional_temperature,
    cognitive_load,
    ceiling_signal,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function trailingCount(
  tutorTurns: ReadonlyArray<SignalTurn>,
  pred: (v: SignalTurn['verdict']) => boolean,
): number {
  let n = 0;
  for (let i = tutorTurns.length - 1; i >= 0; i--) {
    if (pred(tutorTurns[i]!.verdict)) n++;
    else break;
  }
  return n;
}

function pairLearnerToTutorLatencies(turns: ReadonlyArray<SignalTurn>): number[] {
  // Walk chronological order, pair each learner with the immediately
  // following tutor turn, record the ms delta.
  const sorted = turns.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.role === 'learner' && b.role === 'tutor') {
      const dt = Date.parse(b.created_at) - Date.parse(a.created_at);
      if (Number.isFinite(dt) && dt >= 0) out.push(dt);
    }
  }
  return out;
}

function computeTrend<T extends string>(
  values: ReadonlyArray<number>,
  tolerance: number,
  compare: (later: number, earlier: number) => T,
): T | 'stable' {
  if (values.length < 2) return 'stable' as T | 'stable';
  // Compare the average of the most recent half to the average of the
  // older half. This is more robust than first-vs-last to a single noisy
  // data point.
  const mid = Math.floor(values.length / 2);
  const earlier = avg(values.slice(0, mid));
  const later = avg(values.slice(mid));
  if (Math.abs(later - earlier) <= tolerance) return 'stable' as T | 'stable';
  return compare(later, earlier);
}

function avg(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sigmoidLike(x: number): number {
  // Maps 0 → 0, 1 → ~0.5, 3 → ~0.86. Bounded in [0, 1).
  return 1 - 1 / (1 + x);
}

// ── Prompt rendering (L1-safe: observations, never labels) ──────────

/** Build the "Recent rhythm" block injected into SYSTEM_TUTOR. CRITICAL:
 *  emit observations, NOT labels. We say "last 5 turns: incorrect,
 *  incorrect, skipped, skipped, ?" — not "the student is frustrated".
 *  The model sees the data and forms its own pedagogical response; we
 *  don't invite first-person empathy by handing it a label. */
export function buildRecentRhythmFragment(
  signal: RuntimeSignal,
  recentVerdicts: ReadonlyArray<'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null>,
): string {
  const last5 = recentVerdicts.slice(-5).map((v) => v ?? '?');
  const parts = [
    '— Recent rhythm —',
    `Last ${last5.length || 0} tutor verdicts: ${last5.join(', ') || '(none yet)'}`,
    `Time in session: ${signal.minutes_in_session} minutes / ${signal.turns_in_session} tutor turns`,
    `Response latency trend (rolling 5): ${signal.latency_trend} (avg ~${signal.avg_response_latency_ms}ms)`,
    `Message length trend (last 5 learner turns): ${signal.message_length_trend}`,
  ];
  return parts.join('\n');
}
