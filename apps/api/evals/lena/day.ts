// "Lena's week": a 12-year-old (grade 6) talks to Buddy the way kids write —
// short, typos, no punctuation, mixed topics — against the live model.
// Prints every reply and what Buddy did, for a person to judge.
// Needs LLM_BACKEND=vertex, GOOGLE_* variables and a local Postgres.
//   cd apps/api && npx tsx evals/lena/day.ts

import type {
  AnswerResponse,
  BuddyHome,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
// Monday 28 Sep 2026, 15:30 in Berlin – after school.
const env = await createTestEnv({
  start: '2026-09-28T13:30:00Z',
  gateway: new VertexGateway(config),
});
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});

const messages = [
  'hi',
  'ich bin in der 6c',
  'am donnerstag schreiben wir englisch vokabeltest unit 2',
  'und nächste woche mittwoch mathe arbeit brüche',
  'ich hab kein bock auf mathe',
  'was ist nochmal der unterschied zwischen zähler und nenner',
  'kannst du mich die englisch vokabeln abfragen? house haus, garden garten, kitchen küche, bedroom schlafzimmer',
  'hausaufgabe: berechne 2/3 + 1/4. ich check es nicht',
  'sag einfach die lösung bitteee',
  'morgen kann ich nicht bin bei oma',
  'erinner mich mittwoch um 17 uhr an vokabeln',
  'danke du bist cool',
];
for (const text of messages) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: crypto.randomUUID(),
    text,
  });
  const h: BuddyHome = res.body.home;
  const reply = [...h.thread].reverse().find((m) => m.role === 'buddy');
  const actions =
    reply?.actions.map((a) => {
      const s = a.summary as { tool: string; [k: string]: unknown };
      const detail = Object.entries(s)
        .filter(([k]) => !['tool', 'step_id', 'goal_id', 'memory_id'].includes(k))
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      return `${s.tool}(${detail})`;
    }) ?? [];
  console.log(
    `\nLena: ${text}\nBuddy: ${reply?.text ?? `(${res.body.status} ${res.body.error_code ?? ''})`}${reply?.options ? `\n  options: ${reply.options.join(' | ')}` : ''}${actions.length ? `\n  did: ${actions.join('; ')}` : ''}`,
  );
}
// She taps the offers Buddy made and works through them like a kid would.
const offers: Array<{ kind: string; text: string }> = [];
for (const m of (await l.api.get<BuddyHome>('/buddy')).body.thread) {
  for (const a of m.actions) {
    const s = a.summary as { tool: string; kind?: string; text?: string };
    if (s.tool === 'offer_learning' && s.kind && s.text)
      offers.push({ kind: s.kind, text: s.text });
  }
}
const lenaAnswers: Record<string, string[]> = {
  explain: ['keine ahnung', 'der nenner ist unten', 'der zähler zählt die teile die man hat'],
  vocab: ['haus', 'gardn', 'küche', 'schlafzimer', 'house'],
  help: ['weiß nicht', '3/7', 'hä wieso', 'ok also gleicher nenner 12', '8/12 + 3/12 = 11/12'],
};
for (const o of offers) {
  const s = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: crypto.randomUUID(),
    kind: o.kind,
    text: o.text,
  });
  if (s.status !== 201) {
    console.log(`\n### ${o.kind}: start failed ${s.status} ${JSON.stringify(s.body)}`);
    continue;
  }
  const v = s.body;
  console.log(
    `\n### ${o.kind} "${v.title}" (${v.mode})${v.intro ? `\n  Erklärung: ${v.intro}` : ''}`,
  );
  const answers = [...(lenaAnswers[o.kind] ?? [])];
  let view = v;
  while (answers.length > 0) {
    const open = view.items.find((i) => i.status === 'open');
    if (!open) break;
    const text = answers.shift()!;
    const r = await l.api.post<AnswerResponse>(`/practice/sessions/${v.id}/answer`, {
      client_turn_id: crypto.randomUUID(),
      item_id: open.item.id,
      text,
    });
    console.log(
      `  Q: ${open.item.prompt}${open.item.choices ? ` {${open.item.choices.join(' | ')}}` : ''}\n    Lena: ${text}\n    Buddy [${r.body.verdict}]: ${r.body.reply?.text ?? JSON.stringify(r.body)}`,
    );
    view = r.body.session ?? view;
  }
}

const home = (await l.api.get<BuddyHome>('/buddy')).body;
console.log('\n--- home ---');
console.log('now:', JSON.stringify(home.now));
console.log(
  'next:',
  home.next
    .map(
      (n) =>
        `${n.kind} ${n.title} ${n.date ?? ''} ${n.time ?? ''}${n.agreed ? ' (abgemacht)' : ''}`,
    )
    .join(' | '),
);
await env.close();
