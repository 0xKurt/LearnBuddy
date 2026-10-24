// Full Buddy → offered vocabulary → tap journey on the EU model and real test Postgres.
// requires live verification in Claude Code session
import { appendFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { loadConfig } from '../../src/config.js';
import { llmGateway } from '../../src/production.js';
import type { LlmGateway } from '../../src/llm/gateway.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  LLM_BACKEND: 'openai',
  OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const real = llmGateway(config);
let calls = 0;
let costMicros = 0;
const models = new Set<string>();
const versions = new Set<string>();
const gateway: LlmGateway = {
  ...real,
  async generate(request) {
    if (calls >= 24 || costMicros >= 1_500_000)
      throw new Error('Vocabulary evaluation budget reached');
    calls++;
    versions.add(request.promptVersion);
    const result = await real.generate(request);
    costMicros += result.usage.costMicros;
    models.add(result.usage.model);
    return result;
  },
};
const cases = [
  {
    id: 'known-list',
    message: 'Frag mich diese Vokabeln ab: the kitchen – die Küche; the room – das Zimmer',
    count: 2,
    lang: 'en',
  },
  { id: 'unknown-list', message: 'Frag mich meine Vokabeln aus Unit 3 ab.', count: 0, lang: 'en' },
  {
    id: 'topic-en-both',
    message:
      'Denk dir 20 englische Basisvokabeln zur Wohnung aus, mit deutscher Übersetzung. Frag mich in beide Richtungen ab.',
    count: 20,
    lang: 'en',
  },
  {
    id: 'topic-fr-produce',
    message:
      'Ich bin in Klasse 6. Denk dir 20 französische Basisvokabeln zur Wohnung aus. Zeig mir Deutsch, ich schreibe Französisch.',
    count: 20,
    lang: 'fr',
  },
  {
    id: 'topic-en-chat',
    message:
      'Schick mir hier im Chat 20 englische Basisvokabeln zur Wohnung mit deutscher Übersetzung.',
    count: 20,
    lang: 'en',
  },
];
const results: unknown[] = [];
let failures = 0;
try {
  const selected = cases.filter(
    (c) => process.argv.length <= 2 || process.argv.slice(2).includes(c.id),
  );
  const repeats = Math.max(1, Math.min(3, Number(process.env.VOCAB_EVAL_REPEATS ?? 1)));
  for (const c of selected.flatMap((c) => Array.from({ length: repeats }, () => c))) {
    const env = await createTestEnv({ gateway });
    try {
      const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
      await env.db.query("update learners set level = 'school', grade = 6 where id = $1", [
        l.learnerId,
      ]);
      const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: randomUUID(),
        text: c.message,
      });
      await env.flushBackground();
      const last = sent.body.home.thread.filter((m) => m.role === 'buddy').at(-1);
      const action = last?.actions.find((a) => a.summary.tool === 'offer_learning');
      const problems: string[] = [];
      if (sent.body.status !== 'done') problems.push(`turn ${sent.body.status}`);
      let session: SessionView | null = null;
      if (c.count === 0) {
        if (action) problems.push('unknown list invented');
        if (!/[?]|schick|schreib|sende|lade/iu.test(last?.text ?? ''))
          problems.push('no clarification');
      } else if (
        !action ||
        action.summary.tool !== 'offer_learning' ||
        action.summary.kind !== 'vocab'
      )
        problems.push('missing vocab offer');
      else {
        if (action.summary.vocabulary?.output !== (c.id.endsWith('chat') ? 'chat' : 'practice'))
          problems.push('wrong output mode');
        const languages = [
          action.summary.vocabulary?.prompt_lang,
          action.summary.vocabulary?.lang,
        ].sort();
        if (languages.join('/') !== ['de', c.lang].sort().join('/'))
          problems.push('wrong languages');
        const tapped = await l.api.post<SessionView>('/practice/topic', {
          client_request_id: action.id,
          kind: 'vocab',
          text: action.summary.text,
        });
        if (tapped.status !== 201) problems.push(`tap ${tapped.status}`);
        else {
          session = tapped.body;
          const count = c.id.endsWith('produce') ? c.count : c.count * 2;
          if (session.items.length !== count)
            problems.push(`cards ${session.items.length} != ${count}`);
          if (
            c.id.endsWith('produce') &&
            session.items.some((i) => i.item.prompt_lang !== 'de' || i.item.lang !== c.lang)
          )
            problems.push('wrong production direction');
          if (session.items.some((i) => i.item.kind !== 'vocab'))
            problems.push('non-vocabulary card');
        }
        if (c.id.endsWith('chat') && last?.text.split('\n').length !== c.count)
          problems.push('chat list missing or incomplete');
      }
      const pairs = await env.db.query(
        'select prompt, answer, accepted_answers, prompt_lang, lang, origin from items where learner_id = $1 order by created_at, id',
        [l.learnerId],
      );
      if (pairs.length !== c.count * 2) problems.push('wrong stored inventory size');
      if (c.count && pairs.some((p) => p.origin !== (c.id === 'known-list' ? 'typed' : 'buddy')))
        problems.push('wrong provenance');
      const usage = await env.db.one<{ cost: number }>(
        'select coalesce(sum(cost_micros),0)::int as cost from llm_calls',
      );
      const result = {
        id: c.id,
        problems,
        reply: last?.text,
        offer: action?.summary,
        cards: session?.items.length,
        pairs,
        costMicros: usage.cost,
      };
      results.push(result);
      failures += problems.length > 0 ? 1 : 0;
      console.log(JSON.stringify(result));
    } finally {
      await env.close();
    }
  }
} finally {
  writeFileSync(
    process.env.VOCAB_EVAL_OUT ?? 'vocabulary-eval.json',
    JSON.stringify(
      { calls, costMicros, models: [...models], versions: [...versions], results },
      null,
      2,
    ),
  );
  appendFileSync(
    `${homedir()}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`,
    `\n${new Date().toISOString()} | vocab-topic | #940 | ${calls} | ${(costMicros / 1e6).toFixed(6)} | topic vocabulary EU evaluation\n`,
  );
}
process.exitCode = failures ? 1 : 0;
