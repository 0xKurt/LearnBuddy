// Do the questions fit the sheet and the class? (issue #77)
//
// The complaint this exists for came from the owner's daughter: "dann wurden sachen
// abgefragt, womit sie nichts anfangen konnte". Integration tests pin the mechanism
// (#58); this checks the *content*, live: a real worksheet is rendered and photographed
// the way the app does it, the practice is prepared from it, and every question is then
// judged by a second model pass against a rubric — on the sheet's topics, answerable from
// the sheet, right for the class, one correct answer, clean German.
//
// The judge never sees the sheet's questions as "the truth": it sees the sheet's text and
// the new question, and answers a fixed schema. A question it cannot place is a finding,
// not a crash.
//
//   cd apps/api
//   LLM_BACKEND=vertex GOOGLE_CLOUD_PROJECT=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     npx tsx evals/content/run.ts [case-id …]      (CONTENT_OUT=report.md)
//
// Needs a local Postgres (LB_TEST_DATABASE_URL) and Chromium (LB_CHROMIUM, else
// Playwright's own).
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { chromium } from '@playwright/test';
import { z } from 'zod';

import { loadConfig } from '../../src/config.js';
import type { LlmGateway } from '../../src/llm/gateway.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const dotenv = await import('dotenv');
dotenv.config({ path: '.env.local' });

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const vertex = new VertexGateway(config);
/** What the model answered for the steps this eval judges — printed when something fails. */
const seen: { purpose: string; json?: unknown; error?: string }[] = [];
const gateway: LlmGateway = {
  available: true,
  async generate(req) {
    try {
      const res = await vertex.generate(req);
      seen.push({ purpose: req.purpose, json: res.json });
      return res;
    } catch (err) {
      seen.push({ purpose: req.purpose, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },
};

// ─────────────── the sheets ───────────────

type Case = {
  id: string;
  /** What the sheet is, for the report. */
  title: string;
  /** Class and age the sheet belongs to. */
  grade: number;
  birthDate: string;
  /** The sheet, as HTML (rendered and photographed like a real page). */
  html: string;
  /** What the learner asks for afterwards. */
  ask: string;
};

const CASES: Case[] = [
  {
    id: 'math-fractions',
    title: 'Mathe 6: Brüche kürzen und vergleichen',
    grade: 6,
    birthDate: '2014-02-10',
    html: `
      <h2>Brüche – Arbeitsblatt 3</h2>
      <p><b>1.</b> Kürze so weit wie möglich: a) 6/8 &nbsp; b) 9/12 &nbsp; c) 14/21</p>
      <p><b>2.</b> Welcher Bruch ist größer? a) 2/3 oder 3/5 &nbsp; b) 5/8 oder 1/2</p>
      <p><b>3.</b> Schreibe als gemischte Zahl: a) 7/4 &nbsp; b) 11/3</p>
      <p><b>4.</b> Lisa isst 3/8 einer Pizza, Tom 1/4. Wer isst mehr?</p>`,
    ask: 'Mach mir ähnliche Aufgaben zu dem Blatt',
  },
  {
    id: 'german-cases',
    title: 'Deutsch 6: Die vier Fälle',
    grade: 6,
    birthDate: '2014-02-10',
    html: `
      <h2>Die vier Fälle</h2>
      <p>Nominativ (Wer oder was?), Genitiv (Wessen?), Dativ (Wem?), Akkusativ (Wen oder was?).</p>
      <p><b>1.</b> Bestimme den Fall: a) Der Hund bellt. b) Ich helfe dem Kind.
         c) Das Fahrrad des Nachbarn ist neu. d) Wir sehen den Film.</p>
      <p><b>2.</b> Setze ein: Ich schenke ___ (meine Schwester) ein Buch.</p>
      <p><b>3.</b> Frage nach dem unterstrichenen Wort: Die Katze <u>der Nachbarin</u> schläft.</p>`,
    ask: 'Ich will das nochmal üben',
  },
];

// ─────────────── the judge ───────────────

const Verdict = z.object({
  on_sheet: z
    .boolean()
    .describe(
      'true if the question is about a topic the SHEET teaches. Other numbers, other words or ' +
        'another example of the same kind of task are expected — only a different topic is false',
    ),
  answerable: z
    .boolean()
    .describe('true if a student who understood the SHEET can answer it with what it teaches'),
  right_level: z.boolean().describe('true if it fits the class named in CLASS'),
  one_answer: z.boolean().describe('true if the given answer is correct and the only correct one'),
  language_ok: z
    .boolean()
    .describe('true if the German is correct and a 12-year-old understands it'),
  why: z.string().max(200).describe('One short German sentence: what is wrong, or why it is fine'),
});
const VERDICT_SCHEMA = toJsonSchema(Verdict);

const JUDGE = `You check practice questions a learning app made from a photographed worksheet.
You see the SHEET (its text as the app read it), the CLASS, and one QUESTION with its ANSWER.
The app is asked for *more of the same*, so a question with other numbers, other words or
another example of a task type the sheet has is exactly right — that is the point, not a
finding. What is a finding: a topic the sheet does not teach, a step the sheet never showed,
a level the class has not reached, a wrong or ambiguous answer, or German a 12-year-old
stumbles over. Judge only this question, against the schema.
Answer with the JSON object described by the schema.`;

async function judge(
  sheet: string,
  grade: number,
  question: { prompt: string; answer: string },
): Promise<z.infer<typeof Verdict>> {
  const res = await vertex.generate({
    purpose: 'buddy_check',
    tier: 'smart',
    promptVersion: 'content-eval.v1',
    system: JUDGE,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `CLASS: ${grade}\nSHEET:\n${sheet}\n\nQUESTION: ${question.prompt}\nANSWER: ${question.answer}`,
          },
        ],
      },
    ],
    schema: VERDICT_SCHEMA,
    maxOutputTokens: 500,
    temperature: 0,
    timeoutMs: 45_000,
    thinkingBudget: 0,
  });
  return Verdict.parse(res.json);
}

// ─────────────── one sheet, end to end ───────────────

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
async function render(html: string): Promise<Uint8Array> {
  browser ??= await chromium.launch(
    process.env.LB_CHROMIUM ? { executablePath: process.env.LB_CHROMIUM } : {},
  );
  const page = await browser.newPage({ viewport: { width: 820, height: 1100 } });
  await page.setContent(
    `<body style="font-family: 'DejaVu Sans', sans-serif; padding: 40px; background: #fdfdf8; font-size: 22px; line-height: 1.5">${html}</body>`,
  );
  const shot = await page.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  return new Uint8Array(shot);
}

type Finding = {
  /** Which half this question came from: the sheet itself, or what the model wrote from it. */
  stage: 'vom Blatt' | 'mehr davon';
  prompt: string;
  answer: string;
  verdict: z.infer<typeof Verdict>;
};

/**
 * What the two speed issues are judged on (#219, #220). Both trade a model call's shape for
 * time, so the eval that checks the CONTENT also records the time — otherwise the two halves
 * of the acceptance are measured in two different runs against two different sheets.
 *
 * `order` is the order the model actually wrote its fields in: `JSON.parse` keeps a JSON
 * object's key order, so this is the model's own emission order, not what the schema asked
 * for. It is the one honest check that reordering the schema reached the model at all.
 */
type Measured = {
  id: string;
  /** Wall-clock from "the photo is in" to the sheet being readable (the whole background read). */
  readMs: number;
  /** Wall-clock of POST /practice/topic — what she waits for before the first question. */
  topicMs: number;
  /** Characters of transcript the reading stored. */
  transcriptChars: number;
  /**
   * What each part of the reading's answer COST to write, as its share of the whole answer in
   * characters. The decisive number for #219: a call that is not streamed hands its answer
   * back when the last token is written, so moving a field forward can only ever save the
   * time of what now comes after it — and that is this share, not the whole wait.
   */
  share: { transcript: number; items: number; rest: number } | null;
  /** The order the extraction answer's fields arrived in. */
  order: string[];
  calls: { purpose: string; latencyMs: number; outputTokens: number; costMicros: number }[];
};

const measured: Measured[] = [];

/** The three parts of a reading's answer by the characters they took to write. */
function shareOf(json: unknown): Measured['share'] {
  if (!json || typeof json !== 'object') return null;
  const whole = JSON.stringify(json).length;
  const o = json as { extracted_text?: unknown; items?: unknown };
  const transcript =
    typeof o.extracted_text === 'string' ? JSON.stringify(o.extracted_text).length : 0;
  const items = o.items === undefined ? 0 : JSON.stringify(o.items).length;
  return {
    transcript: transcript / whole,
    items: items / whole,
    rest: (whole - transcript - items) / whole,
  };
}

/** The purposes whose timing the two issues are about; everything else is noise here. */
const TIMED = ['extraction', 'explain'];

async function runCase(c: Case): Promise<{ findings: Finding[]; log: string[] }> {
  const log: string[] = [];
  const env = await createTestEnv({ start: '2026-09-29T14:00:00Z', gateway });
  const before = seen.length;
  let readMs = 0;
  let topicMs = 0;
  let transcript = '';
  try {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: c.birthDate });
    const created = await l.api.post<{
      material: { id: string };
      uploads: { path: string }[];
    }>('/materials', {
      client_request_id: crypto.randomUUID(),
      photo_mimes: ['image/jpeg'],
      sending: true,
    });
    if (created.status !== 201) throw new Error(`create ${created.status}`);
    env.storage.put(created.body.uploads[0]!.path, await render(c.html));
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    const readStarted = performance.now();
    await env.flushBackground();
    readMs = performance.now() - readStarted;
    const material = await l.api.get<{ status: string; title: string | null; item_count: number }>(
      `/materials/${created.body.material.id}`,
    );
    log.push(
      `- gelesen: **${material.body.title ?? '—'}** (${material.body.status}, ${material.body.item_count} Fragen vom Blatt)`,
    );
    if (material.body.status !== 'ready') throw new Error(`sheet ${material.body.status}`);

    // What the sheet says, as the app stored it — the judge sees exactly this.
    const sheet = await env.db.one<{ extracted_text: string }>(
      `select coalesce(extracted_text, '') as extracted_text from materials where id = $1`,
      [created.body.material.id],
    );
    transcript = sheet.extracted_text;

    /** The right answers live in the database; the app never sees them, the judge must. */
    const answersOf = (ids: string[]) =>
      env.db.query<{ prompt: string; answer: string | null }>(
        `select prompt, answer from items where id = any($1::uuid[])`,
        [ids],
      );

    // 1 · The sheet's own questions, as the app read them.
    const fromSheet = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    if (fromSheet.status !== 201 && fromSheet.status !== 200)
      throw new Error(
        `sheet practice ${fromSheet.status} ${JSON.stringify(fromSheet.body).slice(0, 200)}`,
      );
    const sheetIds = fromSheet.body.items.map((i) => i.item.id);
    log.push(`- Übung vom Blatt: **${fromSheet.body.title}** · ${sheetIds.length} Fragen`);

    // 2 · "Mehr davon": the questions the model *writes* from that session (issue #58 lives here).
    const topicStarted = performance.now();
    const more = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind: 'practice',
      text: c.ask,
      from_session_id: fromSheet.body.id,
    });
    topicMs = performance.now() - topicStarted;
    if (more.status !== 201 && more.status !== 200)
      throw new Error(`more ${more.status} ${JSON.stringify(more.body).slice(0, 200)}`);
    // A practice run starts on its first questions and the rest of the same answer follows
    // (issue #220) — so what `topicMs` measured is what SHE waits for, and the whole set is only
    // there once the background work has run. Judged is the whole set, as she will see it.
    await env.flushBackground();
    const grown = await l.api.get<SessionView>(`/practice/sessions/${more.body.id}`);
    if (grown.status !== 200) throw new Error(`more (grown) ${grown.status}`);
    const moreIds = grown.body.items.map((i) => i.item.id);
    log.push(
      `- Mehr davon: **${grown.body.title}** · ${more.body.items.length} Fragen sofort, ` +
        `${moreIds.length} am Ende`,
    );

    const findings: Finding[] = [];
    for (const [stage, ids] of [
      ['vom Blatt', sheetIds],
      ['mehr davon', moreIds],
    ] as const) {
      for (const item of await answersOf([...ids])) {
        const answer = item.answer ?? '';
        const verdict = await judge(sheet.extracted_text, c.grade, { prompt: item.prompt, answer });
        findings.push({ stage, prompt: item.prompt, answer, verdict });
      }
    }
    return { findings, log };
  } finally {
    await env.flushBackground().catch(() => undefined);
    // The measurement, before the throwaway database goes: an aborted case still says how
    // long the reading took and in which order the model wrote its answer.
    const extraction = seen.slice(before).find((s) => s.purpose === 'extraction');
    measured.push({
      id: c.id,
      readMs,
      topicMs,
      transcriptChars: transcript.length,
      share: shareOf(extraction?.json),
      order:
        extraction?.json && typeof extraction.json === 'object'
          ? Object.keys(extraction.json as Record<string, unknown>)
          : [],
      calls: (
        await env.db
          .query<{
            purpose: string;
            latency_ms: number;
            output_tokens: number;
            cost_micros: number;
          }>(
            `select purpose, latency_ms, output_tokens, cost_micros from llm_calls
              where purpose = any($1) order by created_at`,
            [TIMED],
          )
          .catch(() => [])
      ).map((r) => ({
        purpose: r.purpose,
        latencyMs: Number(r.latency_ms),
        outputTokens: Number(r.output_tokens),
        costMicros: Number(r.cost_micros),
      })),
    });
    await env.close();
  }
}

// ─────────────── run ───────────────

const only = process.argv.slice(2);
const chosen = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
const out: string[] = [`# Inhalts-Eval (live, ${new Date().toISOString().slice(0, 16)})`, ''];
let ok = 0;
let total = 0;
/** Findings per half: the reading's questions (#219) and the generator's (#220), kept apart. */
const byStage = new Map<Finding['stage'], { ok: number; total: number }>([
  ['vom Blatt', { ok: 0, total: 0 }],
  ['mehr davon', { ok: 0, total: 0 }],
]);

for (const c of chosen) {
  out.push(`## ${c.title}`, '');
  let log: string[] = [];
  let findings: Finding[] = [];
  try {
    ({ findings, log } = await runCase(c));
  } catch (err) {
    console.log(`✗ ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    // What the model actually answered on the way — otherwise a 503 says nothing.
    for (const s of seen.slice(-3))
      console.log(`    · ${s.purpose}: ${s.error ?? JSON.stringify(s.json).slice(0, 300)}`);
    out.push(`**Abbruch:** ${err instanceof Error ? err.message : String(err)}`, '');
    total += 1;
    continue;
  }
  out.push(...log, '');
  for (const f of findings) {
    const v = f.verdict;
    const good = v.on_sheet && v.answerable && v.right_level && v.one_answer && v.language_ok;
    total += 1;
    if (good) ok += 1;
    const stage = byStage.get(f.stage)!;
    stage.total += 1;
    if (good) stage.ok += 1;
    const flags = [
      v.on_sheet ? null : 'nicht vom Blatt',
      v.answerable ? null : 'nicht beantwortbar',
      v.right_level ? null : 'falsche Stufe',
      v.one_answer ? null : 'Antwort fraglich',
      v.language_ok ? null : 'Sprache',
    ].filter(Boolean);
    out.push(
      `- ${good ? '✓' : '✗'} *(${f.stage})* **${f.prompt}** → \`${f.answer}\`${flags.length ? ` — *${flags.join(', ')}*` : ''}`,
      `  - ${v.why}`,
    );
  }
  out.push('');
  const caseOk = findings.filter(
    (f) =>
      f.verdict.on_sheet &&
      f.verdict.answerable &&
      f.verdict.right_level &&
      f.verdict.one_answer &&
      f.verdict.language_ok,
  ).length;
  console.log(`${caseOk === findings.length ? '✓' : '✗'} ${c.id}: ${caseOk}/${findings.length}`);
  for (const f of findings) {
    const v = f.verdict;
    if (!(v.on_sheet && v.answerable && v.right_level && v.one_answer && v.language_ok))
      console.log(`    ✗ ${f.prompt} — ${v.why}`);
  }
}

await (browser as { close: () => Promise<void> } | null)?.close();
out.push('', `**${ok}/${total} Fragen ohne Befund**`);

// ─────────────── the measurement (#219, #220) ───────────────
//
// Split by stage, because the two issues sit in two different calls: "vom Blatt" is what the
// reading wrote (#219), "mehr davon" what the generator wrote (#220). One number over both
// would hide a trade in one of them.
out.push('', '## Messung', '');
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
out.push(
  '| Blatt | Lesen (Wand) | Übung starten (Wand) | Abschrift | Anteil Abschrift | Anteil Fragen | Feldreihenfolge |',
);
out.push('|---|---|---|---|---|---|---|');
for (const m of measured) {
  out.push(
    `| ${m.id} | ${(m.readMs / 1000).toFixed(2)}s | ${(m.topicMs / 1000).toFixed(2)}s | ` +
      `${m.transcriptChars} Zeichen | ${m.share ? pct(m.share.transcript) : '—'} | ` +
      `${m.share ? pct(m.share.items) : '—'} | ${m.order.join(', ') || '—'} |`,
  );
}
out.push('', '| Blatt | Purpose | Latenz | Out-Tokens | Kosten |', '|---|---|---|---|---|');
let costMicros = 0;
for (const m of measured) {
  for (const call of m.calls) {
    costMicros += call.costMicros;
    out.push(
      `| ${m.id} | ${call.purpose} | ${(call.latencyMs / 1000).toFixed(2)}s | ` +
        `${call.outputTokens} | ${(call.costMicros / 10_000).toFixed(3)} ct |`,
    );
  }
}
out.push(
  '',
  `Die gemessenen Aufrufe kosteten ${(costMicros / 10_000).toFixed(2)} ct ` +
    `(ohne die ${total} Urteile des Richters).`,
);
out.push('', '| Stufe | ohne Befund |', '|---|---|');
for (const [stage, n] of byStage)
  out.push(`| ${stage} | ${n.ok}/${n.total}${stage === 'vom Blatt' ? ' (#219)' : ' (#220)'} |`);

if (process.env.CONTENT_OUT) writeFileSync(process.env.CONTENT_OUT, `${out.join('\n')}\n`);
for (const [stage, n] of byStage) console.log(`${stage}: ${n.ok}/${n.total} ohne Befund`);
for (const m of measured)
  console.log(
    `${m.id}: lesen ${(m.readMs / 1000).toFixed(2)}s · starten ${(m.topicMs / 1000).toFixed(2)}s · ` +
      `Abschrift ${m.transcriptChars} (${m.share ? pct(m.share.transcript) : '—'}) · ` +
      `Fragen ${m.share ? pct(m.share.items) : '—'} · Reihenfolge ${m.order.slice(0, 7).join(',')}`,
  );
console.log(`\n${ok}/${total} Fragen ohne Befund`);
// A sheet that could not be read at all, or questions that miss it, must fail the run.
process.exit(total > 0 && ok === total ? 0 : 1);
