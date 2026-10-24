// requires live verification in Claude Code session (eval tooling; measured pilot documented in docs/measurements)
// Independent code verdicts. The explorer never receives this state or these predicates.
import { z } from 'zod';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import type { Learner, TestEnv } from '../../src/testing/harness.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import { ACT_SCHEMAS } from '../../src/modules/buddy/decision.js';
import type { Goal } from './cases.js';
import { history, type Turn, type Tap } from './driver.js';

export type Finding = {
  invariant: string;
  kind: string;
  route: string;
  evidence: string;
  category: 'app' | 'infra' | 'simulator';
};
export const finding = (
  invariant: string,
  evidence: string,
  kind = 'chat',
  route = '/buddy/messages',
): Finding => ({ invariant, evidence, kind, route, category: 'app' });
function schemaFields(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(schemaFields);
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key === 'properties' && child && typeof child === 'object' ? Object.keys(child) : []),
    ...schemaFields(child),
  ]);
}
export function textViolations(
  text: string,
  system = '',
  identifiers = [
    ...Object.keys(ACT_SCHEMAS),
    ...Object.values(ACT_SCHEMAS).flatMap((schema) => schemaFields(toJsonSchema(schema))),
  ],
): string[] {
  const issues: string[] = [];
  if (/```|~~~/u.test(text)) issues.push('text.code-fence');
  if (
    /(?:^|\n)[ \t]*[Oo0][ \t]*\n[ \t]*\/\|\\[ \t]*\n[ \t]*\/[ \t]+\\/u.test(text) ||
    /[┌┐└┘├┤┬┴┼─│╔╗╚╝═║]/u.test(text) ||
    /^\s*\+[-=]{3,}\+/mu.test(text) ||
    (/^\s*\|[^\n]*\|\s*\n\s*\|[^\n]*\|/mu.test(text) && !/^\s*\|?\s*:?-{3,}/mu.test(text))
  )
    issues.push('text.drawing');
  if (
    /\b(?:offer_learning|prepare_practice|context_version|client_message_id|asks_permission|prompt_lang)\b/u.test(
      text,
    )
  )
    issues.push('text.internal');
  if (
    identifiers
      .filter((id) => id.includes('_'))
      .some((id) => text.match(/[\p{L}\p{N}_]+/gu)?.includes(id))
  )
    issues.push('text.internal');
  const words = (s: string) => s.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  const source = words(system);
  const prompt = new Set(
    source.flatMap((_, i) => (i + 6 <= source.length ? [source.slice(i, i + 6).join(' ')] : [])),
  );
  const w = words(text);
  if (prompt.size && w.some((_, i) => i + 6 <= w.length && prompt.has(w.slice(i, i + 6).join(' '))))
    issues.push('text.prompt-leak');
  return [...new Set(issues)];
}
export async function inspect(
  env: TestEnv,
  l: Learner,
  turns: Turn[],
  system = '',
): Promise<Finding[]> {
  const problems: Finding[] = [];
  const messages = await env.db.query<{
    id: string;
    role: string;
    text: string;
    status: string;
    failure_code: string | null;
  }>(
    'select id, role, text, status, failure_code from buddy_messages where learner_id = $1 order by seq',
    [l.learnerId],
  );
  for (const m of messages) {
    if (m.status === 'processing' || (m.status === 'failed' && !m.failure_code))
      problems.push(finding('message.terminal', `${m.id}: ${m.status}/${m.failure_code}`));
    if (m.role === 'buddy')
      for (const inv of textViolations(m.text, system)) problems.push(finding(inv, m.text));
  }
  for (const t of turns) {
    if (!['done', 'failed'].includes(t.status) || (t.status === 'failed' && !t.code))
      problems.push(finding('stream.terminal', `${t.status}/${t.code}`));
    if (t.ms > 60_000) problems.push(finding('turn.latency', `${t.ms}ms > 60000ms`));
    for (const text of t.replies)
      for (const inv of textViolations(text, system)) problems.push(finding(inv, text, 'stream'));
  }
  const seen = await history(env, l);
  if (JSON.stringify(seen.map((m) => m.id)) !== JSON.stringify(messages.map((m) => m.id)))
    problems.push(
      finding(
        'history.complete',
        `API ${seen.length}, DB ${messages.length}`,
        'history',
        '/buddy/thread',
      ),
    );
  return problems;
}
export function visiblePairs(text: string): number {
  const lines = text.split('\n');
  const separator = (line: string) => /^\s*\|?\s*:?-{3,}/u.test(line);
  return lines.filter(
    (line, i) =>
      !separator(line) &&
      !separator(lines[i + 1] ?? '') &&
      /^\s*(?:\d+[.)]|[-*|])\s*\S.+(?: – | — | - |: |\|).+\S/u.test(line),
  ).length;
}

const refusal = z.object({
  error: z.object({
    code: z.literal('invalid_input'),
    details: z.object({ reason: z.literal('not_usable') }),
  }),
});
export function honestRefusal(error: unknown): boolean {
  return refusal.safeParse(error).success;
}

export function goalProblems(
  goal: Goal,
  messages: MessageView[],
  taps: Tap[],
  items: Array<{
    kind: string;
    prompt: string;
    answer: string;
    prompt_lang: string | null;
    lang: string | null;
  }>,
): Finding[] {
  const replies = messages.filter((m) => m.role === 'buddy');
  const reply = replies.at(-1)?.text ?? '';
  const fail = (id: string, evidence: string) => [finding(id, evidence, goal.expect)];
  if (goal.expect === 'vocab') {
    const vs = items.filter((i) => i.kind === 'vocab');
    const pairs = new Set(vs.map((i) => [i.prompt, i.answer].sort().join('\u0000')));
    if (items.some((i) => i.kind !== 'vocab'))
      return fail('vocabulary.form', items.map((i) => i.kind).join(','));
    if (pairs.size !== goal.count)
      return fail('vocabulary.count', `wanted ${goal.count}, got ${pairs.size}`);
    if (!taps.some((t) => (t.session?.items.length ?? 0) > 0))
      return fail('vocabulary.start', 'No vocabulary session was started');
    const askedItems = taps.flatMap((t) => t.session?.items.map((entry) => entry.item) ?? []);
    if (askedItems.some((i) => i.prompt_lang !== 'de' || i.lang !== 'en'))
      return fail(
        'vocabulary.direction',
        JSON.stringify(askedItems.map((i) => [i.prompt_lang, i.lang])),
      );
  }
  if (goal.expect === 'chat-vocab') {
    const counts = replies.map((m) => visiblePairs(m.text));
    if (!counts.includes(goal.count ?? 0))
      return fail(
        'vocabulary.chat-count',
        `wanted ${goal.count} visible pair rows, observed counts ${counts.join(',')}: ${reply}`,
      );
  }
  if (
    ['offer', 'photo'].includes(goal.expect) &&
    !taps.some((t) => (t.session?.items.length ?? 0) > 0)
  )
    return fail('goal.start', 'No offer started a nonempty session');
  if (
    goal.expect === 'picture' &&
    !messages.some((m) => m.actions.some((a) => /figure|picture/.test(a.summary.tool)))
  )
    return fail('picture.present', 'No validated picture action in API conversation');
  if (goal.expect === 'summary') {
    const previous = replies[0]?.text ?? '';
    const summary = replies[goal.messages.length - 1]?.text ?? reply;
    const words = summary.toLowerCase().match(/\p{L}+/gu) ?? [];
    const overlap =
      words.filter((w) => previous.toLowerCase().includes(w)).length / Math.max(1, words.length);
    if (summary.length >= previous.length * 0.85)
      return fail(
        'summary.condensation',
        `length ${summary.length}/${previous.length}, word overlap ${overlap.toFixed(2)}`,
      );
  }
  if (goal.expect === 'reminder') {
    const reminders = replies.filter((m) => m.outreach);
    if (!reminders.length)
      return fail('reminder.delivered', 'No reminder in API thread after TestClock + tick');
    if (
      reminders.some((m) =>
        m.actions.some((a) => a.summary.tool === 'offer_learning' && a.summary.startable === false),
      )
    )
      return fail('reminder.dead-card', JSON.stringify(reminders));
    if (
      !reminders.some(
        (m) =>
          m.announces?.title &&
          m.text.toLocaleLowerCase().includes(m.announces.title.toLocaleLowerCase()) &&
          (m.options?.length ||
            m.actions.some((a) => a.summary.tool === 'offer_learning' && a.summary.startable)),
      )
    )
      return fail('reminder.next-step', JSON.stringify(reminders));
  }
  if (goal.expect === 'answer' && reply.length < 30) return fail('answer.present', reply);
  return [];
}

export function photoSourceMatches(sourceItemIds: string[], startedItemIds: string[]): boolean {
  const source = new Set(sourceItemIds);
  return startedItemIds.some((id) => source.has(id));
}
