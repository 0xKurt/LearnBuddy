// Buddy's natural voice (ADR 0008, docs/architecture.md §Voice): one sentence → audio in
// her voice and speed, cached per learner for a day, only the text leaves, honest failures
// (the app then reads with the phone's voice), and "sprich langsamer" / "andere Stimme" as a
// Buddy tool behind the context fence (CLAUDE.md rule 4), undoable.
// requires live verification in Claude Code session (needs a running Postgres; the speech
// provider and the model are fakes — the real Google call is verified by hand, ADR 0008)

import type {
  BuddyHome,
  SendMessageResponse,
  SpeechResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POLICIES } from '../lib/limits.js';
import { runTick } from '../modules/scheduler/tick.js';
import { SpeechError } from '../speech/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-e000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string) {
  return l.api.post<SendMessageResponse>('/buddy/messages', { client_message_id: uuid(), text });
}

const reply = (text: string, actions: unknown[] = []) => ({
  json: { concern: false, reply: text, options: null, actions },
});

const setVoice = (
  speed: 'slower' | 'faster' | 'normal' | null,
  voice: string | null,
  quote: string,
) => ({ tool: 'set_voice', args: { speed, voice, quote } });

type ErrorBody = { error: { code: string; details?: { reason?: string } } };

describe.skipIf(!dbReady)('Buddy’s natural voice', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  const speech = (body: Record<string, unknown>) =>
    l.api.post<SpeechResponse & ErrorBody>('/voice/speech', body);
  const cacheRows = async () =>
    (
      await env.db.one<{ n: number }>(
        `select count(*)::int as n from speech_cache where learner_id = $1`,
        [l.learnerId],
      )
    ).n;

  it('reads a sentence in her voice; only the text leaves; the same sentence again comes from the cache', async () => {
    const text = 'Super, Lena! Drei Viertel ist richtig.';
    const first = await speech({ text, locale: 'de-DE' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ mime: 'audio/wav', voice: 'warm', speed: 0 });
    expect(Buffer.from(first.body.audio_base64, 'base64').subarray(0, 4).toString()).toBe('RIFF');
    // Exactly the text, the language, the voice and the rate — nothing else about her.
    expect(env.speech.calls).toEqual([
      { text, locale: 'de-DE', voice: 'warm', rate: 1, timeoutMs: 8000 },
    ]);
    // The text itself is not stored, only a hash as the key.
    const row = await env.db.one<{ key: string; expires_at: Date }>(
      `select key, expires_at from speech_cache where learner_id = $1`,
      [l.learnerId],
    );
    expect(row.key).toMatch(/^[0-9a-f]{64}$/);
    expect(row.expires_at.toISOString()).toBe('2026-09-29T14:00:00.000Z');

    const again = await speech({ text: `  ${text} `, locale: 'de-DE' });
    expect(again.body.audio_base64).toBe(first.body.audio_base64);
    expect(env.speech.calls).toHaveLength(1);

    // "Langsam" is another reading.
    const slow = await speech({ text, locale: 'de-DE', slow: true });
    expect(slow.status).toBe(200);
    expect(env.speech.calls[1]).toMatchObject({ rate: 0.8 });

    // Another learner never gets her audio.
    const other = await onboard(env, { relation: 'self' });
    await other.api.post('/voice/speech', { text, locale: 'de-DE' });
    expect(env.speech.calls).toHaveLength(3);
  });

  it('keeps the audio one day: the scheduler deletes it, then it is made again', async () => {
    await speech({ text: 'Hallo!', locale: 'de-DE' });
    expect(await cacheRows()).toBe(1);
    env.clock.hours(23);
    expect((await runTick(env.deps)).errors).toEqual([]);
    expect(await cacheRows()).toBe(1);
    env.clock.hours(2);
    expect((await runTick(env.deps)).errors).toEqual([]);
    expect(await cacheRows()).toBe(0);
    await speech({ text: 'Hallo!', locale: 'de-DE' });
    expect(env.speech.calls).toHaveLength(2);
  });

  it('fails honestly (the app reads with the phone voice): provider down, no language, not configured', async () => {
    env.speech.failNext(new SpeechError('unavailable', 'down'), new SpeechError('timeout', 'slow'));
    const down = await speech({ text: 'Hallo!', locale: 'de-DE' });
    expect(down.status).toBe(503);
    expect(down.body.error).toMatchObject({
      code: 'unavailable',
      details: { reason: 'unavailable' },
    });
    const slow = await speech({ text: 'Hallo!', locale: 'de-DE' });
    expect(slow.body.error.details?.reason).toBe('timeout');
    // Nothing half-made was kept; the next try works.
    expect(await cacheRows()).toBe(0);
    expect((await speech({ text: 'Hallo!', locale: 'de-DE' })).status).toBe(200);

    const japanese = await speech({ text: 'こんにちは', locale: 'ja-JP' });
    expect(japanese.status).toBe(503);
    expect(japanese.body.error.details?.reason).toBe('language');

    const invalid = await speech({ text: '', locale: 'de-DE' });
    expect(invalid.status).toBe(422);

    const off = await createTestEnv({ speech: 'disabled' });
    try {
      const m = await onboard(off);
      const res = await m.api.post<ErrorBody>('/voice/speech', { text: 'Hallo', locale: 'de-DE' });
      expect(res.status).toBe(503);
      expect(res.body.error.details?.reason).toBe('speech_off');
    } finally {
      await off.close();
    }
  });

  it('bounds cost only: past the hourly budget new sentences are refused, cached ones still play', async () => {
    await speech({ text: 'Schon gehört.', locale: 'de-DE' });
    await env.db.query(
      `update attempt_counters set count = $2 where scope = 'speech' and account_id = $1`,
      [l.accountId, POLICIES.speech.limit],
    );
    const refused = await speech({ text: 'Neuer Satz.', locale: 'de-DE' });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');
    expect((await speech({ text: 'Schon gehört.', locale: 'de-DE' })).status).toBe(200);
    env.clock.hours(1);
    expect((await speech({ text: 'Neuer Satz.', locale: 'de-DE' })).status).toBe(200);
  });

  it('"sprich langsamer" and "andere Stimme" change her voice through a Buddy tool, undoable', async () => {
    const before = await env.db.one<{ context_version: number }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    env.llm.script('buddy_turn', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain(
        '## Your voice when read aloud\n- warm · speed normal',
      );
      return reply('Klar, ich spreche langsamer.', [
        setVoice('slower', null, 'bitte langsamer sprechen'),
      ]).json;
    });
    const slower = await send(l, 'Kannst du bitte langsamer sprechen?');
    expect(slower.body.status).toBe('done');
    const card = slower.body.home.thread.flatMap((m) => m.actions)[0]!;
    expect(card.summary).toEqual({ tool: 'set_voice', voice: 'warm', speed: -1 });
    expect(card.undoable).toBe(true);
    const after = await env.db.one<{ context_version: number; voice_speed: number }>(
      `select context_version, voice_speed from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(after.voice_speed).toBe(-1);
    expect(after.context_version).toBeGreaterThan(before.context_version);

    // The next sentence is read slower.
    await speech({ text: 'Jetzt langsamer.', locale: 'de-DE' });
    expect(env.speech.calls.at(-1)).toMatchObject({ rate: 0.88, voice: 'warm' });

    env.llm.script('buddy_turn', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('- warm · speed slower (-1 of -2)');
      return reply('Okay, jetzt klinge ich anders.', [
        setVoice(null, 'other', 'eine andere Stimme'),
      ]).json;
    });
    const other = await send(l, 'Ich will eine andere Stimme');
    expect(other.body.home.thread.flatMap((m) => m.actions).at(-1)?.summary).toEqual({
      tool: 'set_voice',
      voice: 'friendly',
      speed: -1,
    });
    const res = await speech({ text: 'Jetzt anders.', locale: 'de-DE' });
    expect(res.body).toMatchObject({ voice: 'friendly', speed: -1 });

    // Undo the voice: back to warm, speed stays.
    const voiceCard = other.body.home.thread.flatMap((m) => m.actions).at(-1)!;
    const undone = await l.api.post<BuddyHome>(`/buddy/actions/${voiceCard.id}/undo`);
    expect(undone.status).toBe(200);
    const restored = await env.db.one<{ voice: string; voice_speed: number }>(
      `select voice, voice_speed from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(restored).toEqual({ voice: 'warm', voice_speed: -1 });

    // The older speed change cannot be undone blindly over the newer settings.
    const stale = await l.api.post<ErrorBody>(`/buddy/actions/${card.id}/undo`);
    expect(stale.status).toBe(409);
  });

  it('refuses what changes nothing or goes past the limit, and the model says so instead', async () => {
    await env.db.query(`update buddy_settings set voice_speed = -2 where learner_id = $1`, [
      l.learnerId,
    ]);
    env.llm.script(
      'buddy_turn',
      reply('Ich spreche langsamer.', [setVoice('slower', null, 'noch langsamer')]),
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('already as slow as it goes');
        return reply('Langsamer geht es leider nicht – das ist schon meine ruhigste Stimme.').json;
      },
    );
    const res = await send(l, 'Noch langsamer bitte');
    expect(res.body.status).toBe('done');
    expect(res.body.home.thread.flatMap((m) => m.actions)).toEqual([]);
    const s = await env.db.one<{ voice_speed: number }>(
      `select voice_speed from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(s.voice_speed).toBe(-2);

    // Without her own words it is not changed either.
    env.llm.script(
      'buddy_turn',
      reply('Ich spreche schneller.', [setVoice('faster', null, 'schneller bitte')]),
      reply('Wie soll ich sprechen?'),
    );
    const noQuote = await send(l, 'Hallo Buddy');
    expect(noQuote.body.home.thread.flatMap((m) => m.actions)).toEqual([]);
  });

  it('a voice change decided on an old context is not applied (fence, rule 4)', async () => {
    env.llm.script(
      'buddy_turn',
      async () => {
        // Something she did meanwhile (another device changed a setting) moves the context on.
        await env.db.query(
          `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
          [l.learnerId],
        );
        return reply('Klar.', [setVoice('slower', null, 'langsamer')]).json;
      },
      reply('Klar, langsamer.', [setVoice('slower', null, 'langsamer')]),
    );
    const res = await send(l, 'Bitte langsamer');
    expect(res.body.status).toBe('done');
    // Applied once, from the fresh context — not twice.
    const s = await env.db.one<{ voice_speed: number }>(
      `select voice_speed from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(s.voice_speed).toBe(-1);
    const decisions = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1 order by created_at, id`,
      [l.learnerId],
    );
    expect(decisions.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
  });
});
