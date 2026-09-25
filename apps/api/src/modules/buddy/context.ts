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

import { addDays, daysBetween, localParts, weekdayName } from '../../lib/time.js';
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

function fmtDay(date: string, today: string): string {
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
  return `${weekdayName(date)} ${date} (${rel})`;
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
  const lines: string[] = [];

  lines.push('## Now');
  lines.push(`${weekdayName(today)} ${today}, ${nowLocal.time} (${tz})`);
  const week = Array.from({ length: 8 }, (_, i) => addDays(today, i))
    .map((d) => `${weekdayName(d).slice(0, 3)} ${d}`)
    .join(', ');
  lines.push(`Next days: ${week}`);

  lines.push('', '## Learner');
  const level =
    learner.level === 'school'
      ? `school, grade ${learner.grade ?? 'unknown'}`
      : learner.level === 'unknown'
        ? 'unknown (ask when it matters for the next step)'
        : learner.level;
  lines.push(
    `Name: ${learner.display_name} · age: ${ageGroup(learner.birth_date, today)}${learner.isMinor ? ' (minor)' : ''} · level: ${level}`,
  );
  lines.push(`Language: ${LANGUAGE_NAMES[learner.locale] ?? learner.locale}`);

  // Knowledge, split by what it is.
  const permanent = state.memories.filter((m) => m.kind !== 'constraint');
  const temporary = state.memories.filter((m) => m.kind === 'constraint');
  let mi = 0;
  const memLine = (m: MemoryRow): string => {
    const alias = `m${++mi}`;
    aliases.memories.set(alias, m);
    const until = m.valid_until ? ` (through ${lastDayOf(m.valid_until, tz)})` : '';
    return `- ${alias} [${m.kind}] ${m.statement}${until}`;
  };
  lines.push('', '## What Buddy knows (said by the learner; correctable)');
  if (permanent.length === 0) lines.push('- nothing yet');
  for (const m of permanent) lines.push(memLine(m));
  lines.push('', '## Temporary situations (they end)');
  if (temporary.length === 0) lines.push('- none');
  for (const m of temporary) lines.push(memLine(m));
  if (state.totals.memories > state.memories.length) {
    lines.push(`(showing ${state.memories.length} of ${state.totals.memories})`);
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
      ? ` ${fmtDay(st.planned_date, today)}${st.planned_time ? ` ${st.planned_time}` : ''}`
      : '';
    const agreed = st.agreed ? ' [agreed with learner]' : '';
    const extra =
      st.kind === 'practice' && st.payload.item_ids
        ? ` (${st.payload.item_ids.length} questions, ~${st.payload.est_minutes ?? '?'} min)`
        : '';
    const done = st.done_source === 'learner_reported' ? ' (learner said so)' : '';
    return `  - ${alias} ${st.kind} "${st.title}": ${st.state}${done}${when}${agreed}${extra}`;
  };

  lines.push('', '## Goals and plan');
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) lines.push('- no active goals');
  for (const g of state.goals) {
    const alias = `g${++gi}`;
    aliases.goals.set(alias, g);
    const date = g.due_date ? ` on ${fmtDay(g.due_date, today)}` : '';
    const subj = g.subject_id
      ? ` · subject ${subjectAlias.get(g.subject_id) ?? '?'} ${g.subject_name ?? ''}`
      : '';
    const status =
      g.status === 'active' ? '' : ` [${g.status}${g.outcome ? `, went ${g.outcome}` : ''}]`;
    lines.push(`- ${alias} ${g.kind} "${g.title}"${date}${subj}${status}`);
    if (g.topics.length > 0) lines.push(`  topics: ${g.topics.join(', ')}`);
    const mats = state.materials.filter((m) => m.goal_id === g.id);
    if (g.status === 'active') {
      const ready = mats.filter((m) => m.status === 'ready');
      const pending = mats.filter((m) => m.status !== 'ready' && m.status !== 'failed');
      const questions = ready.reduce((n, m) => n + m.item_count, 0);
      lines.push(
        `  material: ${ready.length} ready (${questions} questions)${pending.length ? `, ${pending.length} still being read` : ''}`,
      );
    }
    for (const st of state.steps.filter((s) => s.goal_id === g.id)) lines.push(stepLine(st));
  }
  const looseSteps = state.steps.filter((s) => !s.goal_id);
  if (looseSteps.length > 0) {
    lines.push('- steps without goal:');
    for (const st of looseSteps) lines.push(stepLine(st));
  }
  if (
    state.totals.activeGoals > activeGoals.length ||
    state.totals.openSteps > state.steps.length
  ) {
    lines.push(
      `(open in total: ${state.totals.activeGoals} goals, ${state.totals.openSteps} steps)`,
    );
  }

  // Subjects and progress (topic-level, from spaced-repetition state).
  lines.push('', '## Material and progress');
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
  const reading = state.materials.filter((m) => m.status === 'queued' || m.status === 'processing');
  if (reading.length)
    lines.push(`- ${reading.length} sheet(s) are being read right now (no questions yet)`);
  const failed = state.materials.filter((m) => m.status === 'failed');
  if (failed.length)
    lines.push(`- ${failed.length} sheet(s) could not be read (learner can retry)`);

  lines.push('', '## Recent practice');
  if (state.sessions.length === 0) lines.push('- none yet');
  for (const s of state.sessions.slice(0, 3)) {
    const when = localParts(s.started_at, tz);
    const shaky = s.shaky_topics.length ? `; shaky: ${s.shaky_topics.slice(0, 4).join(', ')}` : '';
    lines.push(
      `- ${when.date} ${when.time} ${s.status}: ${s.answered}/${s.total} answered, ${s.first_try} right first try${shaky}`,
    );
  }

  const st = state.settings;
  lines.push('', '## Contact outside the app');
  if (!st.contact_enabled) {
    lines.push(
      '- OFF: Buddy may not message the learner outside the app (reminders stay in the app).',
    );
  } else {
    const sentThisWeek = state.outreach.filter(
      (o) => o.sent_at && daysBetween(localParts(o.sent_at, tz).date, today) < 7,
    ).length;
    lines.push(
      `- on · quiet ${st.quiet_start}–${st.quiet_end} · preferred ${st.preferred_start}–${st.preferred_end}` +
        `${st.avoid_weekdays.length ? ` · never on weekdays ${st.avoid_weekdays.join(',')}` : ''}` +
        ` · at most ${st.max_per_day}/day, ${st.max_per_week}/week (${sentThisWeek} in the last 7 days)`,
    );
    if (st.paused_until && st.paused_until > now) {
      lines.push(`- paused through ${lastDayOf(st.paused_until, tz)}`);
    }
    if (!opts.pushAvailable)
      lines.push('- no working push channel on the device: messages only appear in the app');
  }
  const lastOut = state.outreach.find((o) => o.sent_at);
  if (lastOut?.sent_at) {
    const at = localParts(lastOut.sent_at, tz);
    const answer = lastOut.opened_at ? 'opened' : 'not opened yet';
    lines.push(`- last message ${at.date} ${at.time}: "${lastOut.title}" (${answer})`);
  }
  if (opts.modelNote) lines.push('', opts.modelNote);

  return { state: lines.join('\n'), aliases, contextVersion: st.context_version };
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
