// Real-app workloads copied from the owner's local provider benchmark (23.10.2026).
// requires live verification in Claude Code session (seeding uses the scripted gateway).
import sharp from 'sharp';
import type { LlmRequest } from '../../llm/gateway.js';
import type { GatewayProfile } from '../../llm/profile.js';
import { createTestEnv, onboard, type TestEnv } from '../harness.js';
import { quoteFrom, latestLearnerText } from '../scenarios/turns.js';
import { DEMO_WORKSHEET } from '../scenarios/core-loop.js';
import '../domain.js';

/** The sheet the reading is measured on: the DEMO_WORKSHEET's tasks, as a phone photo (JPEG). */
export async function worksheetJpeg(): Promise<Uint8Array> {
  const lines = [
    ['Arbeitsblatt Mathematik – Klasse 6', 44, 'bold'],
    ['Brüche kürzen und vergleichen', 38, 'bold'],
    ['Name: ____________   Datum: ________', 28, 'normal'],
    ['1. Kürze 6/8 so weit wie möglich.', 32, 'normal'],
    ['2. Welcher Bruch ist größer: 2/3 oder 3/5? Begründe.', 32, 'normal'],
    ['3. Wie heißt die Zahl unter dem Bruchstrich?', 32, 'normal'],
    ['4. Warum bleibt der Wert beim Erweitern gleich?', 32, 'normal'],
    ['    ______________________________________', 32, 'normal'],
    ['    ______________________________________', 32, 'normal'],
    ['Merke: Beim Kürzen teilst du Zähler und Nenner', 30, 'italic'],
    ['durch dieselbe Zahl.', 30, 'italic'],
  ] as const;
  const text = lines
    .map(
      ([t, size, style], i) =>
        `<text x="90" y="${170 + i * 115}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${style === 'bold' ? 700 : 400}" font-style="${style === 'italic' ? 'italic' : 'normal'}" fill="#222">${t}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#f4f1ea"/><rect x="40" y="40" width="1120" height="1520" fill="#fdfdf8" transform="rotate(-0.6 600 800)"/>${text}</svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
}

// ─────────────── seeding: the app builds the requests ───────────────

export type Workload = {
  id: string;
  purpose: LlmRequest['purpose'];
  req: LlmRequest;
  /** Aliases in this request's STATE, for `replyProgress` (first speakable reply). */
  aliases: Set<string>;
};

const MEASURED = {
  question: 'Warum muss man beim Kürzen Zähler und Nenner durch die gleiche Zahl teilen?',
  practise: 'ich will üben',
  maths: 'was ist 3/4 + 1/8?',
} as const;

/** The conversation before the measured turns: what she says and what (scripted) Buddy does. */
type Seed = { text: string; answer: (req: LlmRequest) => unknown };
const say =
  (reply: string, actions: unknown[] = []) =>
  () => ({ reply, options: null, actions });
const SEEDS_BEFORE_SHEET: Seed[] = [
  {
    text: 'Hi Buddy! Ich bin Lena und gehe in die 6. Klasse.',
    answer: (req) => ({
      reply: 'Hi Lena, schön dich kennenzulernen! Woran arbeitest du gerade in der Schule?',
      options: null,
      actions: [
        {
          tool: 'set_level',
          args: {
            level: 'school',
            school_year: { system: 'de', klasse: 6 },
            grade: null,
            quote: quoteFrom(req, 'in die 6. Klasse') ?? '',
          },
        },
      ],
    }),
  },
  {
    text: 'Am Freitag schreiben wir eine Mathearbeit über Brüche.',
    answer: (req) => ({
      reply:
        'Okay, dann bereiten wir uns bis Freitag vor. Hast du ein Arbeitsblatt dazu? Ein Foto reicht.',
      options: null,
      actions: [
        {
          tool: 'plan_exam',
          args: {
            title: 'Mathearbeit Brüche',
            subject: 'Mathe',
            subject_kind: 'math',
            day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
            topics: ['Brüche'],
            quote: quoteFrom(req, 'Am Freitag schreiben wir eine Mathearbeit über Brüche') ?? '',
          },
        },
        { tool: 'request_material', args: { goal: 'new', title: 'Arbeitsblatt Brüche' } },
      ],
    }),
  },
];
const SEEDS_AFTER_SHEET: Seed[] = [
  {
    text: 'Ich mag lieber kurze Übungen, so 10 Minuten.',
    answer: (req) => ({
      reply: 'Alles klar, dann machen wir kurze Runden.',
      options: null,
      actions: [
        {
          tool: 'remember',
          args: {
            about: 'learning',
            kind: 'preference',
            statement: 'Mag kurze Übungen',
            quote: quoteFrom(req, 'lieber kurze Übungen') ?? '',
            until: null,
          },
        },
      ],
    }),
  },
  {
    text: 'Was ist nochmal der Unterschied zwischen Zähler und Nenner?',
    answer: say(
      'Der Zähler steht oben und zählt, wie viele Stücke du hast. Der Nenner steht unten und sagt, in wie viele gleiche Stücke das Ganze geteilt ist – wie bei einer Pizza in 8 Stücken. Bei 3/8 hast du also 3 von 8 Stücken. Was wäre bei 5/6 der Nenner?',
    ),
  },
  { text: 'die 6', answer: say('Genau! Der Nenner ist 6 – die Pizza ist in 6 Stücke geteilt.') },
];
const SEEDS_AFTER_PRACTICE: Seed[] = [
  {
    text: 'Das war schwer, aber ich glaub ich habs jetzt.',
    answer: say('Das klingt gut – du bist drangeblieben!'),
  },
  {
    text: 'Mittwochs hab ich immer Fußballtraining.',
    answer: (req) => ({
      reply: 'Cool, dann planen wir mittwochs nichts Großes.',
      options: null,
      actions: [
        {
          tool: 'remember',
          args: {
            about: 'availability',
            kind: 'fact',
            statement: 'Hat mittwochs Fußballtraining',
            quote: quoteFrom(req, 'Mittwochs hab ich immer Fußballtraining') ?? '',
            until: null,
          },
        },
      ],
    }),
  },
  {
    text: 'Wie lange dauert die Arbeit eigentlich?',
    answer: say('Das weiß ich nicht – frag am besten deine Lehrerin. Meist sind es 45 Minuten.'),
  },
  { text: 'ok', answer: say('Super. Sag Bescheid, wenn du weitermachen willst.') },
];

const EXPLAIN_SET = {
  usable: true,
  title: 'Brüche kürzen',
  subject: { name: 'Mathe', kind: 'math' },
  items: [
    {
      kind: 'numeric',
      prompt: 'Kürze 12/16 vollständig und gib das Ergebnis als Dezimalzahl an.',
      answer: '0.75',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche kürzen',
      difficulty: 2,
      prompt_lang: null,
      lang: null,
      figure: null,
      source_excerpt: null,
    },
    {
      kind: 'short',
      prompt: 'Durch welche Zahl kürzt du 9/12 vollständig?',
      answer: '3',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche kürzen',
      difficulty: 1,
      prompt_lang: null,
      lang: null,
      figure: null,
      source_excerpt: null,
    },
    {
      kind: 'long',
      prompt: 'Warum bleibt der Wert eines Bruchs beim Kürzen gleich?',
      answer: 'Weil Zähler und Nenner durch dieselbe Zahl geteilt werden.',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche kürzen',
      difficulty: 3,
      prompt_lang: null,
      lang: null,
      figure: null,
      source_excerpt: null,
    },
  ],
  structured: [],
};

const ALIAS_RE = /\b([a-z]{1,2}\d{1,3})\b/g;
function aliasesOf(req: LlmRequest): Set<string> {
  const text = req.contents
    .flatMap((m) => m.parts.flatMap((p) => ('text' in p ? [p.text] : [])))
    .join('\n');
  return new Set([...text.matchAll(ALIAS_RE)].map((m) => m[1]!));
}

/** Her message, streamed as the app sends it (SSE), read to the end. */
async function streamedMessage(env: TestEnv, token: string, text: string): Promise<void> {
  const res = await env.app.request('/v1/buddy/messages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'x-timezone': 'Europe/Berlin',
    },
    body: JSON.stringify({ client_message_id: crypto.randomUUID(), text }),
  });
  const reader = res.body?.getReader();
  for (let c = await reader?.read(); c && !c.done; c = await reader?.read()) {
    /* drain */
  }
}

/** Seeds one learner and returns the requests the app built for the measured calls. */
export async function seed(
  profile: GatewayProfile,
  photo: Uint8Array,
  log: string[],
): Promise<Workload[]> {
  // Monday 2026-09-28, 15:00 in Berlin.
  const env = await createTestEnv({ start: '2026-09-28T13:00:00Z' });
  env.llm.profile = profile;
  env.llm.byDefault('buddy_check', {
    json: {
      disposition: 'wait',
      reason: 'nothing to add now',
      actions: [],
      outreach: null,
      look_back: null,
    },
  });
  try {
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const chat = async (s: Seed, streamed = false) => {
      env.clock.minutes(1);
      env.llm.script('buddy_turn', (req: LlmRequest) => s.answer(req));
      if (streamed) await streamedMessage(env, l.token, s.text);
      else {
        const r = await l.api.post<{ status: string }>('/buddy/messages', {
          client_message_id: crypto.randomUUID(),
          text: s.text,
        });
        log.push(`  turn "${s.text.slice(0, 40)}": ${r.status} ${r.body.status}`);
      }
    };
    for (const s of SEEDS_BEFORE_SHEET) await chat(s);

    // The worksheet: a real JPEG through upload → submit → the reading pipeline (extraction).
    env.clock.minutes(2);
    env.llm.script('extraction', { json: DEMO_WORKSHEET });
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', {
      client_request_id: crypto.randomUUID(),
      photo_mimes: ['image/jpeg'],
    });
    for (const u of created.body.uploads ?? []) env.storage.put(u.path, photo);
    await l.api.post(`/materials/${created.body.material?.id}/submit`);
    await env.flushBackground();
    const material = await l.api.get<{ status: string; item_count: number }>(
      `/materials/${created.body.material?.id}`,
    );
    log.push(
      `  sheet: ${created.status} → ${material.body.status}, ${material.body.item_count} questions`,
    );

    for (const s of SEEDS_AFTER_SHEET) await chat(s);

    // A practice run on a topic (explain), and a free-text answer the tutor judges.
    env.clock.minutes(3);
    env.llm.script('explain', { json: EXPLAIN_SET });
    const run = await l.api.post<{
      id: string;
      items: Array<{ item: { id: string; kind: string } }>;
    }>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind: 'practice',
      text: 'Brüche kürzen üben',
    });
    await env.flushBackground();
    log.push(`  practice run: ${run.status}, ${run.body.items?.length ?? 0} questions`);
    const items =
      (
        await l.api.get<{ items: Array<{ item: { id: string; kind: string } }> }>(
          `/practice/sessions/${run.body.id}`,
        )
      ).body.items ?? [];
    for (const it of items) {
      env.clock.minutes(1);
      const text =
        it.item.kind === 'numeric'
          ? '0,75'
          : it.item.kind === 'short'
            ? '3'
            : 'weil man oben und unten durch die gleiche zahl teilt';
      if (it.item.kind === 'long')
        env.llm.script('tutor', {
          json: {
            intent: 'answer',
            verdict: 'correct',
            reply: 'Genau – oben und unten durch dieselbe Zahl, darum bleibt der Wert gleich.',
            gave_hint: false,
            revealed_answer: false,
            concern: false,
          },
        });
      const a = await l.api.post<{ verdict?: string }>(`/practice/sessions/${run.body.id}/answer`, {
        client_turn_id: crypto.randomUUID(),
        item_id: it.item.id,
        text,
      });
      log.push(`  answer ${it.item.kind}: ${a.status} ${a.body.verdict ?? ''}`);
    }
    await l.api.post(`/practice/sessions/${run.body.id}/finish`);
    await env.flushBackground();

    for (const s of SEEDS_AFTER_PRACTICE) await chat(s);

    // The measured turns, streamed like the app.
    const measured: Array<[keyof typeof MEASURED, Seed]> = [
      [
        'question',
        {
          text: MEASURED.question,
          answer: say(
            'Weil du dann nur anders aufschreibst, wie viel es ist – der Wert bleibt gleich.',
          ),
        },
      ],
      [
        'practise',
        {
          text: MEASURED.practise,
          answer: say('Gern! Womit willst du üben – mit den Brüchen für Freitag?'),
        },
      ],
      [
        'maths',
        {
          text: MEASURED.maths,
          answer: say('Mach erst beide Brüche gleichnamig: Welcher Nenner passt zu 4 und 8?'),
        },
      ],
    ];
    for (const [, s] of measured) await chat(s, true);
    await env.flushBackground();

    // What the app sent, as recorded by the scripted gateway.
    const calls = env.llm.calls;
    const first = (p: LlmRequest['purpose']) => calls.find((c) => c.purpose === p);
    const out: Workload[] = [];
    for (const [id, s] of measured) {
      const req = calls.find((c) => c.purpose === 'buddy_turn' && latestLearnerText(c) === s.text);
      if (req)
        out.push({ id: `buddy_turn:${id}`, purpose: 'buddy_turn', req, aliases: aliasesOf(req) });
      else log.push(`  ! no buddy_turn request recorded for "${s.text}"`);
    }
    const tutor = calls.filter((c) => c.purpose === 'tutor').at(-1);
    const explain = first('explain');
    const extraction = first('extraction');
    for (const [id, req] of [
      ['tutor', tutor],
      ['explain', explain],
      ['extraction', extraction],
    ] as const) {
      if (req) out.push({ id, purpose: req.purpose, req, aliases: new Set() });
      else log.push(`  ! no ${id} request recorded`);
    }
    // The form choice that precedes extraction and explain (#627), in the order they ran.
    const choices = env.llm.choices;
    if (choices[0])
      out.push({ id: 'forms:extraction', purpose: 'forms', req: choices[0], aliases: new Set() });
    if (choices[1])
      out.push({ id: 'forms:explain', purpose: 'forms', req: choices[1], aliases: new Set() });
    const unexpected = env.llm.unexpected.map((u) => u.purpose);
    if (unexpected.length)
      log.push(
        `  (unscripted calls during seeding, answered with an error: ${unexpected.join(', ')})`,
      );
    return out;
  } finally {
    await env.close();
  }
}
