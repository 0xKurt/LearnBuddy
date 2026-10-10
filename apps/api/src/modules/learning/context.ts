// What the learning domain writes into STATE (issue #107, cut 5): her level as a school year, her
// subjects (f1…) and sheets (sh1…), the material of a goal, what a practice or talk step holds,
// and three sections of its own — material and progress, what she is working on and practised,
// and what is already waiting for her. The core (buddy/context.ts) numbers its own aliases, places
// these sections in its cache order and renders everything else; every line here keeps its text
// exactly (pinned by buddy/__tests__/prompt-pin.test.ts).

import { localParts } from '../../lib/time.js';
import { blockStrings } from '../buddy/blocks.js';
import type { Aliases, LearnerFacts } from '../buddy/context.js';
import { likelyGrade } from '../buddy/grade.js';
import type { SectionSpec, StateRender } from '../buddy/provider.js';
import { recallText } from '../buddy/recall.js';
import type { BuddyState, GoalRow, StepRow } from '../buddy/state.js';
import type { MaterialTarget, SubjectRow } from './state.js';

declare module '../buddy/context.js' {
  interface DomainAliases {
    subjects: Map<string, SubjectRow>;
    /**
     * Her sheets, so Buddy can name one to practise from, rename or delete (issues #111,
     * #153). STATE fills it with the ten newest; `search_material` adds what it finds
     * beyond them, for this turn only.
     */
    materials: Map<string, MaterialTarget>;
  }
}

/** Its sections in cache order, and what each puts in front of the model (blocks.ts, #168). */
export const LEARNING_SECTIONS: readonly SectionSpec[] = [
  {
    // New sheets and practice results; the topic buckets turn over when spaced repetition
    // makes something due, not every turn.
    name: 'material',
    place: 'before_goals',
    quotable: true,
    data: (state) =>
      blockStrings([
        ...state.subjects.map((s) => s.name),
        ...state.topics.map((t) => t.topic),
        ...state.materials.map((m) => m.title),
      ]),
  },
  {
    // A finished practice rewrites it; volatile in an active session.
    name: 'practice',
    place: 'after_goals',
    quotable: true,
    data: (state) =>
      blockStrings([
        state.focus?.material_title,
        state.focus?.subject_name,
        state.focus?.goal_title,
        state.focus?.said,
        // Three sessions, and only their shaky topics: that is what is printed of a session —
        // the secure ones travel in the material block, not here.
        ...state.sessions.slice(0, 3).flatMap((s) => s.shaky_topics),
        // Her questions kept for after practice (issue #391), as they are printed.
        ...state.later
          .filter((n) => n.recall_block === null)
          .flatMap((n) => [n.text, n.session_title]),
      ]),
  },
  {
    // An offer or a prepared practice appears the moment Buddy makes one and disappears the
    // moment she starts it: as volatile as a turn can be.
    name: 'waiting',
    place: 'after_goals',
    quotable: true,
    data: (state) =>
      blockStrings([
        ...state.standing.map((o) => o.text),
        ...preparedSteps(state).map((s) => s.title),
      ]),
  },
];

/** A practice he prepared that she can start with one tap. */
function preparedSteps(state: BuddyState): StepRow[] {
  return state.steps.filter(
    (s) => s.kind === 'practice' && s.state === 'prepared' && (s.payload.item_ids?.length ?? 0) > 0,
  );
}

/**
 * Her level, read as a school year where she is at school. A school learner whose year is
 * unknown: her age gives a likely one, so the question can be a single tap on a suggestion
 * instead of an open question left standing in the thread (issue #208). The number is never
 * stored from here — only her answer writes it.
 */
export function levelOf(learner: LearnerFacts, today: string): string {
  const likely =
    learner.level === 'school' && learner.grade === null
      ? likelyGrade(learner.birth_date, today)
      : null;
  return learner.level === 'school'
    ? learner.grade !== null
      ? `school, grade ${learner.grade}`
      : likely !== null
        ? `school, grade unknown — from her age probably ${likely}: ask that as one short yes/no, never as an open question and never in the same turn as an offer`
        : 'school, grade unknown (ask when it matters for the next step)'
    : learner.level === 'unknown'
      ? 'unknown (ask when it matters for the next step)'
      : learner.level;
}

/**
 * What a failed sheet means for her next step (modules/materials/submit.ts): a second
 * reading is possible after an unreadable photo, a failed run and an exhausted daily budget,
 * and `retryMaterial` refuses it for the other four — so Buddy must not offer it there
 * (issue #115). A counted line ("N sheet(s) could not be read") could say none of this.
 */
function failureNote(reason: string | null): string {
  switch (reason) {
    case 'photos_missing':
      return 'never arrived completely (the send was given up): there was nothing to read, and a new photo is the only way — reading it again is not possible';
    case 'not_learning_material':
      return 'was not learning material, so it was not read; its photos are deleted and reading it again is not possible';
    case 'blocked':
      return 'was refused by the safety filter; reading it again is not possible';
    case 'form_not_practicable':
      return 'was read without any trouble, and every task on it is an exercise form Buddy has no exercise for (something drawn, free speaking, a long text, a real experiment, a piece of work over weeks, a practical or a heard task), so there is nothing on it to practise: say that plainly, offer to explain it or go through the steps with her instead, and do not offer a second reading — it would find the same tasks';
    case 'nothing_marked':
      return 'is a corrected test on which nothing is marked wrong, so there is nothing to practise from it; its photos are deleted and reading it again is not possible. Never ask for or mention a grade or points';
    case 'budget_exhausted':
      return 'could not be read: no more sheets could be read today (tomorrow it works again)';
    case 'unreadable':
      return 'could not be read: the photos were hard to read (she can have it read again, or photograph it better)';
    default:
      return 'could not be read: something went wrong while reading (she can have it read again)';
  }
}

/**
 * A step of a talk in STATE (issue #264): which stage it is and, once rehearsed, what the
 * rehearsal measured — read from the step's evidence, which code wrote from the recording.
 */
function taskExtra(st: StepRow): string {
  const stage = st.payload.stage ? ` [${st.payload.stage}]` : '';
  const ev = st.evidence as {
    duration_s?: number;
    target_s?: number | null;
    words_per_minute?: number;
    fillers?: number | null;
  } | null;
  if (!ev || typeof ev.duration_s !== 'number') return stage;
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const of = ev.target_s ? ` of ${mmss(ev.target_s)}` : '';
  const fillers = typeof ev.fillers === 'number' ? `, ${ev.fillers} filler sounds` : '';
  return `${stage} (rehearsed: ${mmss(ev.duration_s)}${of}, ${ev.words_per_minute ?? '?'} words/min${fillers})`;
}

/** Subjects with material and topic progress, then every sheet by name (aliases sh1…). */
function materialSection(
  state: BuddyState,
  aliases: Aliases,
  subjectAlias: ReadonlyMap<string, string>,
  tz: string,
): string[] {
  const lines: string[] = [];
  // Subjects and progress (topic-level, from spaced-repetition state).
  lines.push('## Material and progress');
  if (state.subjects.length === 0) lines.push('- no material yet');
  for (const s of state.subjects) {
    const alias = subjectAlias.get(s.id)!;
    lines.push(
      `- ${alias} ${s.name} (${s.kind}): ${s.material_count} sheets, ${s.item_count} questions`,
    );
    const ts = state.topics.filter((t) => t.subject_id === s.id && t.topic);
    const shaky = ts.filter((t) => t.shaky > 0).map((t) => t.topic);
    const secure = ts
      .filter((t) => t.shaky === 0 && t.seen > 0 && t.secure * 2 >= t.seen)
      .map((t) => t.topic);
    const refresh = ts
      .filter((t) => t.shaky === 0 && t.due > 0 && t.secure * 2 < t.seen)
      .map((t) => t.topic);
    const fresh = ts.filter((t) => t.seen === 0).map((t) => t.topic);
    if (secure.length) lines.push(`  secure: ${secure.slice(0, 6).join(', ')}`);
    if (shaky.length) lines.push(`  shaky: ${shaky.slice(0, 6).join(', ')}`);
    if (refresh.length) lines.push(`  time for a refresh: ${refresh.slice(0, 6).join(', ')}`);
    if (fresh.length) lines.push(`  not practised yet: ${fresh.slice(0, 6).join(', ')}`);
  }
  // She has more sheets than fit here: say so, or Buddy answers "that's all you have"
  // from a list that is only the newest ten (owner 28.09., issues #49 and #68).
  // Every sheet by name, so she can say "delete that one" and Buddy has something to point
  // at (issue #111): until now sheets appeared only as counts and titles, and everything she
  // said about one ended in a button.
  let sh = 0;
  for (const m of state.materials) {
    const alias = `sh${++sh}`;
    aliases.materials.set(alias, m);
    const what =
      m.status === 'ready'
        ? `${m.item_count} questions`
        : m.status === 'failed'
          ? 'could not be read'
          : 'being read';
    lines.push(`- ${alias} "${m.title ?? 'untitled sheet'}" (${what})`);
  }
  if (state.totals.materials > state.materials.length)
    lines.push(
      `- ${state.materials.length} of ${state.totals.materials} sheets are listed here (the newest); search_material finds the others`,
    );
  const reading = state.materials.filter((m) => m.status === 'queued' || m.status === 'processing');
  if (reading.length)
    lines.push(`- ${reading.length} sheet(s) are being read right now (no questions yet)`);
  // Photos still on their way (issue #115): without this the state said nothing at all about
  // a send that hangs, and Buddy asked for the photo she had already sent.
  for (const m of state.materials.filter((x) => x.status === 'awaiting_upload')) {
    const at = localParts(m.created_at, tz);
    lines.push(
      `- a sheet of ${m.photo_count} page(s) is still being sent (since ${at.date} ${at.time}): not all photos have arrived, nothing was read from it yet`,
    );
  }
  // Why a sheet did not work decides what she can do next, so it is named, not counted.
  for (const m of state.materials.filter((x) => x.status === 'failed'))
    lines.push(`- "${m.title ?? 'a sheet'}" ${failureNote(m.failure_reason)}`);
  // Read fine, but not all of it turned into questions (issue #150): he must be able to
  // say so, or a half-read word list passes for a whole one — which is how "frag mich alle
  // Vokabeln ab" handed back half a sheet.
  for (const m of state.materials.filter((x) => x.status === 'ready' && x.items_incomplete))
    lines.push(
      `- "${m.title ?? 'sheet'}": ${m.item_count} questions read, and the sheet has MORE. Say that plainly if she asks for all of it; never let it pass for the whole sheet`,
    );
  // Read fine, and (part of) it is an exercise form he has no exercise for (issue #198). The
  // tasks are named as printed, so he can say WHICH one in her words — a task nobody names is
  // exactly what makes a sheet look done when its exercise never happened.
  for (const m of state.materials.filter((x) => x.not_practicable.length > 0)) {
    const named = m.not_practicable
      .slice(0, 6)
      .map((n) => `"${n.task}" (${n.form})`)
      .join('; ');
    const more = m.not_practicable.length > 6 ? ` and ${m.not_practicable.length - 6} more` : '';
    lines.push(
      `- "${m.title ?? 'sheet'}": no exercises were made for ${named}${more} — that exercise form is not one Buddy can practise. Name it if it comes up, offer to explain it or go through the steps instead, and never let it pass for practised`,
    );
  }
  // A spot the reading could not settle, where the smallest clarification is to ask her
  // (issue #164 point 1). He names the task as printed and both readings, so she recognises
  // which one is meant and can simply say which it is; he never picks one himself, because the
  // question for that task is written from HER reading and from nothing else.
  for (const m of state.materials.filter((x) => x.unclear.length > 0)) {
    const sheet = `"${m.title ?? 'sheet'}"`;
    for (const u of m.unclear) {
      const readings = u.readings.map((r) => `"${r}"`).join(' or ');
      if (u.status === 'open') {
        lines.push(
          `- ${sheet}, page ${u.page}: in the task "${u.task}" the ${u.about} could not be read — it is ${readings}. Ask her which it is if it comes up (she also sees it with both to tap); NEVER pick one yourself, and say that there is no question for that task until she does. Everything else on the sheet is ready`,
        );
      } else if (u.status === 'answered') {
        lines.push(
          `- ${sheet}: she said the ${u.about} in "${u.task}" is "${u.answer}" — the question for that task is being written from her reading right now, so it is not there yet`,
        );
      } else {
        lines.push(
          `- ${sheet}: she said the ${u.about} in "${u.task}" is "${u.answer}", and the question for that task still could not be written. Say that plainly if it comes up, thank her for the answer and offer a new photo of page ${u.page}; never let it look as if the task were practised`,
        );
      }
    }
  }
  // What kind of page a ready sheet is (issue #259): the reading said it, code kept only what
  // follows from it — he must know, or he quizzes a test's tasks as if they were a worksheet.
  for (const m of state.materials.filter((x) => x.status === 'ready' && x.source !== 'sheet')) {
    const sheet = `"${m.title ?? 'sheet'}"`;
    if (m.source === 'corrected_test')
      lines.push(
        `- ${sheet} is her corrected class test: its questions are NEW tasks of the kind the teacher marked as wrong, never the original tasks and nothing that was right. Nothing about the grade or points was kept and its photos are deleted: never ask for or mention a grade or points`,
      );
    else
      lines.push(
        `- ${sheet} is her notebook entry of the lesson on ${m.ready_at ? localParts(m.ready_at, tz).date : 'an earlier day'}: what an unannounced short test about the last lesson asks (some schools write one without notice). Its few questions are meant for a short run the next morning before school — prepare that and say so; any message to her phone stays within her contact settings`,
      );
  }
  for (const m of state.materials.filter((x) => x.status === 'ready' && x.page_problems.length))
    lines.push(
      `- "${m.title ?? 'sheet'}": page(s) ${m.page_problems.map((p) => p.page).join(', ')} of ${m.photo_count} not read completely; no questions from what was missing (the learner sees a card to photograph them again)`,
    );
  return lines;
}

/** What she is working on, her recent practice and the questions she kept for later. */
function practiceSection(state: BuddyState, tz: string, locale: string): string[] {
  const lines: string[] = [];
  // What she is working on right now (issue #160). It stands before the sessions because
  // it is the thing a turn is usually about, and it survives a pause and a restart — which
  // the chat window does not.
  if (state.focus) {
    const f = state.focus;
    const parts = [
      f.subject_name,
      f.goal_title ? `for "${f.goal_title}"` : null,
      f.material_title ? `sheet "${f.material_title}"` : f.material_id ? 'one sheet' : null,
      f.vocabulary_only ? 'vocabulary only' : null,
      f.direction === 'produce'
        ? 'she writes the foreign word'
        : f.direction === 'recognise'
          ? 'she says what it means'
          : null,
    ].filter((x): x is string => Boolean(x));
    if (parts.length > 0) {
      lines.push('## What she is working on');
      lines.push(`- ${parts.join(' · ')}`);
      if (f.said) lines.push(`  her words: "${f.said}"`);
      lines.push(
        '  This still holds unless she says otherwise. Do not ask again for what is here, and do not quietly widen it.',
      );
    }
  }
  lines.push('## Recent practice');
  if (state.sessions.length === 0) lines.push('- none yet');
  for (const s of state.sessions.slice(0, 3)) {
    const when = localParts(s.started_at, tz);
    const shaky = s.shaky_topics.length ? `; shaky: ${s.shaky_topics.slice(0, 4).join(', ')}` : '';
    lines.push(
      `- ${when.date} ${when.time} ${s.status}: ${s.answered}/${s.total} answered, ${s.first_try} right first try${shaky}`,
    );
  }
  // What she kept for after practice (issue #391): her own words, through the recall rule, only
  // once that practice is over (state.ts) — never the tutor's reply, which may hold a hint.
  const kept = state.later.flatMap((n) => {
    const text = recallText(n, locale, false);
    return text === null ? [] : [{ ...n, text }];
  });
  if (kept.length > 0) {
    lines.push('## Questions she kept for after practice (that practice is over now)');
    for (const n of kept) {
      const ended = localParts(n.ended_at, tz);
      const during = n.session_title ? ` (during "${n.session_title}")` : '';
      lines.push(`- "${n.text}"${during}, practice ended ${ended.date} ${ended.time}`);
    }
    lines.push(
      '  She tapped "Merk ich mir für nachher" for these. Bring each up once, in your own words' +
        ' ("Du wolltest vorhin wissen, …"), and answer it — unless the conversation below shows' +
        ' you already have.',
    );
  }
  return lines;
}

/**
 * What already stands in front of her (issue #184). Buddy's own offer and a practice he prepared
 * are both "something she can tap"; neither was in the state he reads each turn, so he offered
 * the same practice again, and again, while the first button sat right there (measured 01.10. —
 * the core of "gefühlt funktioniert alles schlechter als vorher", #127). What stands is read off
 * her rows, not off the conversation: an offer whose session she has not worked in
 * (state.ts loadStandingOffers), and a prepared practice step.
 */
function waitingSection(state: BuddyState, aliases: Aliases, tz: string): string[] {
  const lines: string[] = [];
  const stepAliasById = new Map<string, string>();
  for (const [alias, row] of aliases.steps) stepAliasById.set(row.id, alias);
  const prepared = preparedSteps(state);
  if (state.standing.length === 0 && prepared.length === 0) return lines;
  lines.push('## Already waiting for her (one tap starts it, nothing more needed)');
  for (const o of state.standing) {
    const at = localParts(o.created_at, tz);
    const wish = [
      o.difficulty,
      o.direction === 'produce'
        ? 'she writes the foreign word'
        : o.direction === 'recognise'
          ? 'she says what it means'
          : null,
      o.minutes !== null ? `with ${o.minutes} minutes, as she asked` : null,
    ].filter((x): x is string => Boolean(x));
    lines.push(
      `- your ${o.kind} offer "${o.text}"${wish.length ? ` (${wish.join(' · ')})` : ''}` +
        ` from ${at.date} ${at.time}: its button is in the conversation, she has not started it`,
    );
  }
  for (const s of prepared) {
    const alias = stepAliasById.get(s.id);
    lines.push(
      `- practice you prepared${alias ? ` ${alias}` : ''} "${s.title}"` +
        ` (${s.payload.item_ids?.length ?? 0} questions): ready to start, she has not started it`,
    );
  }
  lines.push(
    '  She needs nothing from you to start any of this. Making a second one of the same thing' +
      ' adds nothing she can see: say where the next step is instead. Something she asks for' +
      ' that is genuinely different gets its own.',
  );
  return lines;
}

/** One STATE: subjects are numbered first (f1…), so goals can name theirs. */
export function renderLearning(
  state: BuddyState,
  aliases: Aliases,
  at: { timezone: string; locale: string },
): StateRender {
  let fi = 0;
  const subjectAlias = new Map<string, string>();
  for (const s of state.subjects) {
    const alias = `f${++fi}`;
    aliases.subjects.set(alias, s);
    subjectAlias.set(s.id, alias);
  }
  return {
    goalSuffix: (g: GoalRow) =>
      g.subject_id
        ? ` · subject ${subjectAlias.get(g.subject_id) ?? '?'} ${g.subject_name ?? ''}`
        : '',
    goalLines: (g: GoalRow) => {
      const before: string[] = [];
      const after: string[] = [];
      // A talk (issue #264): its length is what the rehearsal measures against. She writes and
      // gives it herself — Buddy plans, listens and says what was measured, never writes it.
      if (g.kind === 'talk') {
        before.push(
          `  a talk she gives herself${g.talk_minutes ? `, ${g.talk_minutes} min long` : ''}: never write it, its outline, its slides or its cue cards for her — give feedback on what she has, and offer a rehearsal (offer_rehearsal) when she wants to try it`,
        );
      }
      if (g.status === 'active' && g.kind !== 'talk') {
        const mats = state.materials.filter((m) => m.goal_id === g.id);
        const ready = mats.filter((m) => m.status === 'ready');
        const pending = mats.filter((m) => m.status !== 'ready' && m.status !== 'failed');
        const questions = ready.reduce((n, m) => n + m.item_count, 0);
        after.push(
          `  material: ${ready.length} ready (${questions} questions)${pending.length ? `, ${pending.length} still on the way or being read` : ''}`,
        );
      }
      return { before, after };
    },
    stepExtra: (st: StepRow) =>
      st.kind === 'practice' && st.payload.item_ids
        ? ` (${st.payload.item_ids.length} questions, ~${st.payload.est_minutes ?? '?'} min)`
        : st.kind === 'task'
          ? taskExtra(st)
          : '',
    sections: () => ({
      material: materialSection(state, aliases, subjectAlias, at.timezone),
      practice: practiceSection(state, at.timezone, at.locale),
      waiting: waitingSection(state, aliases, at.timezone),
    }),
  };
}
