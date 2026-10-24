// Live API check of the main answer forms. Generation, hints, tutor and safeguarding are real;
// auth/storage are local test adapters and each learner has a throwaway shared-Postgres database.
// The stored key verifies submission plumbing, NOT independent subject correctness. Inspect the
// printed prompts/keys too. Essay and audio pronunciation have their own broader evals.
// requires live verification in Claude Code session
import { writeFileSync } from 'node:fs';
import type {
  AnswerResponse,
  ItemKind,
  SessionView,
  StartTopicRequest,
} from '@learnbuddy/shared-types/contracts';
import { loadConfig } from '../../src/config.js';
import { llmGateway } from '../../src/production.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { keyedParts } from './answers.js';

const cases: Array<{ form: ItemKind; kind?: StartTopicRequest['kind']; text: string }> = [
  {
    form: 'short',
    text: 'Frag mich nach einzelnen Fachbegriffen zur Zelle, die Antwort soll ein einzelnes Wort sein.',
  },
  { form: 'long', text: 'Ich möchte in eigenen Worten erklären, warum Pflanzen Licht brauchen.' },
  {
    form: 'numeric',
    text: 'Lass mich einfache Flächeninhalte von Rechtecken berechnen, nur Zahlen eingeben.',
  },
  {
    form: 'multiple_choice',
    text: 'Gib mir Fragen zum römischen Reich mit jeweils vier Antworten zum Ankreuzen, genau eine richtig.',
  },
  {
    form: 'formula',
    text: 'Übe mit mir Terme ausmultiplizieren, ich möchte als Antwort einen Term mit x eingeben.',
  },
  {
    form: 'vocab',
    kind: 'vocab',
    text: 'la chambre - das Zimmer\nle lit - das Bett\nla porte - die Tür',
  },
  {
    form: 'spelling_dictation',
    kind: 'spelling_dictation',
    text: 'Diktiere mir kurze deutsche Wörter mit ie, Klasse 5.',
  },
  {
    form: 'order',
    text: 'Ich möchte die Schritte der Keimung in die richtige Reihenfolge bringen.',
  },
  {
    form: 'match',
    text: 'Ich möchte englische Wörter ihren deutschen Übersetzungen als Paare zuordnen.',
  },
  { form: 'table_fill', text: 'Ich möchte die Lücken einer Wertetabelle zu y=2x+1 ausfüllen.' },
  {
    form: 'cloze',
    text: 'Gib mir einen Lückentext mit Verben im Perfekt, vier Lücken zum Ausfüllen.',
  },
  {
    form: 'select_all',
    text: 'Ich möchte alle Primzahlen aus mehreren vorgegebenen Zahlen ankreuzen. Mehrere Antworten sollen richtig sein.',
  },
  {
    form: 'mark',
    text: 'Ich möchte die Nomen in einem kleingeschriebenen Satz durch Antippen markieren.',
  },
  {
    form: 'find_error',
    text: 'Ich möchte in einem vorgerechneten Rechenweg zu einer linearen Gleichung die falsche Zeile finden und verbessern.',
  },
  {
    form: 'column_calc',
    text: 'Lass mich 358 plus 267 schriftlich in Spalten mit Überträgen rechnen.',
  },
  {
    form: 'grid_draw',
    text: 'Ich möchte drei vorgegebene Punkte in ein Koordinatensystem einzeichnen.',
  },
];
const config = loadConfig(process.env);
if (config.LLM_BACKEND === 'disabled') throw new Error('A live backend is required');
const gateway = llmGateway(config);
const results: object[] = [];
let failed = 0;
for (const c of cases.filter((c) => !process.argv[2] || process.argv.slice(2).includes(c.form))) {
  const env = await createTestEnv({ gateway, start: '2026-10-24T13:00:00Z' });
  try {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-03-10' });
    await env.db.query("update learners set level='school', grade=8 where id=$1", [l.learnerId]);
    const made = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind: c.kind ?? 'practice',
      text: c.text,
    });
    await env.flushBackground();
    if (made.status !== 201)
      throw new Error(`generation ${made.status}: ${JSON.stringify(made.body)}`);
    const session = (await l.api.get<SessionView>(`/practice/sessions/${made.body.id}`)).body;
    const si = session.items.find((i) => i.item.kind === c.form);
    if (!si)
      throw new Error(
        `Requested ${c.form}; received ${session.items.map((i) => i.item.kind).join(', ')}`,
      );
    const key = await env.db.one<{ answer: string; correct_choice: number | null; task: unknown }>(
      'select answer, correct_choice, task from items where id=$1',
      [si.item.id],
    );
    const parts = keyedParts(key.task);
    const answer = await l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: crypto.randomUUID(),
      item_id: si.item.id,
      ...(parts
        ? { parts }
        : key.correct_choice !== null
          ? { choice: key.correct_choice }
          : { text: key.answer }),
    });
    const row = {
      form: c.form,
      prompt: si.item.prompt,
      key,
      status: answer.status,
      verdict: answer.body.verdict,
      reply: answer.body.reply,
    };
    results.push(row);
    if (answer.status !== 200 || answer.body.verdict !== 'correct') failed++;
    console.log(JSON.stringify(row));
  } catch (error) {
    failed++;
    const row = { form: c.form, error: String(error) };
    results.push(row);
    console.log(JSON.stringify(row));
  } finally {
    await env.close();
  }
}
if (process.env.FORMS_OUT) writeFileSync(process.env.FORMS_OUT, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} forms generated and answered correctly`);
process.exitCode = failed ? 1 : 0;
