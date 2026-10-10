// A session as the screen gets it (docs/architecture.md §Practice): its questions without any
// key she may not see yet, the thread, and what is offered around each question. Read after
// every change a request makes (`service.ts`, `setAside.ts`, `contest.ts`, the routes).

import { PracticeTurnView, type SessionView } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import type { StorageGateway } from '../../storage/gateway.js';
import { CARD_PASS, offersCardPass } from './cards.js';
import { DRILL_PASS } from './drill.js';
import { drillViewOf } from './drillView.js';
import { noSingleSolution } from './evaluate.js';
import { storedChoiceFigures, storedFigure } from './items.js';
import { listenRefs, listenTaskOf } from './listen.js';
import { hintOffered } from './ladder.js';
import { givesHints, offersHintButton, revealReady } from './modeRules.js';
import { passageViews } from './reading.js';
import { taskPartViews } from './taskParts.js';
import { readAloudAllowed } from './readAloud.js';
import type { ItemRow, SessionItemRow } from './service.js';
import { loadSession, stillPreparing } from './sessionRow.js';
import { summarize } from './summary.js';
import { tapChoicesFor } from './tapChoices.js';
import { timerOf } from './testClock.js';
import { whyOf } from './why.js';
import {
  imageOf,
  signImageUrls,
  subjectKindOf,
  surfaceFor,
  taskViewFor,
  tapsFigure,
  textIsBoard,
  tonesFor,
  type ItemImageRow,
} from './viewParts.js';

/**
 * The open question to show next: the first open one in order; in homework help a task set
 * aside ("Später") comes after the others, the one set aside longest ago first.
 */
function currentOpen<
  T extends { status: SessionItemRow['status']; position: number; deferred_at?: Date | null },
>(items: readonly T[]): T | undefined {
  const open = items.filter((i) => i.status === 'open');
  return [...open].sort((a, b) => {
    const da = a.deferred_at ? a.deferred_at.getTime() : null;
    const db = b.deferred_at ? b.deferred_at.getTime() : null;
    if (da === null || db === null) {
      if (da !== db) return da === null ? -1 : 1;
    } else if (da !== db) {
      return da - db;
    }
    return a.position - b.position;
  })[0];
}

export async function sessionView(
  db: Db,
  learnerId: string,
  sessionId: string,
  storage: StorageGateway,
  /** The app clock: it decides whether this run is still waiting for questions (issue #220). */
  now: Date,
): Promise<SessionView> {
  const s = await loadSession(db, learnerId, sessionId);
  const items = await db.query<
    SessionItemRow &
      ItemRow &
      ItemImageRow & { archived_at: Date | null; subject_kind: string | null }
  >(
    `select si.item_id, si.position, si.status, si.attempts, si.hints_used, si.prepared_hints_used,
            si.first_try_correct, si.flagged_at, si.deferred_at, si.answered_by, si.disputed_at,
            i.id, i.kind, i.prompt, i.answer, i.accepted_answers, i.unit, i.choices, i.correct_choice,
            i.topic, i.material_id, i.origin, i.lang, i.prompt_lang, i.figure, i.hints, i.worked_solution,
            i.bar_task, i.task, i.listen_task, i.staff_task, i.spelling, i.archived_at,
            i.choice_figures, i.read_passage, i.source_excerpt, i.tap, i.why, i.task_part,
            mi.storage_path as image_path, mi.width as image_width, mi.height as image_height,
            mi.label as image_label, sub.kind as subject_kind
       from session_items si join items i on i.id = si.item_id
       left join material_images mi on mi.id = i.image_id
       left join subjects sub on sub.id = i.subject_id
      where si.session_id = $1 order by si.position`,
    [sessionId],
  );
  const imageUrls = await signImageUrls(storage, items);
  const turns = await db.query<{
    id: string;
    item_id: string | null;
    role: 'learner' | 'tutor';
    text: string;
    verdict: PracticeTurnView['verdict'];
    pronunciation: PracticeTurnView['pronunciation'];
    reexplain: PracticeTurnView['reexplain'];
    /** „Merk ich mir für nachher" on a tutor turn (#391, migration 0090). */
    later: PracticeTurnView['later'];
    /** A long text's feedback as stored (#258): read through the contract, never trusted. */
    essay: unknown;
    /** An explanation's picture as stored (#298): read like a question's figure. */
    figure: unknown;
    created_at: Date;
  }>(
    `select id, item_id, role, text, verdict, pronunciation, reexplain, later, essay_feedback as essay,
            figure, created_at
       from practice_turns
      where session_id = $1 order by seq`,
    [sessionId],
  );
  const title = await db.maybeOne<{ title: string }>(
    `select coalesce(ps.title, g.title, st.title) as title from practice_sessions ps
       left join buddy_goals g on g.id = ps.goal_id left join buddy_steps st on st.id = ps.step_id
      where ps.id = $1`,
    [sessionId],
  );
  const current = currentOpen(items);
  /** The questions she already tapped a reason for (`why.ts`): one tap each. */
  const whyAsked = new Set(
    turns.filter((tr) => tr.reexplain === 'why' && tr.role === 'learner').map((tr) => tr.item_id),
  );
  const active = s.status === 'active';
  // A flashcard pass (issue #147): nothing in it is checked, so it offers no hint and no
  // "Lösung zeigen", nothing to tap, and every card carries its own back — see cards.ts.
  const cardPass = s.pass === CARD_PASS;
  // Her own words from this very set, so tapping never offers one she has not met
  // (issue #147). Computed here, not stored: the key stays the typed answer. Her app
  // language decides whether tapping is offered at all — recognising, not producing.
  const own = await db.one<{ locale: string }>(`select locale from learners where id = $1`, [
    learnerId,
  ]);
  const vocabInSet = items
    .filter((i) => i.kind === 'vocab')
    .map((i) => ({ id: i.id, answer: i.answer, lang: i.lang }));
  // Which recording each listening question is about ('h1', 'h2' …): questions about one text
  // share the alias, which is all the app can be told about a text it must not see (issue #210).
  const hearing = listenRefs(items);
  // Homework never shows the solution; a test shows the answers once it is finished.
  const revealAllowed = s.mode !== 'help' && !(s.mode === 'test' && active);
  // A finished test shows every solution, also of the questions she never got to (audit M-36).
  const testOver = s.mode === 'test' && s.status === 'finished';
  /**
   * Whether this question's solution may be sent — and with it, for a listening question, the
   * words of the text it was heard from (issue #210). One condition for both, so a text can
   * never arrive a moment before the answer it belongs to.
   */
  const solutionShown = (i: { status: string; kind: string }): boolean =>
    cardPass || !((i.status === 'open' && !testOver) || !revealAllowed || noSingleSolution(i));
  // The text of each reading question (issue #233); where its answer stands, once that is shown.
  const reading = passageViews(items, solutionShown);
  // The situation and letter of each part of a task in parts (issue #297).
  const parts = taskPartViews(items);
  /**
   * The parts of a structured question (issues #228–#230), without the key, for as long as the
   * question is open — like the fraction bar, and for the same reason: once it is closed the parts
   * would be a control with nothing left to do, and her answer and the solution both stand in the
   * thread.
   */
  /** "Tipp" works for this question now: a prepared hint at once, else the tutor writes one. */
  const hintWorks = (i: (typeof items)[number]) =>
    i.status === 'open' &&
    active &&
    !cardPass &&
    offersHintButton(s.mode) &&
    i.kind !== 'speak' &&
    // Listening: the help is hearing it again, and slower — which the card offers anyway
    // (issue #210). A written hint about a text she is supposed to be listening to is a
    // worse version of the replay, and it would be one more model call.
    !hearing.has(i.id);
  const boardOf = (i: (typeof items)[number]) =>
    i.status === 'open' && active ? taskViewFor(i) : null;
  return {
    id: s.id,
    mode: s.mode,
    reveal_allowed: revealAllowed,
    status: s.status,
    // The rest of the questions is still being written (issue #220). The app shows no total
    // that would still change, and does not read "no open question" as "this run is over".
    preparing: active && stillPreparing(s, now),
    timer: timerOf(s, now),
    title: title?.title ?? '',
    items: items.map((i) => ({
      item: {
        id: i.id,
        kind: i.kind,
        prompt: i.prompt,
        choices: i.choices,
        // The options' pictures: data the app draws, never the key (that is the index) — read
        // back through the checks they were written under, or not sent at all (issue #326).
        choice_figures: storedChoiceFigures(i),
        unit: i.unit,
        topic: i.topic,
        origin: i.origin,
        lang: i.lang,
        prompt_lang: i.prompt_lang,
        // Which keys the answer field offers is the app's choice, made from this (issue #239).
        subject_kind: subjectKindOf(i.subject_kind),
        figure: storedFigure(i.figure),
        image: imageOf(i, imageUrls),
        // A test asks her to produce, so nothing is offered to tap there — and a card has
        // nothing to tap at all: it turns over (issue #147).
        tap_choices:
          s.mode === 'test' || cardPass ? null : tapChoicesFor(i, vocabInSet, own.locale),
        // The fraction bar she works with, derived from the task the question was computed
        // from (issue #162). Only while the question is open: once it is closed the bars
        // would be a control without a purpose, and the solution stands in the thread.
        surface: i.status === 'open' && active ? surfaceFor(i.bar_task, i.staff_task) : null,
        // A figure she taps a place in (issue #248), for the same span as the bar: read back
        // through the check it was written under, or typed like any other question.
        tap: i.status === 'open' && active && !cardPass && tapsFigure(i),
        // The parts of a structured question, while it is open (`boardOf`).
        task_view: boardOf(i),
        // The spoken stimulus, as the alias of its recording and nothing more (issue #210).
        // It stays while the question is closed: hearing the text again next to the words of
        // it is exactly what a listening task is reviewed with.
        listen: hearing.has(i.id) ? { ref: hearing.get(i.id)! } : null,
        // The tones of an ear-training question (issue #445), computed from the reviewed task like
        // its key. They stay while it is closed, like a listening text: hearing it again next to
        // the solution is how it is reviewed.
        tones: tonesFor(i.staff_task),
        // The text she reads it from, above the question while she answers (issue #233) — except
        // where she answers IN the text, a Belegstelle (#368): its board is the text, once.
        passage: textIsBoard(boardOf(i)) ? null : (reading.get(i.id) ?? null),
        task_part: parts.get(i.id) ?? null,
        // Vorlesen (issue #238): code decides, from what the question is, whether hearing it
        // would hand over the solution — the same rule for a card's front and a Kopfrechnen task
        // (issue #434), which are read like any question.
        read_aloud: readAloudAllowed(i),
      },
      status: i.status,
      attempts: i.attempts,
      hints_used: i.hints_used,
      hints_left:
        i.status === 'open' && active && !cardPass && givesHints(s.mode)
          ? Math.max(0, i.hints.length - i.prepared_hints_used)
          : 0,
      hint_available: hintWorks(i),
      // Only where "Tipp" works, and only in practice: homework has no ladder (#388 §5.5).
      hint_offered: hintWorks(i) && givesHints(s.mode) && hintOffered(i),
      reveal_available: i.status === 'open' && active && !cardPass && revealReady(s.mode, i),
      deferred: i.status === 'open' && s.mode === 'help' && Boolean(i.deferred_at),
      // Never leak the solution of an open question, nor ever in help mode (homework) — and
      // never for a free text, which has none to send (issue #197): the key is a sketch the
      // model wrote, and the screen would label it "Lösung".
      // A card carries its back while it is still open: showing it IS the pass, and there is
      // nothing to grade that it could give away (issue #147). Everywhere else unchanged.
      answer: !solutionShown(i)
        ? null
        : i.kind === 'multiple_choice' && i.choices && i.correct_choice !== null
          ? (i.choices[i.correct_choice] ?? i.answer)
          : `${i.answer}${i.unit ? ` ${i.unit}` : ''}`,
      // The words of a listening text, under exactly the condition the solution is sent under
      // (issue #210): she hears it, answers, and reads it afterwards. While the question is
      // open the text is the solution, so it stays here.
      // A Diktat's recording IS its key (issue #242): the solution above already says it, so it is
      // not repeated as a "what you heard" text.
      listen_transcript:
        solutionShown(i) && i.kind !== 'spelling_dictation'
          ? (listenTaskOf(i.listen_task)?.text ?? null)
          : null,
      // The worked solution, under the same condition (#388 §3.2: the test's review explains).
      explanation: solutionShown(i) ? i.worked_solution : null,
      // „Warum stimmt das?" (#388): once closed with its solution out, until she tapped a reason.
      // The index of the true one stays here: code judges her tap (`why.ts`).
      why:
        i.status !== 'open' && solutionShown(i) && !whyAsked.has(i.id)
          ? (whyOf(i.why)?.reasons ?? null)
          : null,
    })),
    turns: turns.map(({ created_at, essay, figure, ...tr }) => ({
      ...tr,
      essay: PracticeTurnView.shape.essay.parse(essay),
      figure: storedFigure(figure),
      created_at: created_at.toISOString(),
    })),
    current_item_id: active ? (current?.id ?? null) : null,
    summary: s.status === 'finished' ? summarize(items) : null,
    card_pass: cardPass,
    // Whether this finished run has words to go through as cards. One rule, in cards.ts, so
    // the offer on the result screen and what the pass then holds can never disagree.
    card_pass_offered: offersCardPass(s, items),
    // A Kopfrechnen round (issue #243): the range, the pad, the task just answered, the line.
    drill: s.pass === DRILL_PASS ? await drillViewOf(db, s) : null,
  };
}
