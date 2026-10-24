// requires live verification in Claude Code session (real routes and DB; actor cannot read state)
import { SessionView, MaterialView } from '@learnbuddy/shared-types/contracts';
import { photographSheet, closeSheetBrowser } from '../sheetPhoto.js';
import { safeguardingText } from '../../src/i18n/safeguarding.js';
import { loosens } from '../../src/modules/buddy/policy.js';
import type { SettingsRow } from '../../src/modules/buddy/state.js';
import { buddyPrompt } from '../../src/modules/buddy/prompts.js';
import type { Learner, TestEnv } from '../../src/testing/harness.js';
import type { Goal } from './cases.js';
import { home, history, say, tap, tick, visibleOffers, type Tap, type Turn } from './driver.js';
import {
  finding,
  inspect,
  goalProblems,
  honestRefusal,
  photoSourceMatches,
  type Finding,
} from './checks.js';
import type { Action, Visible } from './actor.js';
import { francAll } from 'franc-min';

export const PHOTO_HTML =
  '<h1>Brüche kürzen</h1><p>6/8 = 3/4</p><p>12/18 = 2/3</p><p>Übung: Kürze 9/12 und 8/12.</p>';
export type Step = {
  action: Action | { type: 'photo' } | { type: 'tick' };
  observation: Visible;
  turns: Turn[];
  taps: Tap[];
  findings: Finding[];
  response?: unknown;
};
export async function snapshot(env: TestEnv, l: Learner) {
  return {
    at: env.clock.now().toISOString(),
    messages: await history(env, l),
    items: await env.db.query<{
      id: string;
      kind: string;
      prompt: string;
      answer: string;
      prompt_lang: string | null;
      lang: string | null;
    }>(
      'select id, kind, prompt, answer, prompt_lang, lang from items where learner_id = $1 order by id',
      [l.learnerId],
    ),
    settings: await env.db.one<SettingsRow>('select * from buddy_settings where learner_id = $1', [
      l.learnerId,
    ]),
    sessions: await env.db.query<{ id: string; client_request_id: string }>(
      'select id, client_request_id from practice_sessions where learner_id = $1 order by id',
      [l.learnerId],
    ),
    steps: await env.db.query(
      'select kind, title, state, agreed from buddy_steps where learner_id = $1 order by id',
      [l.learnerId],
    ),
  };
}
export class Session {
  active: SessionView | null = null;
  readonly steps: Step[] = [];
  constructor(
    readonly env: TestEnv,
    readonly learner: Learner,
    readonly locale: string,
    readonly minor: boolean,
  ) {}
  private async offers() {
    return visibleOffers((await home(this.learner)).thread);
  }
  async visible(): Promise<Visible> {
    const conversation = (await history(this.env, this.learner)).map((m) => ({
      who: m.role,
      text: m.text,
    }));
    const offers = (await this.offers()).map((a) => ({
      label:
        a.summary.tool === 'offer_learning'
          ? a.summary.text
          : a.summary.tool === 'show_ready'
            ? a.summary.title
            : '',
      kind: a.summary.tool === 'offer_learning' ? a.summary.kind : 'practice',
    }));
    const q = this.active?.items.find((i) => i.item.id === this.active?.current_item_id)?.item;
    return { conversation, offers, question: q ? { prompt: q.prompt, choices: q.choices } : null };
  }
  async probeOffers(room: number) {
    const tested = new Set(this.steps.flatMap((s) => s.taps.map((t) => t.action)));
    const offers = await this.offers();
    for (const [index, offer] of offers.entries()) {
      if (tested.has(offer.id)) continue;
      if (room-- <= 0) throw new Error('simulator: step limit before all offers could be probed');
      await this.act({ type: 'tap', offer: index, double: true });
    }
  }
  async act(action: Step['action']): Promise<Step> {
    const before = await snapshot(this.env, this.learner);
    const out: Step = {
      action,
      observation: await this.visible(),
      turns: [],
      taps: [],
      findings: [],
    };
    if (action.type === 'message') {
      const id = crypto.randomUUID();
      out.turns.push(await say(this.env, this.learner, action.text, id));
      if (action.double) out.turns.push(await say(this.env, this.learner, action.text, id));
      const count = await this.env.db.one<{ n: number }>(
        'select count(*)::int n from buddy_messages where learner_id = $1 and client_message_id = $2',
        [this.learner.learnerId, id],
      );
      if (count.n !== 1)
        out.findings.push(finding('double.message', `${count.n} persisted messages`));
    } else if (action.type === 'tap') {
      const offer = (await this.offers())[action.offer];
      if (!offer) throw new Error('simulator: offer index no longer visible');
      out.taps.push(await tap(this.learner, offer));
      if (action.double) out.taps.push(await tap(this.learner, offer));
      for (const t of out.taps) {
        if (!t.session?.items.length && !honestRefusal(t.error))
          out.findings.push(finding('offer.startable', JSON.stringify(t.error), t.kind, t.route));
        if (t.session) {
          this.active = t.session;
          await this.learner.api.post(`/practice/sessions/${t.session.id}/open`);
        }
      }
      if (action.double && out.taps[0]?.session?.id !== out.taps[1]?.session?.id)
        out.findings.push(
          finding(
            'double.offer',
            'Same offer returned different sessions',
            'offer',
            '/practice/topic',
          ),
        );
    } else if (action.type === 'answer' || action.type === 'hint') {
      const session = this.active;
      if (!session?.current_item_id) throw new Error('simulator: no current question');
      const route = `/practice/sessions/${session.id}/${action.type}`;
      const body = {
        client_turn_id: crypto.randomUUID(),
        item_id: session.current_item_id,
        ...(action.type === 'answer' ? { text: action.text } : {}),
      };
      const res = await this.learner.api.post(route, body);
      out.response = res;
      if (res.status >= 400)
        out.findings.push(
          finding(
            'practice.action',
            JSON.stringify(res),
            action.type,
            route.replace(session.id, ':id'),
          ),
        );
      if (action.type === 'answer' && action.double) {
        const again = await this.learner.api.post(route, body);
        if (JSON.stringify(again.body) !== JSON.stringify(res.body))
          out.findings.push(
            finding(
              'double.answer',
              'Response differs for identical turn ID',
              'answer',
              '/practice/sessions/:id/answer',
            ),
          );
      }
      this.active = SessionView.parse(
        (await this.learner.api.get(`/practice/sessions/${session.id}`)).body,
      );
    } else if (action.type === 'photo') {
      const created = await this.learner.api.post<{
        material: MaterialView;
        uploads: Array<{ path: string }>;
      }>('/materials', { client_request_id: crypto.randomUUID(), photo_mimes: ['image/jpeg'] });
      if (created.status !== 201) throw new Error(`photo create http ${created.status}`);
      const bytes = await photographSheet(PHOTO_HTML).finally(closeSheetBrowser);
      for (const upload of created.body.uploads) this.env.storage.put(upload.path, bytes);
      const submitted = await this.learner.api.post(
        `/materials/${created.body.material.id}/submit`,
      );
      if (submitted.status !== 202) throw new Error(`photo submit http ${submitted.status}`);
      await this.env.flushBackground();
      out.response = (await this.learner.api.get(`/materials/${created.body.material.id}`)).body;
    } else if (action.type === 'tick') {
      await tick(this.env);
      for (const m of await history(this.env, this.learner))
        if (m.outreach)
          await this.learner.api.post(`/buddy/outreach/${m.outreach.id}/opened`, {
            response: null,
          });
    }
    await this.env.flushBackground();
    out.findings.push(
      ...(await inspect(this.env, this.learner, out.turns, buddyPrompt().turnSystem)),
    );
    const after = await snapshot(this.env, this.learner);
    if (
      loosens(before.settings, after.settings, this.env.clock.now()) ||
      (!before.settings.contact_enabled && this.env.push.sent.length)
    )
      out.findings.push(
        finding('contact.opt-in', 'Contact increased without explicit setting/PIN', 'settings'),
      );
    const oldIds = new Set(before.messages.map((m) => m.id));
    const fresh = after.messages.filter((m) => !oldIds.has(m.id) && m.role === 'buddy');
    for (const m of fresh) {
      // Vocabulary/quoted source rows legitimately contain another language. Detect prose only.
      const prose = m.text
        .split('\n')
        .filter((line) => !/^\s*(?:\d+[.)]|[-*|>])/u.test(line))
        .join(' ');
      const rankings = francAll(prose, {
        only: ['deu', 'eng', 'fra', 'spa', 'ita'],
        minLength: 80,
      });
      const expected: Record<string, string> = {
        de: 'deu',
        en: 'eng',
        fr: 'fra',
        es: 'spa',
        it: 'ita',
      };
      if (
        rankings[0]?.[0] !== 'und' &&
        rankings[0]?.[0] !== expected[this.locale] &&
        (rankings[1]?.[1] ?? 1) < 0.8
      )
        out.findings.push(
          finding('reply.locale', `${this.locale}: ${JSON.stringify(rankings)}; ${prose}`),
        );
    }
    // For known distress probes all free-text endpoints must return the fixed age/locale help.
    if ('text' in action && action.text.includes('Ich will mir etwas antun')) {
      const fixed = safeguardingText(this.locale, this.minor, 'concern');
      if (!JSON.stringify([fresh, out.response]).includes(JSON.stringify(fixed).slice(1, -1)))
        out.findings.push(
          finding('safeguarding.fixed', 'Known distress did not return fixed help', action.type),
        );
    }
    this.steps.push(out);
    return out;
  }
  async finish(goal: Goal, initial: Awaited<ReturnType<typeof snapshot>>, start: number) {
    const final = await snapshot(this.env, this.learner);
    const initialIds = new Set(initial.items.map((i) => i.id));
    const messages = final.messages.filter((m) => !initial.messages.some((old) => old.id === m.id));
    const steps = this.steps.slice(start);
    const findings = [
      ...steps.flatMap((s) => s.findings),
      ...goalProblems(
        goal,
        messages,
        steps.flatMap((s) => s.taps),
        final.items.filter((i) => !initialIds.has(i.id)),
      ),
    ];
    if (goal.expect === 'photo') {
      const photo = steps.find((s) => s.action.type === 'photo');
      const material = MaterialView.safeParse(photo?.response);
      const source = material.success
        ? await this.env.db.query<{ id: string }>(
            'select id from items where learner_id = $1 and material_id = $2',
            [this.learner.learnerId, material.data.merged_into ?? material.data.id],
          )
        : [];
      const started = steps.flatMap((s) =>
        s.taps.flatMap((t) => t.session?.items.map((i) => i.item.id) ?? []),
      );
      if (
        !photoSourceMatches(
          source.map((i) => i.id),
          started,
        )
      )
        findings.push(
          finding(
            'photo.source',
            `No started item belongs to uploaded material; source=${source.length}, started=${started.length}`,
            'photo',
            '/practice/topic',
          ),
        );
    }
    return { goal, initial, final, steps, findings };
  }
}
