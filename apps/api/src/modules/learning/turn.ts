// The learning domain's hooks in a conversation turn (issue #107, cut 5; buddy/turn.ts): a
// running roleplay answers her message in the role, the passages of her sheets are looked up the
// moment she writes, a reply that gives away her open homework's solution is refused, an offer is
// prepared while she reads it, and a held-back message ends the scene.

import type { RoleplayFeedback } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { t } from '../../i18n/index.js';
import { localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import { applyDecision } from '../buddy/apply.js';
import { noAliases } from '../buddy/context.js';
import { repairMessage, schemaErrors } from '../buddy/prompts.js';
import type { ModeRound, TurnMode } from '../buddy/provider.js';
import {
  activeRoleplay,
  feedbackText,
  languageName,
  ROLEPLAY_PROMPT_VERSION,
  ROLEPLAY_SYSTEM,
  ROLEPLAY_TURN_SCHEMA,
  roleplayContents,
  roleplayFrame,
  roleplayMessages,
  roleplayScene,
  RoleplayTurnForModel,
  writeFeedback,
  type RoleplayRow,
  type RoleplayStep,
} from '../buddy/roleplay.js';
import {
  callFailed,
  concernText,
  currentOutcome,
  failTurn,
  holdClaim,
  turnDialogue,
  turnErrorCode,
  turnRecord,
  type ClaimedMessage,
  type TurnLearner,
} from '../buddy/turn.js';
import { homeworkSolved, mentionsSolution } from '../practice/tutor.js';

/**
 * One in-role turn of a running roleplay (issue #244). Same ownership, fence, failure codes and
 * audit as any turn — what differs is what the model sees (the stored frame and the scene's own
 * lines, `roleplay.ts`), what it may answer (a line, no tools) and what code decides from it:
 *
 *   concern            → the fixed caring reply, the roleplay ends without feedback;
 *   leave              → it ends; with turns played, the checked feedback follows;
 *   another language   → the app's own hint, the turn is not counted;
 *   otherwise          → the role's line; the turn counts, and the last allowed one ends it
 *                        with the feedback in the same transaction.
 *
 * Not streamed: whether the model's words are shown at all is decided by code after the whole
 * answer (the language hint replaces them), so nothing is shown that could be withdrawn.
 */
async function roleplayRound(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  play: RoleplayRow,
  at: Parameters<TurnMode>[3],
): Promise<ModeRound> {
  const today = localParts(at.now, at.timezone).date;
  const rows = await roleplayMessages(deps.db, play);
  const { dialogue, learnerWords } = turnDialogue(rows, message.id, learner.locale);
  const { meta, record } = turnRecord(deps, learner.id, message.id, {
    contextVersion: at.contextVersion,
    attempt: at.attempt,
    promptVersion: ROLEPLAY_PROMPT_VERSION,
    triggers: [{ message_id: message.id, roleplay_id: play.id }],
  });

  let raw: unknown;
  try {
    if (!(await holdClaim(deps, message)))
      return { kind: 'outcome', outcome: await currentOutcome(deps, message.id) };
    const result = await callModel(deps, learner.id, today, {
      purpose: 'buddy_turn',
      tier: 'smart',
      promptVersion: ROLEPLAY_PROMPT_VERSION,
      system: ROLEPLAY_SYSTEM,
      contents: roleplayContents(
        roleplayFrame(play, learner),
        dialogue,
        at.repairErrors ? repairMessage(at.repairErrors) : undefined,
      ),
      schema: ROLEPLAY_TURN_SCHEMA,
      maxOutputTokens: 1024,
      temperature: 0.6,
      timeoutMs: 30_000,
      thinkingBudget: 256,
    });
    meta.model = result.usage.model;
    raw = result.json;
  } catch (err) {
    return { kind: 'outcome', outcome: await callFailed(deps, learner, message, record, err) };
  }
  meta.output = raw;

  const parsed = RoleplayTurnForModel.safeParse(raw);
  if (!parsed.success) {
    const errors = schemaErrors(parsed.error);
    await record('rejected', errors);
    return { kind: 'repair', errors };
  }
  const d = parsed.data;
  const inLanguage = d.her_language === play.language || d.her_language === 'other';
  if (!d.concern && !d.leave && inLanguage && d.reply.trim().length === 0) {
    const errors = ['reply: write your next line in the role (empty only for concern or leave)'];
    await record('rejected', errors);
    return { kind: 'repair', errors };
  }

  // What code makes of it. The model's own words are shown only for a counted line in the role.
  let reply: { text: string; options: null } | null;
  let step: RoleplayStep;
  const base = { id: play.id, expectTurns: play.turns, feedback: null, closing: null };
  if (d.concern) {
    reply = { text: concernText(learner, d.also_asked), options: null };
    step = { ...base, count: false, end: 'concern' };
  } else if (d.leave) {
    reply = null;
    step = { ...base, count: false, end: 'her' };
  } else if (!inLanguage) {
    reply = {
      text: t(learner.locale, 'roleplay.try_in', {
        language: languageName(play.language, learner.locale),
      }),
      options: null,
    };
    step = { ...base, count: false, end: null };
  } else {
    reply = { text: d.reply, options: null };
    step = { ...base, count: true, end: play.turns + 1 >= play.max_turns ? 'turns' : null };
  }

  if (step.end === 'her' || step.end === 'turns') {
    const played = play.turns + (step.count ? 1 : 0);
    let feedback: RoleplayFeedback | null = null;
    if (played > 0) {
      try {
        // Her words of this turn are hers to be quoted, when they were a line in the scene.
        feedback = await writeFeedback(
          deps,
          learner.id,
          today,
          play,
          learner,
          rows.filter((r) => step.count || r.id !== message.id),
          learner.locale,
          step.count ? learnerWords : [],
        );
      } catch (err) {
        const code = turnErrorCode(err);
        await record('failed', [`feedback:${code}`]);
        return { kind: 'outcome', outcome: await failTurn(deps, message, code) };
      }
    }
    step = {
      ...step,
      feedback,
      closing: feedback
        ? feedbackText(learner.locale, feedback)
        : t(learner.locale, 'roleplay.ended'),
    };
  }

  const result = await applyDecision(deps.db, {
    learnerId: learner.id,
    locale: learner.locale,
    contextVersion: at.contextVersion,
    // A scene has no tools, so it resolves no aliases.
    aliases: noAliases(),
    now: at.now,
    reference: at.now,
    learnerWords,
    concern: d.concern,
    triggerMessageId: message.id,
    messageClaim: { id: message.id, token: message.claim_token },
    actions: [],
    reply,
    outreach: null,
    scene: roleplayScene(learner.id, step),
    meta,
  });
  if (result.status === 'applied')
    return { kind: 'outcome', outcome: { status: 'done', errorCode: null } };
  if (result.status === 'superseded')
    return { kind: 'outcome', outcome: await currentOutcome(deps, message.id) };
  if (result.status === 'rejected') return { kind: 'repair', errors: result.errors };
  return { kind: 'stale' };
}

/** The roleplay running for her as the turn's mode, or null (provider.ts `turn.mode`). */
export async function roleplayMode(db: Db, learnerId: string, now: Date): Promise<TurnMode | null> {
  const play = await activeRoleplay(db, learnerId, now);
  return play
    ? (deps, learner, message, at) => roleplayRound(deps, learner, message, play, at)
    : null;
}

/**
 * While she has homework open in a help session, a chat reply that states the solution of
 * an open task is refused — unless she wrote that solution herself (then Buddy may confirm).
 */
export async function homeworkLeak(
  deps: Deps,
  learnerId: string,
  reply: string,
  learnerWords: readonly string[],
): Promise<string[]> {
  const open = await deps.db.query<{
    prompt: string;
    answer: string;
    accepted_answers: string[];
    unit: string | null;
    tolerance: number | null;
  }>(
    `select i.prompt, i.answer, i.accepted_answers, i.unit, i.tolerance
       from practice_sessions ps
       join session_items si on si.session_id = ps.id and si.status = 'open'
       join items i on i.id = si.item_id
      where ps.learner_id = $1 and ps.mode = 'help' and ps.status = 'active'`,
    [learnerId],
  );
  const hers = learnerWords.join('\n');
  // Every key of the task, not only the first (#227 B7): an accepted answer given away is the
  // solution given away.
  return open.some(
    (i) =>
      !homeworkSolved(i, hers) &&
      [i.answer, ...i.accepted_answers].some((k) => mentionsSolution(reply, k, i.prompt)),
  )
    ? [
        'reply: it gives away the solution of her open homework task. Help her find it herself (a question, a first step) — never the result.',
      ]
    : [];
}
