// How much does streaming save? For Buddy's chat turns and the tutor, against
// the live model: when the first bytes come, when the first words of the reply
// could be shown or spoken, when the reply is complete, and when the whole
// answer (actions and all) is there — which is when code can check and apply it.
// Needs LLM_BACKEND=vertex, GOOGLE_* variables and a local Postgres.
//   cd apps/api && npx tsx evals/stream/run.ts [rounds]

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../../src/config.js';
import type { LlmGateway, LlmRequest } from '../../src/llm/gateway.js';
import { partialString } from '../../src/llm/partial.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const real = new VertexGateway(config);

type Mark = {
  purpose: string;
  first: number;
  words: number;
  reply: number;
  total: number;
  /** The answer changes nothing (no actions, no lookups): its reply could be spoken at once. */
  safe: boolean | null;
  order: string;
};
const marks: Mark[] = [];

const gateway: LlmGateway = {
  available: true,
  async generate(req: LlmRequest) {
    const t0 = performance.now();
    const m: Mark = {
      purpose: req.purpose,
      first: NaN,
      words: NaN,
      reply: NaN,
      total: NaN,
      safe: null,
      order: '',
    };
    let raw = '';
    const res = await real.generate({
      ...req,
      onPartial: (soFar) => {
        raw = soFar;
        const now = performance.now() - t0;
        if (Number.isNaN(m.first)) m.first = now;
        const r = partialString(raw, 'reply');
        // "Words to show": a first sentence or 40 characters, whichever comes first.
        if (r && Number.isNaN(m.words) && (/[.!?]\s/.test(r.text) || r.text.length >= 40 || r.done))
          m.words = now;
        if (r?.done && Number.isNaN(m.reply)) m.reply = now;
      },
    });
    m.total = performance.now() - t0;
    const keys = [
      ...raw.matchAll(/"(lookups|actions|reply|options|asks_permission|intent|verdict)"\s*:/g),
    ].map((k) => k[1]);
    m.order = [...new Set(keys)].join('>');
    const j = res.json as { actions?: unknown[]; lookups?: unknown[] };
    if (req.purpose === 'buddy_turn') m.safe = !j.actions?.length && !j.lookups?.length;
    marks.push(m);
    return res;
  },
};

const env = await createTestEnv({ start: '2026-09-28T13:30:00Z', gateway });
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});

const rounds = Number(process.argv[2] ?? 2);
for (let round = 0; round < rounds; round++) {
  for (const text of [
    'hi',
    'was ist nochmal ein nenner',
    'am donnerstag schreib ich englisch vokabeltest',
    'kannst du mir erklären wie man brüche addiert',
  ]) {
    const r = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text,
    });
    if (r.status !== 200) console.log('chat', r.status);
  }
  const s = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: crypto.randomUUID(),
    kind: 'practice',
    text: 'Brüche addieren, Klasse 6',
  });
  const open = s.body.items.find((i) => i.status === 'open');
  if (open)
    for (const say of ['keine ahnung', 'warum muss der nenner gleich sein?']) {
      await l.api.post(`/practice/sessions/${s.body.id}/answer`, {
        client_turn_id: crypto.randomUUID(),
        item_id: open.item.id,
        text: say,
      });
    }
}

const fmt = (n: number) => (Number.isNaN(n) ? '   –' : String(Math.round(n)).padStart(5));
console.log('purpose      first  words  reply  total  (ms)  safe  order');
for (const m of marks.filter((x) => x.purpose === 'buddy_turn' || x.purpose === 'tutor'))
  console.log(
    `${m.purpose.padEnd(11)} ${fmt(m.first)} ${fmt(m.words)} ${fmt(m.reply)} ${fmt(m.total)}       ${m.safe === null ? '–' : m.safe ? 'yes' : 'no '}   ${m.order}`,
  );
const med = (xs: number[]) => {
  const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};
for (const p of ['buddy_turn', 'tutor']) {
  const ms = marks.filter((x) => x.purpose === p);
  console.log(
    `median ${p}: words ${fmt(med(ms.map((x) => x.words)))} · reply ${fmt(med(ms.map((x) => x.reply)))} · total ${fmt(med(ms.map((x) => x.total)))}`,
  );
}
await env.close();
