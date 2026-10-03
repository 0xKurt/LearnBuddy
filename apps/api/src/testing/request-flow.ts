// One scripted journey that touches every model call a photographed sheet causes (issue #284):
// read the sheet (extraction + figures + the background check), a practice test for the planned
// test it belongs to (explain, sheet-bound), four prose answers to its questions (tutor) and one
// message to Buddy (buddy_turn). The model is scripted; everything else — routes, database, the
// request builders — is the real app, so what `env.llm.calls` holds afterwards is exactly what
// would have gone to Vertex.
//
// Used twice: `__tests__/request-duplication.int.test.ts` pins what each request may carry only
// once, and `evals/requests/measure.ts` prints the sizes per call type from the same journey.
// requires live verification in Claude Code session (needs a running Postgres; model scripted)

import { randomUUID } from 'node:crypto';

import type { MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import sharp from 'sharp';

import type { LlmRequest } from '../llm/gateway.js';
import type { Learner, TestEnv } from './harness.js';

/**
 * A worksheet's transcription the size Recherche 2 measured with (943 characters, issue #279):
 * fractions, numbers and slashes, the densest German text the app sends.
 */
export const JOURNEY_SHEET_TEXT = [
  'Arbeitsblatt 4 — Brüche kürzen und erweitern (Klasse 6)',
  'Merke: Beim Kürzen teilst du Zähler und Nenner durch dieselbe Zahl. Der Wert des Bruches bleibt gleich.',
  'Beim Erweitern multiplizierst du Zähler und Nenner mit derselben Zahl.',
  '1. Kürze so weit wie möglich: a) 6/8 b) 12/18 c) 25/100 d) 14/21',
  '2. Erweitere auf den Nenner 24: a) 3/4 b) 5/6 c) 7/8 d) 1/3',
  '3. Erkläre mit eigenen Worten, warum 3/4 und 15/20 denselben Wert haben.',
  '4. Lisa sagt: „Wenn ich 4/6 kürze, wird der Bruch kleiner.“ Hat sie recht? Begründe.',
  '5. Finde drei Brüche, die gleich 2/5 sind, und zeichne einen davon als Rechteck.',
  '6. Ordne der Größe nach: 1/2, 3/8, 5/12, 2/3. Bringe dazu alle Brüche auf einen gemeinsamen Nenner.',
  '7. Ein Kuchen wird in 12 Stücke geteilt. Tom isst 3 Stücke, Mia 1/6 des Kuchens. Wer hat mehr gegessen?',
  'Zusatz: Wie viele verschiedene Brüche mit dem Nenner 12 lassen sich auf 1/2 kürzen? Begründe deine Antwort.',
].join('\n');

/** The four questions she answers in prose — each one goes to the tutor. */
export const JOURNEY_QUESTIONS = [
  'Erkläre mit eigenen Worten, warum 3/4 und 15/20 denselben Wert haben.',
  'Lisa sagt: „Wenn ich 4/6 kürze, wird der Bruch kleiner.“ Hat sie recht? Begründe.',
  'Ein Kuchen wird in 12 Stücke geteilt. Tom isst 3 Stücke, Mia 1/6 des Kuchens. Wer hat mehr gegessen?',
  'Wie viele Brüche mit dem Nenner 12 lassen sich auf 1/2 kürzen? Begründe.',
];

const item = (prompt: string, answer: string, topic: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic,
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

/** Two different photographed pages (a different paper tone each, so they never compare equal). */
async function pages(): Promise<Uint8Array[]> {
  return Promise.all(
    [248, 236].map((tone) =>
      sharp({
        create: {
          width: 600,
          height: 800,
          channels: 3,
          background: { r: tone, g: tone, b: tone - 4 },
        },
      })
        .jpeg()
        .toBuffer(),
    ),
  );
}

export type JourneyResult = {
  /** The page photos as they were uploaded, base64 — what a request carries per page. */
  pagesBase64: string[];
  materialId: string;
};

/**
 * Plays the journey for `l` on `env` (scripted model). Throws when a step does not answer as
 * expected, so a measurement never reports a journey that did not happen.
 */
export async function playSheetJourney(env: TestEnv, l: Learner): Promise<JourneyResult> {
  const expectStatus = (what: string, got: number, want: number) => {
    if (got !== want) throw new Error(`${what}: status ${got}, expected ${want}`);
  };
  env.llm.byDefault('buddy_check', {
    json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
  });
  const goal = await env.db.one<{ id: string }>(
    `insert into buddy_goals (learner_id, kind, title, due_date, topics, created_at)
     values ($1, 'exam', 'Mathearbeit Brüche', $2::date + 7, '{Brüche}', $3) returning id`,
    [l.learnerId, env.clock.now().toISOString().slice(0, 10), env.clock.now()],
  );

  // 1. Read the sheet: extraction, then the figures pass, then Buddy's background check.
  env.llm.script('extraction', {
    json: {
      is_learning_material: true,
      readable: true,
      pages: [],
      title: 'Brüche kürzen und erweitern',
      subject: { name: 'Mathematik', kind: 'math' },
      extracted_text: JOURNEY_SHEET_TEXT,
      items: JOURNEY_QUESTIONS.map((q, i) =>
        item(q, `Musterlösung ${i + 1}`, i % 2 ? 'Brüche kürzen' : 'Brüche erweitern'),
      ),
    },
  });
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg', 'image/jpeg'] },
  );
  expectStatus('create material', created.status, 201);
  const photos = await pages();
  for (const [i, u] of created.body.uploads.entries()) env.storage.put(u.path, photos[i]!);
  const materialId = created.body.material.id;
  expectStatus('submit', (await l.api.post(`/materials/${materialId}/submit`)).status, 202);
  await env.flushBackground();
  await env.db.query(`update materials set goal_id = $1 where id = $2`, [goal.id, materialId]);

  // 2. A practice test for the planned test: explain, grounded in the sheet (SHEETS block).
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Probetest Brüche',
      subject: null,
      items: [
        item('Kürze 9/12.', '3/4', 'Brüche kürzen'),
        item('Erweitere 2/5 auf den Nenner 15.', '6/15', 'Brüche erweitern'),
      ],
    },
  });
  const test = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'test',
    text: 'Mathearbeit Brüche',
    goal_id: goal.id,
  });
  expectStatus('practice test', test.status, 201);

  // 3. Practice from the sheet, every question answered in prose: one tutor call each.
  const session = await l.api.post<SessionView>('/practice/sessions', {
    material_id: materialId,
    mode: 'practice',
  });
  expectStatus('practice session', session.status, 201);
  for (const s of session.body.items) {
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Fast richtig — fehlt nur noch die Begründung.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    const answered = await l.api.post(`/practice/sessions/${session.body.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.item.id,
      text: 'Weil man oben und unten mit derselben Zahl malnimmt, bleibt es gleich viel.',
    });
    expectStatus('answer', answered.status, 200);
  }

  // 4. One message to Buddy: the STATE block with its `## Now` date list.
  env.llm.script('buddy_turn', {
    json: { reply: 'Super gemacht heute!', options: null, actions: [] },
  });
  expectStatus(
    'message',
    (
      await l.api.post('/buddy/messages', {
        client_message_id: randomUUID(),
        text: 'Ich hab das Blatt geübt',
      })
    ).status,
    200,
  );
  return { pagesBase64: photos.map((p) => Buffer.from(p).toString('base64')), materialId };
}

/** What one request carries, counted on the request exactly as the gateway was handed it. */
export type RequestFacts = {
  purpose: LlmRequest['purpose'];
  systemChars: number;
  schemaChars: number;
  /** Every text part of `contents`, summed. */
  textChars: number;
  images: number;
  imageBase64Chars: number;
  /** How often each uploaded page's bytes appear in this request, in page order. */
  pageCopies: number[];
  /** How often the sheet's transcription (its first line, which nothing else quotes) appears. */
  sheetTextCopies: number;
  /** How often the 22-day list of `## Now` appears. */
  dayListCopies: number;
};

const occurrences = (haystack: string, needle: string): number =>
  needle ? haystack.split(needle).length - 1 : 0;

export function requestFacts(req: LlmRequest, journey: JourneyResult): RequestFacts {
  const texts: string[] = [];
  const images: string[] = [];
  for (const m of req.contents)
    for (const p of m.parts) {
      if ('text' in p) texts.push(p.text);
      else images.push(p.inlineData.data);
    }
  const allText = [req.system, ...texts].join('\n');
  return {
    purpose: req.purpose,
    systemChars: req.system.length,
    schemaChars: JSON.stringify(req.schema).length,
    textChars: texts.reduce((n, t) => n + t.length, 0),
    images: images.length,
    imageBase64Chars: images.reduce((n, d) => n + d.length, 0),
    pageCopies: journey.pagesBase64.map((page) => images.filter((d) => d === page).length),
    sheetTextCopies: occurrences(allText, JOURNEY_SHEET_TEXT.split('\n')[0]!),
    dayListCopies: occurrences(allText, 'Next days (in_days offset'),
  };
}
