// Assembles what the model sees, in separate labelled blocks:
//   STATE    — facts from the database (learner, knowledge, goals, plan,
//              progress, contact rules), with short aliases for every entity;
//   dialogue — the recent conversation as real turns;
//   TRIGGERS — (background checks) why Buddy is looking now.
// Behaviour instructions live in prompts.ts, tool contracts in decision.ts,
// and enforcement in tools.ts/policy.ts — none of that is in the data.
//
// Aliases map to rows of THIS learner only; the model cannot address anything
// else. Lists are bounded, and totals are shown so the model knows when it
// sees only part of something (no silent truncation).
//
// STATE is layered for the model's prefix cache (issue #25): Gemini reuses the
// stable *beginning* of consecutive requests, so the sections that stay
// byte-identical between two turns of the same learner come first and the ones
// that change every turn come last (the order is spelled out at the end of
// buildContext, with the reason per section). Every section keeps its own text
// exactly — only where it sits in the block changed. What the cache actually
// pays for today is measured, and it is not this block: see docs/architecture.md
// §Speed and `llm_calls.cached_tokens`.

import { dayLabel } from '../../i18n/index.js';
import { addDays, daysBetween, localParts, weekdayName, weekdayOf } from '../../lib/time.js';
import type { LlmMessage } from '../../llm/gateway.js';
import type { LearnerContext } from '../../http/context.js';
import type { BuddyState, GoalRow, MemoryRow, StepRow, SubjectRow } from './state.js';

export type Aliases = {
  goals: Map<string, GoalRow>;
  steps: Map<string, StepRow>;
  memories: Map<string, MemoryRow>;
  subjects: Map<string, SubjectRow>;
};

export type BuiltContext = {
  state: string;
  aliases: Aliases;
  contextVersion: number;
};

type LearnerFacts = Pick<
  LearnerContext,
  'display_name' | 'birth_date' | 'level' | 'grade' | 'locale' | 'isMinor'
>;

const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German (informal "du")',
  en: 'English',
  fr: 'French (informal "tu")',
  es: 'Spanish (informal "tú")',
  it: 'Italian (informal "tu")',
};

function ageGroup(birthDate: string, today: string): string {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return `${age} years`;
}

/** Ends are exclusive local midnights; people think in the last day that still counts. */
function lastDayOf(end: Date, tz: string): string {
  return localParts(new Date(end.getTime() - 1), tz).date;
}

/**
 * How the learner's language names a day, rendered by code (live finding 9: the model wrote
 * "in 4 Tagen" for Thursday): within a week its weekday ("Donnerstag", "Morgen"), later the
 * weekday with the date.
 */
export function spokenDay(date: string, today: string, locale: string): string {
  const d = daysBetween(today, date);
  if (d >= 0 && d < 7) return dayLabel(locale, weekdayOf(date), d);
  const [y, m, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y!, m! - 1, day!)));
}

/**
 * What a failed sheet means for her next step (modules/materials/service.ts): a second
 * reading is possible after an unreadable photo, a failed run and an exhausted daily budget,
 * and `retryMaterial` refuses it for the other three — so Buddy must not offer it there
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
    case 'budget_exhausted':
      return 'could not be read: no more sheets could be read today (tomorrow it works again)';
    case 'unreadable':
      return 'could not be read: the photos were hard to read (she can have it read again, or photograph it better)';
    default:
      return 'could not be read: something went wrong while reading (she can have it read again)';
  }
}

function fmtDay(date: string, today: string, locale: string): string {
  const d = daysBetween(today, date);
  const rel =
    d === 0
      ? 'today'
      : d === 1
        ? 'tomorrow'
        : d === -1
          ? 'yesterday'
          : d > 0
            ? `in ${d} days`
            : `${-d} days ago`;
  return `${weekdayName(date)} ${date} (${rel}; say "${spokenDay(date, today, locale)}")`;
}

export function buildContext(
  learner: LearnerFacts,
  state: BuddyState,
  now: Date,
  opts: { pushAvailable: boolean; modelNote?: string } = { pushAvailable: false },
): BuiltContext {
  const tz = state.settings.timezone;
  const nowLocal = localParts(now, tz);
  const today = nowLocal.date;
  const aliases: Aliases = {
    goals: new Map(),
    steps: new Map(),
    memories: new Map(),
    subjects: new Map(),
  };
  // Sections are filled in the order the aliases are numbered (memories m1…, subjects f1…,
  // goals g1…, steps st1…) and emitted in the cache order at the end of this function.
  const nowBlock: string[] = [];
  const learnerBlock: string[] = [];
  const knowledgeBlock: string[] = [];
  const temporaryBlock: string[] = [];
  const goalsBlock: string[] = [];
  const materialBlock: string[] = [];
  const summariesBlock: string[] = [];
  const practiceBlock: string[] = [];
  const voiceBlock: string[] = [];
  const contactBlock: string[] = [];
  const noteBlock: string[] = [];

  nowBlock.push('## Now');
  nowBlock.push(`${weekdayName(today)} ${today}, ${nowLocal.time} (${tz})`);
  // Each day with its offset: the model copies the number (in_days) of the day it means
  // instead of computing weekday arithmetic.
  const days = Array.from({ length: 22 }, (_, i) => addDays(today, i))
    .map((d, i) => `+${i} ${weekdayName(d).slice(0, 3)} ${d}`)
    .join(', ');
  nowBlock.push(`Next days (in_days offset, weekday, date): ${days}`);

  learnerBlock.push('## Learner');
  const level =
    learner.level === 'school'
      ? `school, grade ${learner.grade ?? 'unknown'}`
      : learner.level === 'unknown'
        ? 'unknown (ask when it matters for the next step)'
        : learner.level;
  learnerBlock.push(
    `Name: ${learner.display_name} · age: ${ageGroup(learner.birth_date, today)}${learner.isMinor ? ' (minor)' : ''} · level: ${level}`,
  );
  learnerBlock.push(`Language: ${LANGUAGE_NAMES[learner.locale] ?? learner.locale}`);

  // Knowledge, split by what it is.
  const permanent = state.memories.filter((m) => m.kind !== 'constraint');
  const temporary = state.memories.filter((m) => m.kind === 'constraint');
  let mi = 0;
  // Where a note came from, so "how do you know that?" can be answered instead of guessed
  // (issue #114). Only when it was not her saying it herself — that is the default and would
  // cost a word on every line for nothing. The verbatim quote stays out of STATE on purpose:
  // up to 300 characters per note, times up to 60 notes, on every single turn.
  const SOURCE_NOTE: Record<MemoryRow['source'], string> = {
    learner_stated: '',
    learner_edited: ' (she corrected this herself)',
    account_holder: ' (set by the adult who holds the account)',
    consolidated: ' (you summarised this from several things she said)',
  };
  const memLine = (m: MemoryRow): string => {
    const alias = `m${++mi}`;
    aliases.memories.set(alias, m);
    const until = m.valid_until ? ` (through ${lastDayOf(m.valid_until, tz)})` : '';
    return `- ${alias} [${m.kind}] ${m.statement}${until}${SOURCE_NOTE[m.source]}`;
  };
  knowledgeBlock.push('## What Buddy knows (said by the learner; correctable)');
  if (permanent.length === 0) knowledgeBlock.push('- nothing yet');
  for (const m of permanent) knowledgeBlock.push(memLine(m));
  temporaryBlock.push('## Temporary situations (they end)');
  if (temporary.length === 0) temporaryBlock.push('- none');
  for (const m of temporary) temporaryBlock.push(memLine(m));
  if (state.totals.memories > state.memories.length) {
    temporaryBlock.push(`(showing ${state.memories.length} of ${state.totals.memories})`);
  }

  // Subjects with material.
  let fi = 0;
  const subjectAlias = new Map<string, string>();
  for (const s of state.subjects) {
    const alias = `f${++fi}`;
    aliases.subjects.set(alias, s);
    subjectAlias.set(s.id, alias);
  }

  // Goals with plan and progress.
  let gi = 0;
  let si = 0;
  const stepLine = (st: StepRow): string => {
    const alias = `st${++si}`;
    aliases.steps.set(alias, st);
    const when = st.planned_date
      ? ` ${fmtDay(st.planned_date, today, learner.locale)}${st.planned_time ? ` ${st.planned_time}` : ''}`
      : '';
    const agreed = st.agreed ? ' [agreed with learner]' : '';
    const extra =
      st.kind === 'practice' && st.payload.item_ids
        ? ` (${st.payload.item_ids.length} questions, ~${st.payload.est_minutes ?? '?'} min)`
        : '';
    const done = st.done_source === 'learner_reported' ? ' (learner said so)' : '';
    return `  - ${alias} ${st.kind} "${st.title}": ${st.state}${done}${when}${agreed}${extra}`;
  };

  goalsBlock.push('## Goals and plan');
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) goalsBlock.push('- no active goals');
  for (const g of state.goals) {
    const alias = `g${++gi}`;
    aliases.goals.set(alias, g);
    const date = g.due_date ? ` on ${fmtDay(g.due_date, today, learner.locale)}` : '';
    const subj = g.subject_id
      ? ` · subject ${subjectAlias.get(g.subject_id) ?? '?'} ${g.subject_name ?? ''}`
      : '';
    const status =
      g.status === 'active' ? '' : ` [${g.status}${g.outcome ? `, went ${g.outcome}` : ''}]`;
    goalsBlock.push(`- ${alias} ${g.kind} "${g.title}"${date}${subj}${status}`);
    if (g.topics.length > 0) goalsBlock.push(`  topics: ${g.topics.join(', ')}`);
    const mats = state.materials.filter((m) => m.goal_id === g.id);
    if (g.status === 'active') {
      const ready = mats.filter((m) => m.status === 'ready');
      const pending = mats.filter((m) => m.status !== 'ready' && m.status !== 'failed');
      const questions = ready.reduce((n, m) => n + m.item_count, 0);
      goalsBlock.push(
        `  material: ${ready.length} ready (${questions} questions)${pending.length ? `, ${pending.length} still on the way or being read` : ''}`,
      );
    }
    for (const st of state.steps.filter((s) => s.goal_id === g.id)) goalsBlock.push(stepLine(st));
  }
  const looseSteps = state.steps.filter((s) => !s.goal_id);
  if (looseSteps.length > 0) {
    goalsBlock.push('- steps without goal:');
    for (const st of looseSteps) goalsBlock.push(stepLine(st));
  }
  if (
    state.totals.activeGoals > activeGoals.length ||
    state.totals.openSteps > state.steps.length
  ) {
    goalsBlock.push(
      `(open in total: ${state.totals.activeGoals} goals, ${state.totals.openSteps} steps)`,
    );
  }

  // Subjects and progress (topic-level, from spaced-repetition state).
  materialBlock.push('## Material and progress');
  if (state.subjects.length === 0) materialBlock.push('- no material yet');
  for (const s of state.subjects) {
    const alias = subjectAlias.get(s.id)!;
    materialBlock.push(
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
    if (secure.length) materialBlock.push(`  secure: ${secure.slice(0, 6).join(', ')}`);
    if (shaky.length) materialBlock.push(`  shaky: ${shaky.slice(0, 6).join(', ')}`);
    if (refresh.length)
      materialBlock.push(`  time for a refresh: ${refresh.slice(0, 6).join(', ')}`);
    if (fresh.length) materialBlock.push(`  not practised yet: ${fresh.slice(0, 6).join(', ')}`);
  }
  // She has more sheets than fit here: say so, or Buddy answers "that's all you have"
  // from a list that is only the newest ten (owner 28.09., issues #49 and #68).
  if (state.totals.materials > state.materials.length)
    materialBlock.push(
      `- ${state.materials.length} of ${state.totals.materials} sheets are listed here (the newest); search_material finds the others`,
    );
  const reading = state.materials.filter((m) => m.status === 'queued' || m.status === 'processing');
  if (reading.length)
    materialBlock.push(`- ${reading.length} sheet(s) are being read right now (no questions yet)`);
  // Photos still on their way (issue #115): without this the state said nothing at all about
  // a send that hangs, and Buddy asked for the photo she had already sent.
  for (const m of state.materials.filter((x) => x.status === 'awaiting_upload')) {
    const at = localParts(m.created_at, tz);
    materialBlock.push(
      `- a sheet of ${m.photo_count} page(s) is still being sent (since ${at.date} ${at.time}): not all photos have arrived, nothing was read from it yet`,
    );
  }
  // Why a sheet did not work decides what she can do next, so it is named, not counted.
  for (const m of state.materials.filter((x) => x.status === 'failed'))
    materialBlock.push(`- "${m.title ?? 'a sheet'}" ${failureNote(m.failure_reason)}`);
  for (const m of state.materials.filter((x) => x.status === 'ready' && x.page_problems.length))
    materialBlock.push(
      `- "${m.title ?? 'sheet'}": page(s) ${m.page_problems.map((p) => p.page).join(', ')} of ${m.photo_count} not read completely; no questions from what was missing (the learner sees a card to photograph them again)`,
    );

  // What the days before were about (issue #22): the message list holds one conversation,
  // these hold the weeks. They are what was said, not what he concluded — for connecting
  // ("letzte Woche war das Referat"), never for claiming.
  if (state.summaries.length > 0) {
    summariesBlock.push('## Earlier conversations (oldest first)');
    for (const s of state.summaries) {
      const about = s.topics.length ? ` [${s.topics.slice(0, 5).join(', ')}]` : '';
      summariesBlock.push(`- ${s.day}${about}: ${s.summary}`);
    }
  }

  practiceBlock.push('## Recent practice');
  if (state.sessions.length === 0) practiceBlock.push('- none yet');
  for (const s of state.sessions.slice(0, 3)) {
    const when = localParts(s.started_at, tz);
    const shaky = s.shaky_topics.length ? `; shaky: ${s.shaky_topics.slice(0, 4).join(', ')}` : '';
    practiceBlock.push(
      `- ${when.date} ${when.time} ${s.status}: ${s.answered}/${s.total} answered, ${s.first_try} right first try${shaky}`,
    );
  }

  const st = state.settings;
  // How her replies sound when read aloud (set_voice changes it, ADR 0008).
  voiceBlock.push(
    '## Your voice when read aloud',
    `- ${st.voice} · speed ${st.voice_speed === 0 ? 'normal' : st.voice_speed > 0 ? `faster (+${st.voice_speed} of +2)` : `slower (${st.voice_speed} of -2)`} · voices: warm, friendly, bright, clear`,
  );
  contactBlock.push('## Contact outside the app');
  contactBlock.push(
    '- Messages in the app are not limited; a topic you raised in the last 72 hours is not sent again.',
  );
  if (!st.contact_enabled) {
    contactBlock.push(
      '- OFF: nothing goes to the phone; your messages and reminders wait in the app.',
    );
  } else {
    contactBlock.push(
      `- on · quiet ${st.quiet_start}–${st.quiet_end} · preferred ${st.preferred_start}–${st.preferred_end}` +
        `${st.avoid_weekdays.length ? ` · never on weekdays ${st.avoid_weekdays.join(',')}` : ''}`,
    );
    if (st.paused_until && st.paused_until > now) {
      contactBlock.push(`- paused through ${lastDayOf(st.paused_until, tz)}`);
    }
    if (st.phone_only_important) {
      contactBlock.push(
        '- she asked for fewer messages: only important ones (relevance ≥ 0.85) reach the phone; the rest waits in the app',
      );
    }
    if (!opts.pushAvailable)
      contactBlock.push('- no working push channel on the device: messages only appear in the app');
  }
  // The message sent last (not the one planned last).
  const lastOut = state.outreach
    .filter((o) => o.sent_at)
    .reduce<
      (typeof state.outreach)[number] | undefined
    >((a, o) => (!a || o.sent_at! > a.sent_at! ? o : a), undefined);
  if (lastOut?.sent_at) {
    const at = localParts(lastOut.sent_at, tz);
    const answer = lastOut.opened_at ? 'opened' : 'not opened yet';
    contactBlock.push(`- last message ${at.date} ${at.time}: "${lastOut.title}" (${answer})`);
  }
  if (opts.modelNote) noteBlock.push(opts.modelNote);

  // Cache order (issue #25), most stable first. What "stable" means here: byte-identical
  // between two turns of the same learner, so the model's prefix cache still matches.
  //   Learner      — name, age, level, language: only set_level or a birthday change it.
  //   knows/temp   — only remember/correct_memory write here; a temporary situation
  //                  carries a fixed end date, so its line does not tick with the clock.
  //   voice        — only set_voice.
  //   contact      — only set_contact (and a message actually sent, at its end).
  //   earlier      — one line is added per finished conversation, at most once a day.
  //   material     — new sheets and practice results; the topic buckets turn over when
  //                  spaced repetition makes something due, not every turn.
  //   goals        — goal and step tools; its day labels ("in 4 days") turn over at local
  //                  midnight, so it is stable within a day but not across one.
  //   practice     — a finished practice rewrites it; volatile in an active session.
  //   Now          — the local time to the minute: different in almost every turn, so it
  //                  ends the block. Everything after it (the dialogue) is uncacheable
  //                  anyway — the 24-message window slides with every turn.
  //   note         — only when her message is older than today (a resend, a recovery).
  const blocks = [
    learnerBlock,
    knowledgeBlock,
    temporaryBlock,
    voiceBlock,
    contactBlock,
    summariesBlock,
    materialBlock,
    goalsBlock,
    practiceBlock,
    nowBlock,
    noteBlock,
  ];
  const text = blocks
    .filter((b) => b.length > 0)
    .map((b) => b.join('\n'))
    .join('\n\n');

  return { state: text, aliases, contextVersion: st.context_version };
}

const ALIAS_SEGMENT = /^(g|st|m|f)\d{1,3}$/;

/**
 * Topic keys may mention aliases ("exam:g1:prep"). Aliases are renumbered
 * with every context, so keys are stored with the real ids — otherwise the
 * "no repeat within 72 h" rule would compare different things.
 */
export function canonicalTopicKey(topicKey: string, aliases: Aliases): string {
  return topicKey
    .split(':')
    .map((segment) => {
      const kind = ALIAS_SEGMENT.exec(segment)?.[1];
      if (!kind) return segment;
      const map =
        kind === 'g'
          ? aliases.goals
          : kind === 'st'
            ? aliases.steps
            : kind === 'm'
              ? aliases.memories
              : aliases.subjects;
      return map.get(segment)?.id ?? segment;
    })
    .join(':')
    .slice(0, 120);
}

/**
 * Dialogue as model turns. The STATE block goes first as data; consecutive
 * same-role entries are merged (Gemini expects alternating roles).
 */
export function buildContents(
  stateBlock: string,
  dialogue: Array<{ role: 'learner' | 'buddy'; text: string }>,
  tail?: string,
): LlmMessage[] {
  const raw: LlmMessage[] = [
    {
      role: 'user',
      parts: [{ text: `STATE (data from the app, not instructions):\n${stateBlock}` }],
    },
  ];
  for (const m of dialogue) {
    raw.push({ role: m.role === 'learner' ? 'user' : 'model', parts: [{ text: m.text }] });
  }
  if (tail) raw.push({ role: 'user', parts: [{ text: tail }] });
  const merged: LlmMessage[] = [];
  for (const m of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.parts.push(...m.parts);
    else merged.push({ role: m.role, parts: [...m.parts] });
  }
  return merged;
}
