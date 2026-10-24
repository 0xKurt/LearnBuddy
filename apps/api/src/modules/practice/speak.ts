// Acoustic evidence is aligned and graded in shared code; a text-only call phrases the tip.
// Local submissions contain no recording. Online fallback hears audio through the gateway.
import type {
  AnswerResponse,
  PronunciationFeedback,
  SpeakRequest,
  SpeakStreamEvent,
  SpeakWordRequest,
  SpeakWordResponse,
} from '@learnbuddy/shared-types/contracts';
import { pronunciationKey, PronunciationPlan } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError, isAppError } from '../../lib/errors.js';
import type { Db } from '../../lib/db.js';
import { t } from '../../i18n/index.js';
import { safeguardingText } from '../../i18n/safeguarding.js';
import { distressCheck, saysMoreThan } from '../buddy/distress.js';
import { LlmError } from '../../llm/gateway.js';
import { isMinor } from '../identity/model.js';
import { reviewItem } from './fsrs.js';
import { settleTurn, replayTurn, touchRun, type PracticeLearner } from './service.js';
import { checkTake, pronunciationTips } from './pronunciation.js';
import { bumpContext } from '../buddy/plan.js';

export { SYSTEM, JUDGEMENT_SCHEMA, PRONOUNCE_PROMPT_VERSION } from './pronunciation.js';
// The same evidence contract checks a single word and a sentence.
export { SYSTEM as WORD_SYSTEM, JUDGEMENT_SCHEMA as WORD_SCHEMA } from './pronunciation.js';

type SpeakItem = {
  pronunciation_plan: unknown;
  id: string;
  kind: string;
  prompt: string;
  lang: string | null;
  status: 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';
  attempts: number;
  hints_used: number;
  first_try_correct: boolean | null;
};

/**
 * Her spoken question and session mode. Grading requires an active session; stateless word
 * rehearsal also permits a finished one (#570). Both reject abandoned sessions, missing learner
 * ownership, a question outside the session, or a question that is not spoken.
 */
async function spokenItem(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  itemId: string,
  wordRehearsal = false,
): Promise<{ mode: string; item: SpeakItem & { lang: string } }> {
  const session = await deps.db.maybeOne<{ status: string; mode: string }>(
    `select status, mode from practice_sessions where id = $1 and learner_id = $2`,
    [sessionId, learnerId],
  );
  if (!session) throw new AppError('not_found', 'Session not found');
  if (session.status !== 'active' && !(wordRehearsal && session.status === 'finished'))
    throw new AppError('conflict', 'Session has ended');
  const item = await deps.db.maybeOne<SpeakItem>(
    `select i.id, i.kind, i.prompt, i.lang, i.pronunciation_plan, si.status, si.attempts, si.hints_used, si.first_try_correct
       from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and si.item_id = $2`,
    [sessionId, itemId],
  );
  if (!item) throw new AppError('not_found', 'Question not in this session');
  if (item.kind !== 'speak' || !item.lang)
    throw new AppError('conflict', 'This question is not spoken', { reason: 'not_speak' });
  return { mode: session.mode, item: { ...item, lang: item.lang } };
}

/**
 * The judgements running in this instance, by her turn (#684): a recording sent again after its
 * stream dropped joins the run still going instead of paying the model a second time. Across
 * instances the unique turn index still keeps one result.
 */
const running = new Map<string, { result: Promise<AnswerResponse>; signal?: AbortSignal }>();

const cancelled = (err: unknown) => err instanceof LlmError && err.kind === 'cancelled';

export async function speakItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: SpeakRequest,
  /** Called while the model writes its judgement (SSE); absent for the plain JSON call. */
  onProgress?: (event: SpeakStreamEvent) => void,
  /** The stream's: aborted when she is gone, and the model call with it (#684). */
  signal?: AbortSignal,
): Promise<AnswerResponse> {
  const replayed = await replayTurn(deps, learner.id, sessionId, input.client_turn_id);
  if (replayed) return replayed;
  const key = `${learner.id}:${sessionId}:${input.client_turn_id}`;
  const other = running.get(key);
  if (other && !other.signal?.aborted) {
    try {
      return await other.result;
    } catch (err) {
      // That run was stopped with its stream: this one judges her recording itself.
      if (!cancelled(err)) throw err;
    }
  }
  const result = judgeSpoken(deps, learner, sessionId, input, onProgress, signal);
  running.set(key, { result, ...(signal ? { signal } : {}) });
  try {
    return await result;
  } finally {
    if (running.get(key)?.result === result) running.delete(key);
  }
}

async function judgeSpoken(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: SpeakRequest,
  onProgress: ((event: SpeakStreamEvent) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<AnswerResponse> {
  const now = deps.now();
  const { mode, item } = await spokenItem(deps, learner.id, sessionId, input.item_id);
  if (item.status !== 'open') throw new AppError('conflict', 'This question is already closed');
  const context = await deps.db.one<{ context_version: number }>(
    'select context_version from buddy_settings where learner_id = $1',
    [learner.id],
  );

  let checked: Awaited<ReturnType<typeof checkTake>>;
  try {
    checked = await checkTake(deps, learner, item, input, signal);
  } catch (err) {
    if (isAppError(err)) throw err;
    // Stopped with its stream (#684): nobody reads this run's answer; a joined resend runs again.
    if (cancelled(err)) throw err;
    // The provider's filter held back what she said: the fixed answer, as in every free text (#765).
    if (err instanceof LlmError && err.kind === 'blocked') {
      return helpTake(deps, learner, sessionId, item.id, input.client_turn_id, 'blocked', '');
    }
    throw new AppError('model_unavailable', 'Could not listen right now');
  }

  // What she said is read for distress when it holds a word the sentence does not (#765): it is
  // her own words, like a written answer (CLAUDE.md rule 18). The judge has no concern bit.
  const said = checked.evidence.heard;
  const found = saysMoreThan(said, [item.prompt])
    ? await distressCheck(deps, learner.id, said, { question: item.prompt })
    : 'clear';
  if (found === 'concern' || found === 'blocked') {
    return helpTake(deps, learner, sessionId, item.id, input.client_turn_id, found, said);
  }

  const breakdown = checked.result;
  // An uncertain take is feedback only: it cannot cost a try or close the item.
  const uncertain = breakdown.overall === 'unsicher';
  const overall =
    breakdown.overall === 'passt' ? 'good' : breakdown.overall === 'fast' ? 'almost' : 'retry';
  onProgress?.({
    heard: said,
    words: breakdown.words.map((w) => ({
      text: w.expected,
      ok: w.verdict === 'passt',
      verdict: w.verdict,
    })),
  });
  const tips = await pronunciationTips(deps, learner, breakdown, signal);
  const feedback: PronunciationFeedback = {
    heard: said,
    overall,
    breakdown,
    words: breakdown.words.map((w, i) => ({
      text: w.expected,
      ok: w.verdict === 'passt',
      tip: w.verdict === 'passt' || w.verdict === 'unsicher' ? null : (tips?.tips[i] ?? null),
    })),
  };
  const verdict = uncertain
    ? 'not_an_attempt'
    : overall === 'good'
      ? 'correct'
      : overall === 'almost'
        ? 'partially_correct'
        : 'incorrect';
  const closes = !uncertain && overall !== 'retry';
  const plain = tips?.reply ?? t(learner.locale, `practice.pronunciation_${breakdown.overall}`);
  // No check could read her words: the fixed help line follows the reply (#747, #765).
  const reply =
    found === 'unchecked'
      ? `${plain} ${safeguardingText(learner.locale, isMinor(learner, now), 'unchecked')}`
      : plain;

  return settleTurn(deps, learner.id, sessionId, item.id, input.client_turn_id, verdict, () =>
    deps.db.tx(async (tx) => {
      const seq = await nextTurnIn(tx, learner.id, sessionId);
      const current = await tx.one<{ context_version: number }>(
        'select context_version from buddy_settings where learner_id = $1 for update',
        [learner.id],
      );
      if (current.context_version !== context.context_version)
        throw new AppError('stale', 'Practice context changed while checking pronunciation');
      const si = await tx.one<{ status: string; attempts: number; hints_used: number }>(
        `select status, attempts, hints_used from session_items where session_id = $1 and item_id = $2 for update`,
        [sessionId, item.id],
      );
      if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, $6, 'rule', $7)`,
        [
          sessionId,
          learner.id,
          item.id,
          seq,
          `🎤 ${feedback.heard || '…'}`,
          verdict,
          input.client_turn_id,
        ],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, pronunciation)
         values ($1, $2, $3, $4, 'tutor', $5, $6)`,
        [sessionId, learner.id, item.id, seq + 1, reply, JSON.stringify(feedback)],
      );
      const firstTry = si.attempts === 0 && overall === 'good';
      if (!uncertain)
        await tx.query(
          `update session_items set attempts = attempts + 1,
                                  status = case when $3 then 'correct' else status end,
                                  first_try_correct = case when $3 then $4 else first_try_correct end,
                                  closed_at = case when $3 then $5::timestamptz else closed_at end
          where session_id = $1 and item_id = $2`,
          [sessionId, item.id, closes, firstTry, now],
        );
      if (closes && mode !== 'test' && mode !== 'help') {
        await reviewItem(
          tx,
          learner.id,
          sessionId,
          item.id,
          firstTry ? 'first_try' : 'with_help',
          now,
        );
      }
      await touchRun(tx, learner.id, sessionId, now);
      await bumpContext(tx, learner.id);
    }),
  );
}

/**
 * The next turn's number in a run that is still active. The model call took seconds: "Beenden" may
 * have finished the session meanwhile. The session row is locked first (the same order as
 * finishSession), so a take commits into an active session or not at all (audit M-34).
 */
async function nextTurnIn(tx: Db, learnerId: string, sessionId: string): Promise<number> {
  const current = await tx.one<{ status: string }>(
    `select status from practice_sessions where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (current.status !== 'active') throw new AppError('conflict', 'Session has ended');
  const last = await tx.one<{ n: number }>(
    `select coalesce(max(seq), 0)::int as n from practice_turns where session_id = $1`,
    [sessionId],
  );
  return last.n + 1;
}

/**
 * A take that told of danger, or that the provider's filter held back (#765): her words stay in
 * her turns, the reply is the app's fixed help answer by age, and nothing is judged — no try, no
 * pronunciation feedback, the sentence stays open.
 */
async function helpTake(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  itemId: string,
  clientTurnId: string,
  kind: 'concern' | 'blocked',
  said: string,
): Promise<AnswerResponse> {
  const now = deps.now();
  const reply = safeguardingText(learner.locale, isMinor(learner, now), kind);
  return settleTurn(deps, learner.id, sessionId, itemId, clientTurnId, 'not_an_attempt', () =>
    deps.db.tx(async (tx) => {
      const seq = await nextTurnIn(tx, learner.id, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', 'rule', $6)`,
        [sessionId, learner.id, itemId, seq, `🎤 ${said || '…'}`, clientTurnId],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text)
         values ($1, $2, $3, $4, 'tutor', $5)`,
        [sessionId, learner.id, itemId, seq + 1, reply],
      );
      await touchRun(tx, learner.id, sessionId, now);
    }),
  );
}

// ─────────────── one word, on its own (issue #83) ───────────────

export async function speakWord(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: SpeakWordRequest,
): Promise<SpeakWordResponse> {
  const now = deps.now();
  const { item } = await spokenItem(deps, learner.id, sessionId, input.item_id, true);
  // Only a word of this sentence: nothing else is practised here.
  const inSentence = item.prompt
    .split(/[^\p{L}\p{M}'’-]+/u)
    .some((w) => w.localeCompare(input.word, undefined, { sensitivity: 'base' }) === 0);
  if (!inSentence)
    throw new AppError('invalid_input', 'That word is not in this sentence', {
      reason: 'word_not_in_sentence',
    });

  const minor = isMinor(learner, now);
  /** The fixed help answer in place of a judgement: nothing judged, her words not shown back. */
  const helpAlone = (kind: 'concern' | 'blocked'): SpeakWordResponse => ({
    audible: false,
    ok: false,
    heard: '',
    tip: null,
    help: safeguardingText(learner.locale, minor, kind),
  });
  const wordPlan = PronunciationPlan.safeParse(item.pronunciation_plan);
  const target =
    wordPlan.success && wordPlan.data.language === item.lang
      ? wordPlan.data.words.find(
          (w) => pronunciationKey(w.expected) === pronunciationKey(input.word),
        )
      : undefined;
  let checked: Awaited<ReturnType<typeof checkTake>>;
  try {
    checked = await checkTake(
      deps,
      learner,
      {
        ...item,
        prompt: input.word,
        pronunciation_plan: target
          ? { version: 1, language: item.lang, words: [{ ...target, expected: input.word }] }
          : null,
      },
      input,
    );
  } catch (err) {
    if (isAppError(err)) throw err;
    // The provider's filter held back what she said: the fixed answer, as for the sentence (#785).
    if (err instanceof LlmError && err.kind === 'blocked') return helpAlone('blocked');
    throw new AppError('model_unavailable', 'Could not listen right now');
  }

  // Her words are shown back on her screen, so they are read for distress like a sentence take
  // when they hold a word the sentence does not (#785, CLAUDE.md rule 18). Nothing is stored.
  const heard = checked.evidence.heard;
  const found = saysMoreThan(heard, [item.prompt])
    ? await distressCheck(deps, learner.id, heard, { question: item.prompt })
    : 'clear';
  if (found === 'concern' || found === 'blocked') return helpAlone(found);
  const word = checked.result.words[0]!;
  const tips =
    word.verdict === 'unsicher' ? null : await pronunciationTips(deps, learner, checked.result);
  return {
    audible: word.verdict !== 'unsicher',
    ok: word.verdict === 'passt',
    heard,
    tip: word.verdict === 'passt' || word.verdict === 'unsicher' ? null : (tips?.tips[0] ?? null),
    help: found === 'unchecked' ? safeguardingText(learner.locale, minor, 'unchecked') : null,
  };
}
