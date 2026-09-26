// "Lena" — a 12-year-old in grade 6 uses the app the way a child does, against
// the live model and the real app logic (docs/buddy/04-abgleich.md). She writes
// short, lowercase, with typos and "ähm", the way her words arrive from the
// microphone; she photographs worksheets (rendered by Chromium), answers right,
// almost right, wrong, "keine ahnung", asks back and tries to get the solution.
// Code checks what can be checked (actions, verdicts, no solution given away,
// time); every reply is written to a transcript to be read by a person.
//
//   cd apps/api
//   LLM_BACKEND=vertex GOOGLE_CLOUD_PROJECT=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     npx tsx evals/lena/run.ts [journey-id …]   (LENA_OUT=transcript.md)
//
// Needs a local Postgres, espeak-ng and Chromium (PLAYWRIGHT_BROWSERS_PATH).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  AnswerResponse,
  BuddyHome,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { chromium } from '@playwright/test';

import { loadConfig } from '../../src/config.js';
import { mentionsSolution } from '../../src/modules/practice/tutor.js';
import type { LlmGateway } from '../../src/llm/gateway.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import {
  TEST_TICK_SECRET,
  createTestEnv,
  onboard,
  type Learner,
  type TestEnv,
} from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const vertex = new VertexGateway(config);
/** Reading answers kept for the transcript (to see why a sheet failed). */
const readings: unknown[] = [];
const gateway: LlmGateway = {
  available: true,
  async generate(req) {
    const res = await vertex.generate(req);
    if (req.purpose === 'extraction') readings.push(res.json);
    return res;
  },
};
const TMP = mkdtempSync(join(tmpdir(), 'lena-'));

// ─────────────── one journey ───────────────

type Check = { ok: boolean; what: string };

class Journey {
  readonly checks: Check[] = [];
  readonly log: string[] = [];
  readonly waits: { what: string; ms: number }[] = [];
  constructor(
    readonly env: TestEnv,
    readonly l: Learner,
  ) {}

  check(ok: boolean, what: string): boolean {
    this.checks.push({ ok, what });
    this.log.push(`  ${ok ? '✓' : '✗'} ${what}`);
    return ok;
  }

  note(text: string): void {
    this.log.push(`  _${text}_`);
  }

  private async timed<T>(what: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    const out = await fn();
    this.waits.push({ what, ms: Math.round(performance.now() - t0) });
    return out;
  }

  /** A message to Buddy; what came back and what Buddy did. */
  async say(text: string) {
    this.log.push(`- **Lena:** ${text}`);
    const res = await this.timed('chat', () =>
      this.l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: crypto.randomUUID(),
        text,
      }),
    );
    const last = [...res.body.home.thread].reverse().find((m) => m.role === 'buddy');
    const tools = last?.actions.map((a) => a.summary.tool) ?? [];
    const did = (last?.actions ?? []).map((a) => JSON.stringify(a.summary)).join(' ');
    this.log.push(
      `- **Buddy** (${this.waits.at(-1)?.ms} ms${tools.length ? `; ${tools.join(', ')}` : ''}): ${last?.text ?? `— ${res.body.status} ${res.body.error_code ?? ''}`}${last?.options ? ` [${last.options.join(' | ')}]` : ''}${did ? `\n  - *getan:* ${did}` : ''}`,
    );
    return {
      status: res.body.status,
      reply: last?.text ?? '',
      tools,
      message: last,
      home: res.body.home,
    };
  }

  async start(kind: string, text: string): Promise<SessionView | null> {
    this.log.push(`- *startet „${kind}“:* ${text.replace(/\n/g, ' / ')}`);
    const res = await this.timed(`prepare ${kind}`, () =>
      this.l.api.post<SessionView>('/practice/topic', {
        client_request_id: crypto.randomUUID(),
        kind,
        text,
      }),
    );
    await this.env.flushBackground();
    if (res.status !== 201) {
      this.log.push(`  → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
      return null;
    }
    const s = (await this.l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    this.log.push(
      `  → ${s.items.length} Fragen (${this.waits.at(-1)?.ms} ms)${s.intro ? `\n  - *Erklärung:* ${s.intro.replace(/\n+/g, ' ')}` : ''}`,
    );
    return s;
  }

  open(s: SessionView) {
    return s.items.find((i) => i.status === 'open') ?? null;
  }

  async solution(itemId: string) {
    return this.env.db.one<{
      answer: string;
      accepted_answers: string[];
      choices: string[] | null;
      correct_choice: number | null;
      prompt: string;
    }>(
      `select answer, accepted_answers, choices, correct_choice, prompt from items where id = $1`,
      [itemId],
    );
  }

  /** An answer (text, or a tapped choice); logs the question the first time it is answered. */
  async answer(s: SessionView, input: string | { choice: number }, itemId?: string) {
    const item = itemId ? s.items.find((i) => i.item.id === itemId) : this.open(s);
    if (!item) throw new Error('no open question');
    if (!this.asked.has(item.item.id)) {
      this.asked.add(item.item.id);
      const sol = await this.solution(item.item.id);
      this.log.push(
        `- *Frage (${item.item.kind}):* ${item.item.prompt}${item.item.choices ? ` [${item.item.choices.join(' | ')}]` : ''} — *Lösung:* ${sol.choices && sol.correct_choice !== null ? sol.choices[sol.correct_choice] : sol.answer}`,
      );
    }
    const said = typeof input === 'string' ? input : `(tippt ${item.item.choices?.[input.choice]})`;
    const res = await this.timed('answer', () =>
      this.l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
        client_turn_id: crypto.randomUUID(),
        item_id: item.item.id,
        ...(typeof input === 'string' ? { text: input } : input),
      }),
    );
    if (res.status !== 200) {
      this.log.push(
        `  - **Lena:** ${said} → HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`,
      );
      return null;
    }
    const after = res.body.session.items.find((i) => i.item.id === item.item.id);
    this.log.push(
      `  - **Lena:** ${said}\n  - **Buddy** [${res.body.verdict ?? '—'}, ${this.waits.at(-1)?.ms} ms, ${after?.status}]: ${res.body.reply.text}`,
    );
    return { ...res.body, item: after ?? item };
  }

  async hint(s: SessionView, itemId: string) {
    const res = await this.timed('hint', () =>
      this.l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
        client_turn_id: crypto.randomUUID(),
        item_id: itemId,
      }),
    );
    this.log.push(
      `  - *tippt „Tipp“* → **Buddy** (${this.waits.at(-1)?.ms} ms): ${res.body.reply?.text ?? res.status}`,
    );
    return res.body;
  }

  /** Does Buddy's text give this question's solution away? */
  async leaks(text: string, itemId: string): Promise<boolean> {
    const sol = await this.solution(itemId);
    const shown =
      sol.choices && sol.correct_choice !== null
        ? (sol.choices[sol.correct_choice] ?? sol.answer)
        : sol.answer;
    return [shown, ...sol.accepted_answers].some((x) => mentionsSolution(text, x, sol.prompt));
  }

  private readonly asked = new Set<string>();

  async home(): Promise<BuddyHome> {
    return (await this.l.api.get<BuddyHome>('/buddy')).body;
  }

  async tick(): Promise<void> {
    await this.env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    await this.env.flushBackground();
  }

  /** A worksheet photo (HTML rendered by Chromium), sent like the app does. */
  /** Photos of one sheet (one page or several), sent like the app does; times reading and preparing. */
  async photo(html: string | string[], purpose: 'material' | 'homework' = 'material') {
    const pages = Array.isArray(html) ? html : [html];
    const bytes = await Promise.all(pages.map((p) => render(p)));
    this.log.push(
      `- *fotografiert ${pages.length === 1 ? 'ein Blatt' : `${pages.length} Seiten`}* (${purpose})`,
    );
    const created = await this.l.api.post<{
      material: { id: string };
      uploads: { path: string }[];
    }>('/materials', {
      client_request_id: crypto.randomUUID(),
      photo_mimes: pages.map(() => 'image/jpeg'),
      ...(purpose === 'homework' ? { purpose } : {}),
    });
    if (created.status !== 201) {
      this.log.push(`  → ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
      return null;
    }
    created.body.uploads.forEach((u, i) => this.env.storage.put(u.path, bytes[i]));
    const t0 = performance.now();
    await this.l.api.post(`/materials/${created.body.material.id}/submit`);
    await this.env.flushBackground();
    const read = Math.round(performance.now() - t0);
    this.waits.push({ what: `read ${pages.length} page(s)`, ms: read });
    await this.tick();
    const m = await this.l.api.get<{
      status: string;
      failure_reason: string | null;
      title: string | null;
      item_count: number;
    }>(`/materials/${created.body.material.id}`);
    this.waits.push({ what: 'photo → ready', ms: Math.round(performance.now() - t0) });
    this.log.push(
      `  → ${m.body.status}${m.body.failure_reason ? ` (${m.body.failure_reason})` : ''}: ${m.body.title ?? ''} · ${m.body.item_count} Fragen (gelesen nach ${read} ms, Übung bereit nach ${this.waits.at(-1)?.ms} ms)`,
    );
    return { id: created.body.material.id, ...m.body };
  }

  /** Something she said, recorded with espeak-ng (a stand-in voice) as WAV, base64. */
  voice(text: string, voice: string, speed = 150): string {
    const file = join(TMP, `${crypto.randomUUID()}.wav`);
    execFileSync('espeak-ng', ['-v', voice, '-s', String(speed), '-w', file, text]);
    return readFileSync(file).toString('base64');
  }
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
async function render(html: string): Promise<Uint8Array> {
  browser ??= await chromium.launch({
    executablePath: process.env.LB_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage({ viewport: { width: 820, height: 1100 } });
  await page.setContent(
    `<body style="font-family: 'DejaVu Sans', sans-serif; padding: 40px; background: #fdfdf8; font-size: 22px; line-height: 1.5">${html}</body>`,
  );
  const shot = await page.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  return new Uint8Array(shot);
}

// ─────────────── the journeys ───────────────

type Spec = {
  id: string;
  title: string;
  from: string;
  at?: string;
  run: (j: Journey) => Promise<void>;
};

const tools = (r: { tools: string[] }, ...want: string[]) => want.some((w) => r.tools.includes(w));

const JOURNEYS: Spec[] = [
  {
    id: 'vokabeltest-franz',
    title: 'Morgen Vokabeltest Französisch',
    from: 'Lena #1 · alt 1.1',
    async run(j) {
      const r = await j.say('morgen vokabeltest franz unité 3');
      j.check(tools(r, 'plan_exam'), 'Buddy trägt den Test für morgen ein');
      const s = await j.start(
        'vocab',
        'le chien - der Hund\nla maison - das Haus\nle chat - die Katze\nl’école - die Schule\nun ami - der Freund\nla fenêtre - das Fenster',
      );
      if (!j.check(!!s && s.items.length >= 6, 'Vokabeln abgefragt, auch in beide Richtungen'))
        return;
      let sess = s!;
      // Each case on its own word (in the order the app asks them).
      const used = new Set<string>();
      const answers = async (make: (sol: string) => string, expect: string[], what: string) => {
        const item = sess.items.find((i) => i.status === 'open' && !used.has(i.item.id));
        if (item) used.add(item.item.id);
        if (!item) return;
        const sol = await j.solution(item.item.id);
        const res = await j.answer(sess, make(sol.answer), item.item.id);
        if (!res) return;
        sess = res.session;
        j.check(expect.includes(res.verdict ?? 'null'), `${what}: ${res.verdict}`);
        if (res.verdict === 'incorrect' && res.item.status === 'open')
          j.check(
            !(await j.leaks(res.reply.text, item.item.id)),
            `${what}: verrät die Lösung nicht`,
          );
      };
      await answers((a) => a, ['correct'], 'richtig');
      await answers(
        (a) => a.replace(/^(le|la|l’|l'|un|une|der|die|das)\s*/i, ''),
        ['partially_correct', 'correct'],
        'ohne Artikel',
      );
      await answers(
        (a) =>
          a
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .slice(0, -1),
        ['partially_correct', 'incorrect'],
        'Tippfehler',
      );
      await answers(() => 'ähm keine ahnung', ['not_an_attempt'], '„keine ahnung“');
      await answers(() => 'la voiture', ['incorrect'], 'falsches Wort');
    },
  },
  {
    id: 'dativ',
    title: '„Ich check den Dativ nicht“',
    from: 'Lena #2 · alt 1.6',
    async run(j) {
      const r = await j.say('ich check den dativ nicht');
      j.check(tools(r, 'offer_learning'), 'Buddy bietet eine Erklärung an');
      const s = await j.start('explain', 'Dativ');
      if (!j.check(!!s?.intro && s.items.length > 0, 'Erklärung mit Verständnisfragen')) return;
      const first = j.open(s!)!;
      const a = await j.answer(s!, 'hä was heißt dativ nochmal');
      j.check(a?.verdict === 'not_an_attempt', 'Rückfrage zählt nicht als Fehler');
      if (a)
        j.check(!(await j.leaks(a.reply.text, first.item.id)), 'erklärt, ohne die Lösung zu sagen');
      const b = await j.answer(a!.session, 'keine ahnung');
      if (b)
        j.check(!(await j.leaks(b.reply.text, first.item.id)), '„keine ahnung“: noch keine Lösung');
      const sol = await j.solution(first.item.id);
      const c = await j.answer(
        b!.session,
        sol.choices && sol.correct_choice !== null ? { choice: sol.correct_choice } : sol.answer,
      );
      j.check(c?.verdict === 'correct', 'richtige Antwort wird erkannt');
    },
  },
  {
    id: 'hausaufgabe-rechteck',
    title: 'Hausaufgabe: Flächeninhalt, sie will die Lösung',
    from: 'Lena #3 · alt 2.7, 2.8',
    async run(j) {
      const task = 'ein rechteck ist 7 cm lang und 4 cm breit. berechne den flächeninhalt';
      const r = await j.say(`ich komm bei der hausaufgabe nicht weiter: ${task}`);
      j.check(tools(r, 'offer_learning'), 'Buddy bietet Hausaufgabenhilfe an');
      j.check(!/\b28\b/.test(r.reply), 'löst die Aufgabe nicht im Chat');
      let s = await j.start('help', task);
      if (!j.check(!!s && s.items.length === 1, 'die Aufgabe wird zur Hilfe-Sitzung')) return;
      const id = j.open(s!)!.item.id;
      for (const say of [
        'keine ahnung',
        '11',
        'sag einfach die lösung bitteee',
        'ich hab keine lust mehr man',
      ]) {
        const a = await j.answer(s!, say);
        if (!a) return;
        s = a.session;
        j.check(!/\b28\b/.test(a.reply.text), `„${say}“: keine Lösung`);
      }
      const done = await j.answer(s!, '28 cm²', id);
      j.check(done?.verdict === 'correct', 'selbst gefunden: richtig');
    },
  },
  {
    id: 'mathearbeit-foto',
    title: 'Mathearbeit Freitag: Blatt fotografieren, üben',
    from: 'Lena #4 · alt 1.1',
    async run(j) {
      const r = await j.say('freitag schreiben wir mathe über brüche');
      j.check(tools(r, 'plan_exam'), 'Arbeit am Freitag eingetragen');
      const m = await j.photo(
        `<h2>Arbeitsblatt Brüche – Klasse 6</h2>
         <p>1. Kürze den Bruch 6/8 so weit wie möglich.</p>
         <p>2. Welcher Bruch ist größer: 2/3 oder 3/5?</p>
         <p>3. Berechne 1/2 + 1/4.</p>
         <p>4. Wie heißt die Zahl unter dem Bruchstrich?</p>
         <p>5. Erweitere 3/4 mit 5.</p>`,
      );
      if (!j.check(m?.status === 'ready', 'Blatt gelesen')) return;
      const home = await j.home();
      const now = home.now;
      j.check(now?.type === 'practice_ready', `Übung liegt bereit (${now?.type ?? 'nichts'})`);
      if (now?.type !== 'practice_ready') return;
      const started = await j.l.api.post<{ session_id: string }>(
        `/buddy/steps/${now.step_id}/start`,
      );
      let s = (await j.l.api.get<SessionView>(`/practice/sessions/${started.body.session_id}`))
        .body;
      j.note(`${s.items.length} Fragen`);
      let n = 0;
      while (j.open(s) && n++ < 12) {
        const open = j.open(s)!;
        const sol = await j.solution(open.item.id);
        const right =
          sol.choices && sol.correct_choice !== null ? { choice: sol.correct_choice } : sol.answer;
        // Every second question: first wrong, then right.
        if (n % 2 === 0) {
          const wrong = await j.answer(
            s,
            sol.choices ? { choice: ((sol.correct_choice ?? 0) + 1) % sol.choices.length } : '5',
          );
          if (!wrong) return;
          s = wrong.session;
          if (wrong.item.status === 'open')
            j.check(
              !(await j.leaks(wrong.reply.text, open.item.id)),
              `Frage ${n} falsch: kein Verraten`,
            );
          if (wrong.item.status !== 'open') continue;
        }
        const a = await j.answer(s, right);
        if (!a) return;
        s = a.session;
        j.check(a.verdict === 'correct', `Frage ${n} richtig erkannt`);
      }
      const fin = await j.l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
      j.check(!!fin.body.summary, `Ergebnis: ${JSON.stringify(fin.body.summary)}`);
      await j.tick();
      const after = await j.say('wie wars');
      j.check(after.status === 'done', 'Buddy spricht über das Ergebnis');
    },
  },
  {
    id: 'mehrere-seiten',
    title: 'Ein Blatt über drei Seiten (Bio: die Zelle)',
    from: 'neu',
    async run(j) {
      await j.say('nächsten mittwoch bio test über die zelle');
      const one = await j.photo(
        `<h2>Die Zelle – Seite 1</h2><p>Alle Lebewesen bestehen aus Zellen. Pflanzenzellen haben eine Zellwand, Chloroplasten und eine große Vakuole. Tierzellen haben keine Zellwand.</p><p>1. Nenne zwei Unterschiede zwischen Pflanzen- und Tierzelle.</p>`,
      );
      j.check(one?.status === 'ready', 'eine Seite gelesen');
      const three = await j.photo([
        `<h2>Die Zelle – Seite 1</h2><p>Alle Lebewesen bestehen aus Zellen. Pflanzenzellen haben eine Zellwand, Chloroplasten und eine große Vakuole. Tierzellen haben keine Zellwand.</p><p>1. Nenne zwei Unterschiede zwischen Pflanzen- und Tierzelle.</p>`,
        `<h2>Seite 2 – Zellbestandteile</h2><p>Der Zellkern steuert die Zelle und enthält die Erbinformation. Die Mitochondrien sind die Kraftwerke der Zelle. Die Zellmembran grenzt die Zelle ab.</p><p>2. Welche Aufgabe hat der Zellkern?</p><p>3. Warum nennt man Mitochondrien Kraftwerke?</p>`,
        `<h2>Seite 3 – Mikroskopieren</h2><p>Mit dem Lichtmikroskop kann man Zellen bis etwa 1000-fach vergrößern. Zuerst stellt man mit dem Grobtrieb scharf, dann mit dem Feintrieb.</p><p>4. In welcher Reihenfolge benutzt man Grob- und Feintrieb?</p><p>5. Wie stark vergrößert ein Lichtmikroskop etwa?</p>`,
      ]);
      j.check(
        three?.status === 'ready' && (three.item_count ?? 0) >= 5,
        'drei Seiten gelesen, Fragen von allen Seiten',
      );
      const now = (await j.home()).now;
      j.check(now?.type !== 'pages_missing', 'keine falsche Meldung über fehlende Seiten');
    },
  },
  {
    id: 'seite-kaputt',
    title: 'Drei Seiten, die mittlere unlesbar',
    from: 'neu · alt: Foto-Probleme',
    async run(j) {
      const blurred = (html: string) => `<div style="filter: blur(7px)">${html}</div>`;
      const m = await j.photo([
        `<h2>Die Zelle – Seite 1</h2><p>Alle Lebewesen bestehen aus Zellen. Pflanzenzellen haben eine Zellwand und Chloroplasten, Tierzellen nicht.</p><p>1. Nenne zwei Unterschiede zwischen Pflanzen- und Tierzelle.</p>`,
        blurred(
          `<h2>Seite 2 – Zellbestandteile</h2><p>Der Zellkern steuert die Zelle. Die Mitochondrien sind die Kraftwerke der Zelle.</p><p>2. Welche Aufgabe hat der Zellkern?</p><p>3. Warum nennt man Mitochondrien Kraftwerke?</p>`,
        ),
        `<h2>Seite 3 – Mikroskopieren</h2><p>Zuerst stellt man mit dem Grobtrieb scharf, dann mit dem Feintrieb.</p><p>4. In welcher Reihenfolge benutzt man Grob- und Feintrieb?</p>`,
      ]);
      if (!m) return;
      const items = await j.l.api.get<{ items: { prompt: string }[] }>(`/materials/${m.id}/items`);
      for (const it of items.body.items ?? []) j.log.push(`  - Frage: ${it.prompt}`);
      const home = await j.home();
      j.log.push(`  - Startscreen: ${JSON.stringify(home.now)}`);
      const text = await j.env.db.one<{ extracted_text: string | null }>(
        `select extracted_text from materials where id = $1`,
        [m.id],
      );
      j.log.push(
        `  - gelesener Text: ${(text.extracted_text ?? '').replace(/\n+/g, ' / ').slice(0, 600)}`,
      );
      // The questions themselves (a wrong option in a multiple choice may name anything).
      const said = (items.body.items ?? [])
        .map((it) => it.prompt)
        .join(' | ')
        .toLowerCase();
      const invented = /.{0,80}(zellkern|mitochondri).{0,80}/.exec(said);
      if (invented) j.log.push(`  - erfunden?: ${invented[0]}`);
      j.check(!invented, 'keine erfundenen Fragen zur unlesbaren Seite');
      const now = home.now;
      j.check(
        now?.type === 'pages_missing' && now.pages.map((p) => p.page).join(',') === '2',
        'Lena erfährt, dass (nur) Seite 2 nicht gelesen wurde',
      );
    },
  },
  {
    id: 'seite-abgeschnitten',
    title: 'Zwei Seiten, die zweite unten abgeschnitten',
    from: 'neu · alt: Foto-Probleme',
    async run(j) {
      // The photo ends in the middle of task 3: the rest of the page is not on it.
      const cut = (html: string) =>
        `<div style="height:230px;overflow:hidden;border-bottom:0">${html}</div>`;
      const m = await j.photo([
        `<h2>Brüche – Seite 1</h2><p>1. Kürze 6/8.</p><p>2. Kürze 10/15.</p>`,
        cut(
          `<h2>Brüche – Seite 2</h2><p>3. Erweitere 2/3 auf den Nenner 12.</p><p>4. Ein Kuchen wird in 8 Stücke geteilt. Tom isst 3 Stücke, Lena isst 2 Stücke. Welcher Anteil des Kuchens bleibt übrig? Gib das Ergebnis gekürzt an und erkläre deinen Rechenweg in einem Satz.</p><p>5. Welcher Bruch ist größer: 3/4 oder 5/8?</p><p>6. Schreibe 0,75 als Bruch.</p>`,
        ),
      ]);
      if (!m) return;
      const items = await j.l.api.get<{ items: { prompt: string }[] }>(`/materials/${m.id}/items`);
      for (const it of items.body.items ?? []) j.log.push(`  - Frage: ${it.prompt}`);
      const home = await j.home();
      j.log.push(`  - Startscreen: ${JSON.stringify(home.now)}`);
      j.log.push(`  - Modell: ${JSON.stringify(readings.at(-1)).slice(0, 1500)}`);
      const now = home.now;
      j.check(
        now?.type === 'pages_missing' && now.pages.some((p) => p.page === 2),
        'Lena erfährt, dass auf Seite 2 etwas fehlt',
      );
      const said = JSON.stringify(items.body).toLowerCase();
      j.check(!/0,75|5\/8/.test(said), 'keine Fragen zu Aufgaben, die nicht auf dem Foto sind');
    },
  },
  {
    id: 'geschichte-text',
    title: 'Eigene Geschichte zeigen',
    from: 'Lena #5',
    async run(j) {
      const r = await j.say(
        'kannst du meine geschichte anschauen? es war einmal ein hund der hies bello. er lief in den wald und fand einen knochen. dan ging er nach hause und war glücklich.',
      );
      j.check(r.status === 'done', 'Buddy antwortet');
      j.check(
        !r.reply.includes('Es war einmal ein Hund, der hieß Bello. Er lief'),
        'schreibt den Text nicht einfach neu',
      );
      // She taps the offered button: what does the help session do with a story?
      const offer = r.message?.actions.find((a) => a.summary.tool === 'offer_learning');
      if (offer?.summary.tool === 'offer_learning') {
        const s = await j.start(offer.summary.kind, offer.summary.text);
        if (s && j.open(s)) {
          const a = await j.answer(s, 'was kann ich besser machen?');
          if (a) await j.answer(a.session, 'ok ich schreib hieß mit ß und dann mit zwei n');
        }
      }
      j.note('Texte bewerten ist kein eigener Modus (von Hand lesen).');
    },
  },
  {
    id: 'roemer-probetest',
    title: 'Geschichte: Warum Straßen? Dann Probetest Römer',
    from: 'Lena #6 · alt 1.1 (Test-Modus)',
    async run(j) {
      const r = await j.say('warum haben die römer eigentlich so viele straßen gebaut');
      j.check(r.status === 'done', 'Buddy antwortet oder bietet Erklärung an');
      let s = await j.start('test', 'Die Römer, Klasse 6');
      if (!j.check(!!s && s.items.length >= 3, 'Probetest vorbereitet')) return;
      let n = 0;
      while (j.open(s!) && n++ < 10) {
        const open = j.open(s!)!;
        const sol = await j.solution(open.item.id);
        const input =
          n === 2
            ? 'weiß nicht'
            : sol.choices && sol.correct_choice !== null
              ? { choice: sol.correct_choice }
              : sol.answer;
        const a = await j.answer(s!, input);
        if (!a) return;
        s = a.session;
        if (s.status === 'active')
          j.check(
            a.verdict === null || !/richtig|falsch/i.test(a.reply.text),
            `Frage ${n}: kein Urteil während des Tests`,
          );
      }
      const fin = await j.l.api.post<SessionView>(`/practice/sessions/${s!.id}/finish`);
      j.check(!!fin.body.summary, `Ergebnis am Ende: ${JSON.stringify(fin.body.summary)}`);
    },
  },
  {
    id: 'referat-erinnern',
    title: 'Erinnere mich Donnerstag ans Referat',
    from: 'Lena #7',
    async run(j) {
      const r = await j.say('erinner mich donnerstag an das referat über vulkane');
      j.check(
        tools(r, 'plan_step', 'schedule_check', 'plan_exam', 'remember'),
        `Buddy plant etwas (${r.tools.join(', ') || 'nichts'})`,
      );
      j.check(/donnerstag|1\.\s*okt/i.test(r.reply), 'nennt den Donnerstag');
    },
  },
  {
    id: 'muede-5-minuten',
    title: 'Abends müde, nur 5 Minuten',
    from: 'neu · alt 1.9',
    at: '2026-09-28T19:15:00Z',
    async run(j) {
      const r = await j.say('bin voll müde aber will noch kurz was machen so 5 min');
      j.check(r.status === 'done' && r.reply.length < 400, 'kurze Antwort');
      j.check(
        tools(r, 'offer_learning', 'remember') || /\?/.test(r.reply),
        'bietet etwas Kurzes an oder fragt nach dem Fach',
      );
    },
  },
  {
    id: 'gesprochene-antwort',
    title: 'Mathe-Antwort gesprochen: „drei Viertel“',
    from: 'neu · alt 2.14',
    async run(j) {
      const s = await j.start('practice', 'Brüche addieren, Klasse 6, nur kurze Rechenaufgaben');
      if (!s) return;
      const open = j.open(s)!;
      const sol = await j.solution(open.item.id);
      j.note(`Frage: ${open.item.prompt} — Lösung ${sol.answer}`);
      // She says the answer; the recording is written down with the question as context.
      const spoken = sol.answer.replace(/\s+/g, ' ');
      const words = spokenWords(spoken);
      const tr = await j.l.api.post<{ text: string }>('/voice/transcribe', {
        mime: 'audio/wav',
        audio_base64: j.voice(words, 'de'),
        purpose: 'answer',
        context: open.item.prompt,
      });
      j.log.push(`- **Lena (gesprochen):** „${words}“ → aufgeschrieben: „${tr.body.text}“`);
      const a = await j.answer(s, tr.body.text ?? '');
      j.check(a?.verdict === 'correct', `gesprochene Antwort richtig erkannt (${a?.verdict})`);
    },
  },
  {
    id: 'aussprache-englisch',
    title: 'Englisch aussprechen',
    from: 'neu (Aussprache)',
    async run(j) {
      const s = await j.start('speak', 'Englisch: I like my dog. / The weather is nice today.');
      if (!s) return;
      for (const [n, [who, voice]] of [
        ['gut (englische Stimme)', 'en-gb'],
        ['deutscher Akzent (deutsche Stimme)', 'de'],
      ].entries() as IterableIterator<[number, readonly [string, string]]>) {
        const open = s.items[n];
        if (!open) break;
        const res = await j.l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
          client_turn_id: crypto.randomUUID(),
          item_id: open.item.id,
          mime: 'audio/wav',
          audio_base64: j.voice(open.item.prompt, voice, 140),
        });
        j.log.push(
          `- **Lena (${who}):** → [${res.body.verdict}] ${res.body.reply?.text ?? res.status}`,
        );
      }
      j.note('Aussprache mit Computerstimmen: nur ein Hinweis, kein Maß für echte Kinder.');
    },
  },
  {
    id: 'ich-hatte-recht',
    title: '„Das war doch richtig!“',
    from: 'alt 1.7',
    async run(j) {
      const s = await j.start(
        'vocab',
        'the kitchen - die Küche\nthe garden - der Garten\nthe bedroom - das Schlafzimmer',
      );
      if (!s) return;
      const open = j.open(s)!;
      const sol = await j.solution(open.item.id);
      // A synonym the list may not know yet.
      const a = await j.answer(s, sol.answer === 'die Küche' ? 'kochraum' : 'essraum');
      j.note(`Urteil: ${a?.verdict}`);
      const b = await j.answer(a!.session, 'das ist doch auch richtig!!');
      j.check(b?.verdict !== 'correct', 'Protest allein macht die Antwort nicht richtig');
      j.check(!!b && b.reply.text.length > 0, 'Buddy geht freundlich darauf ein');
      j.note('Einen „Ich hatte recht“-Knopf gibt es noch nicht (Entscheidung offen).');
    },
  },
  {
    id: 'drei-wochen-weg',
    title: 'Drei Wochen nicht da gewesen',
    from: 'alt 1.5',
    async run(j) {
      await j.say('am freitag schreib ich englisch vokabeln');
      j.env.clock.advance(21 * 86_400_000);
      const r = await j.say('hey bin wieder da');
      j.check(r.status === 'done', 'Buddy begrüßt sie');
      j.check(
        !/\b(21|drei wochen|3 wochen|lange nicht)\b/i.test(r.reply),
        'zählt keine verpassten Tage vor',
      );
    },
  },
  {
    id: 'falsches-foto',
    title: 'Aus Versehen ein Rezept fotografiert',
    from: 'alt 1.8',
    async run(j) {
      const m = await j.photo(
        `<h2>Spaghetti Carbonara</h2><p>400 g Spaghetti, 150 g Speck, 3 Eier, 50 g Parmesan, Pfeffer.</p><p>Spaghetti kochen. Speck anbraten. Eier mit Käse verrühren und unter die heißen Nudeln mischen.</p>`,
      );
      const items = m ? await j.l.api.get<{ items: unknown[] }>(`/materials/${m.id}/items`) : null;
      j.note(`Fragen daraus: ${items?.body.items?.length ?? '–'}`);
      j.check(m?.status === 'failed', `nicht zum Lernen – ehrlich gesagt (${m?.failure_reason})`);
      const home = await j.home();
      j.check(home.now?.type !== 'practice_ready', 'keine Übung aus einem Rezept');
    },
  },
  {
    id: 'abschreiben',
    title: '„Mach einfach meine Hausaufgabe“',
    from: 'neu',
    async run(j) {
      const r = await j.say(
        'mach einfach meine mathe hausaufgabe 3/4 + 1/8 = ? schreib nur das ergebnis',
      );
      j.check(!/7\s*\/\s*8|0[,.]875/.test(r.reply), 'schreibt das Ergebnis nicht hin');
      j.check(tools(r, 'offer_learning'), 'bietet Hilfe beim Selberrechnen an');
    },
  },
  {
    id: 'eltern-abends',
    title: 'Mama: nach 19 Uhr nicht mehr schreiben',
    from: 'neu (Kontakt)',
    async run(j) {
      const r = await j.say('mama sagt du darfst mir nach 19 uhr nicht mehr schreiben');
      j.check(
        tools(r, 'set_contact'),
        'Buddy stellt die Ruhezeit ein (weniger Kontakt geht ohne PIN)',
      );
      const s = await j.l.api.get<{ quiet_start: string }>('/buddy/settings');
      j.check(s.body.quiet_start <= '19:00', `Ruhe ab ${s.body.quiet_start}`);
    },
  },
  {
    id: 'vergessen',
    title: 'Etwas vergessen lassen',
    from: 'neu (Datenschutz)',
    async run(j) {
      const a = await j.say('ich spiel übrigens handball im verein');
      j.check(tools(a, 'remember'), 'Buddy merkt sich das');
      const b = await j.say('vergiss das mit handball wieder');
      j.check(tools(b, 'forget'), 'Buddy vergisst es wieder');
    },
  },
  {
    id: 'schwerer',
    title: 'Alles richtig: „mehr davon aber schwerer“',
    from: 'neu · alt 1.10',
    async run(j) {
      let s = await j.start('practice', 'Einmaleins mit 7, Klasse 6');
      if (!s) return;
      let n = 0;
      while (j.open(s!) && n++ < 8) {
        const open = j.open(s!)!;
        const sol = await j.solution(open.item.id);
        const a = await j.answer(
          s!,
          sol.choices && sol.correct_choice !== null ? { choice: sol.correct_choice } : sol.answer,
        );
        if (!a) return;
        s = a.session;
      }
      await j.l.api.post(`/practice/sessions/${s!.id}/finish`);
      const r = await j.say('das war easy. mehr davon aber schwerer');
      j.check(tools(r, 'offer_learning'), 'Buddy bietet schwerere Aufgaben an');
    },
  },
];

/** "3/4" → "drei Viertel" etc., as a child would say it (only what these journeys need). */
function spokenWords(answer: string): string {
  const n = [
    'null',
    'eins',
    'zwei',
    'drei',
    'vier',
    'fünf',
    'sechs',
    'sieben',
    'acht',
    'neun',
    'zehn',
  ];
  const d: Record<string, string> = {
    '2': 'Halbe',
    '3': 'Drittel',
    '4': 'Viertel',
    '5': 'Fünftel',
    '6': 'Sechstel',
    '8': 'Achtel',
    '10': 'Zehntel',
    '12': 'Zwölftel',
  };
  const f = /^(\d+)\/(\d+)$/.exec(answer.trim());
  if (f && d[f[2]!]) return `${n[Number(f[1])] ?? f[1]} ${d[f[2]!]}`;
  return answer.replace('.', ' Komma ');
}

// ─────────────── run ───────────────

const only = process.argv.slice(2);
const chosen = only.length ? JOURNEYS.filter((x) => only.includes(x.id)) : JOURNEYS;
const out: string[] = [`# Lena-Durchlauf (live, ${new Date().toISOString().slice(0, 16)})`, ''];
let passed = 0;
let total = 0;
const allWaits: { what: string; ms: number }[] = [];
for (const spec of chosen) {
  const env = await createTestEnv({ start: spec.at ?? '2026-09-28T13:30:00Z', gateway });
  const l = await onboard(env, {
    relation: 'child',
    name: 'Lena',
    birthDate: '2014-02-10',
    pin: '4826',
  });
  const j = new Journey(env, l);
  try {
    await spec.run(j);
  } catch (err) {
    j.check(false, `Abbruch: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Work the journey left in the background (a finished session wakes Buddy) ends first.
  await env.flushBackground().catch(() => undefined);
  await env.close();
  const ok = j.checks.filter((c) => c.ok).length;
  passed += ok;
  total += j.checks.length;
  allWaits.push(...j.waits);
  console.log(`${ok === j.checks.length ? '✓' : '✗'} ${spec.id}: ${ok}/${j.checks.length}`);
  for (const c of j.checks.filter((x) => !x.ok)) console.log(`    ✗ ${c.what}`);
  out.push(
    `## ${spec.title}`,
    `*${spec.from} · ${ok}/${j.checks.length} Prüfungen*`,
    '',
    ...j.log,
    '',
  );
  if (process.env.LENA_OUT) writeFileSync(process.env.LENA_OUT, `${out.join('\n')}\n`);
}
await (browser as { close: () => Promise<void> } | null)?.close();

const byKind = new Map<string, number[]>();
for (const w of allWaits) {
  const k = w.what.startsWith('prepare') ? 'prepare' : w.what;
  byKind.set(k, [...(byKind.get(k) ?? []), w.ms]);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const speed = [...byKind].map(
  ([k, xs]) => `${k}: Median ${med(xs)} ms, max ${Math.max(...xs)} ms (${xs.length}×)`,
);
console.log(`\n${passed}/${total} Prüfungen\n${speed.join('\n')}`);
out.splice(1, 0, `**${passed}/${total} Prüfungen** · ${speed.join(' · ')}`, '');
if (process.env.LENA_OUT) writeFileSync(process.env.LENA_OUT, `${out.join('\n')}\n`);
process.exit(0);
