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
//
// Every section is named here (the `blocks` array at the end), so what each one costs per
// turn and whether an answer referred to it can be measured without changing a byte of what
// is sent: `blocks.ts`, issue #168.
//
// What the domain knows about her — in LearnBuddy her level as a school year, her subjects and
// sheets, her practice and what waits for her — its context provider renders (provider.ts, issue
// #107): its own sections in their place in the cache order, and what it adds to a goal or a step.

import { dayLabel } from '../../i18n/index.js';
import { addDays, daysBetween, localParts, weekdayName, weekdayOf } from '../../lib/time.js';
import type { LlmMessage } from '../../llm/gateway.js';
import type { LearnerContext } from '../../http/context.js';
import { aliasesIn, blockData, occursIn, reportState } from './blocks.js';
import { contextProvider } from './provider.js';
import type { BuddyState, GoalRow, MemoryRow, StepRow } from './state.js';

/**
 * The aliases a domain adds (LearnBuddy: subjects f1…, sheets sh1…): it declares its maps by
 * augmenting this interface, and fills them as it renders its part of STATE (provider.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by the domain's augmentation
export interface DomainAliases {}

export type Aliases = {
  goals: Map<string, GoalRow>;
  steps: Map<string, StepRow>;
  memories: Map<string, MemoryRow>;
} & DomainAliases;

export type BuiltContext = {
  state: string;
  aliases: Aliases;
  contextVersion: number;
};

export type LearnerFacts = Pick<
  LearnerContext,
  'display_name' | 'birth_date' | 'level' | 'grade' | 'locale' | 'isMinor'
>;

/** No aliases at all: a turn that resolves none (a scene without tools). */
export function noAliases(): Aliases {
  return {
    goals: new Map(),
    steps: new Map(),
    memories: new Map(),
    ...contextProvider().state.noAliases(),
  };
}

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
function spokenDay(date: string, today: string, locale: string): string {
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
  const domain = contextProvider().state;
  const tz = state.settings.timezone;
  const nowLocal = localParts(now, tz);
  const today = nowLocal.date;
  const aliases = noAliases();
  // Sections are filled in the order the aliases are numbered (memories m1…, then the
  // domain's that goals name, goals g1…, steps st1…) and emitted in the cache order at the end
  // of this function.
  const nowBlock: string[] = [];
  const learnerBlock: string[] = [];
  const knowledgeBlock: string[] = [];
  const temporaryBlock: string[] = [];
  const goalsBlock: string[] = [];
  const summariesBlock: string[] = [];
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
  learnerBlock.push(
    `Name: ${learner.display_name} · age: ${ageGroup(learner.birth_date, today)}${learner.isMinor ? ' (minor)' : ''} · level: ${domain.level(learner, today)}`,
  );
  learnerBlock.push(`Language: ${LANGUAGE_NAMES[learner.locale] ?? learner.locale}`);
  // "Sehen meine Eltern das?" — read off what the code actually allows, so the answer is the
  // truth and not an improvised promise (issue #114). The account holder can export
  // everything (identity/privacy.ts, behind the PIN for a minor: assertAccountHolderOf) but
  // nothing shows them the conversation as it happens, and Buddy never reports on her by
  // himself — not even from a safeguarding turn (docs/architecture.md §Safeguarding, D-10).
  learnerBlock.push(
    learner.isMinor
      ? 'Who can read this: only her and you. The adult whose account this is can download everything she writes here, with their PIN — they cannot watch along, and nothing is passed on to them by itself.'
      : 'Who can read this: only her and you. Nothing is passed on to anyone.',
  );

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

  // The domain's part: it numbers what goals name before the goals are written.
  const part = domain.render(state, aliases, { timezone: tz, locale: learner.locale });

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
    const done = st.done_source === 'learner_reported' ? ' (learner said so)' : '';
    // A standing arrangement, so a second "erinner mich jeden Tag" is recognised as the one
    // she already has instead of becoming a second one (issue #112).
    const again = st.repeat
      ? ` [repeats ${st.repeat}${st.repeat_until ? ` until ${fmtDay(st.repeat_until, today, learner.locale)}` : ''}]`
      : '';
    return `  - ${alias} ${st.kind} "${st.title}": ${st.state}${done}${when}${agreed}${again}${part.stepExtra(st)}`;
  };

  goalsBlock.push('## Goals and plan');
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) goalsBlock.push('- no active goals');
  for (const g of state.goals) {
    const alias = `g${++gi}`;
    aliases.goals.set(alias, g);
    const date = g.due_date ? ` on ${fmtDay(g.due_date, today, learner.locale)}` : '';
    const status =
      g.status === 'active' ? '' : ` [${g.status}${g.outcome ? `, went ${g.outcome}` : ''}]`;
    goalsBlock.push(`- ${alias} ${g.kind} "${g.title}"${date}${part.goalSuffix(g)}${status}`);
    const lines = part.goalLines(g);
    goalsBlock.push(...lines.before);
    if (g.topics.length > 0) goalsBlock.push(`  topics: ${g.topics.join(', ')}`);
    goalsBlock.push(...lines.after);
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

  // The domain's sections, now that every goal and step has its alias.
  const sections = part.sections();

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
  //   (the domain's sections that change less often than goals — LearnBuddy: material)
  //   goals        — goal and step tools; its day labels ("in 4 days") turn over at local
  //                  midnight, so it is stable within a day but not across one.
  //   (the domain's sections that change more often — LearnBuddy: practice, waiting; the
  //   reason per section is written where the domain declares it, learning/context.ts)
  //   Now          — the local time to the minute: different in almost every turn, so it
  //                  ends the block. Everything after it (the dialogue) is uncacheable
  //                  anyway — the 24-message window slides with every turn.
  //   note         — only when her message is older than today (a resend, a recovery).
  const placed = (place: 'before_goals' | 'after_goals') =>
    domain.sections
      .filter((s) => s.place === place)
      .map((s) => ({ name: s.name, lines: sections[s.name] ?? [] }));
  const blocks: Array<{ name: string; lines: string[] }> = [
    { name: 'learner', lines: learnerBlock },
    { name: 'knows', lines: knowledgeBlock },
    { name: 'temporary', lines: temporaryBlock },
    { name: 'voice', lines: voiceBlock },
    { name: 'contact', lines: contactBlock },
    { name: 'earlier', lines: summariesBlock },
    ...placed('before_goals'),
    { name: 'goals', lines: goalsBlock },
    ...placed('after_goals'),
    { name: 'now', lines: nowBlock },
    { name: 'note', lines: noteBlock },
  ];
  const present = blocks.filter((b) => b.lines.length > 0);
  const text = present.map((b) => b.lines.join('\n')).join('\n\n');

  // What each section cost and what it offered, for the measurement behind issue #168. Does
  // nothing at all unless an audit is registered (blocks.ts), and never touches `text`.
  reportState(() => {
    const data = blockData(state, learner);
    return {
      learnerId: st.learner_id,
      blocks: present.map(({ name, lines }) => {
        const body = lines.join('\n');
        return {
          name,
          chars: body.length,
          text: body,
          // Only what this block really printed: a topic cut off at the sixth of its bucket
          // above, or a session beyond the third, was never in front of the model and must
          // not be credited to it.
          data: [...new Set([...(data[name] ?? []), ...aliasesIn(body)])].filter((d) =>
            occursIn(body, d),
          ),
        };
      }),
    };
  });

  return { state: text, aliases, contextVersion: st.context_version };
}

/**
 * Topic keys may mention aliases ("exam:g1:prep"). Aliases are renumbered
 * with every context, so keys are stored with the real ids — otherwise the
 * "no repeat within 72 h" rule would compare different things.
 */
export function canonicalTopicKey(topicKey: string, aliases: Aliases): string {
  const domain = contextProvider().state.topicKeyAliases;
  const maps: Record<string, Map<string, { id: string }>> = {
    g: aliases.goals,
    st: aliases.steps,
    m: aliases.memories,
    ...Object.fromEntries(Object.entries(domain).map(([prefix, key]) => [prefix, aliases[key]])),
  };
  const segment = new RegExp(`^(${Object.keys(maps).join('|')})\\d{1,3}$`);
  return topicKey
    .split(':')
    .map((s) => {
      const kind = segment.exec(s)?.[1];
      return (kind && maps[kind]?.get(s)?.id) ?? s;
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
  return mergeRoles(raw);
}

/** Consecutive messages of one role as one: the model API wants the roles to alternate. */
export function mergeRoles(raw: readonly LlmMessage[]): LlmMessage[] {
  const merged: LlmMessage[] = [];
  for (const m of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.parts.push(...m.parts);
    else merged.push({ role: m.role, parts: [...m.parts] });
  }
  return merged;
}
