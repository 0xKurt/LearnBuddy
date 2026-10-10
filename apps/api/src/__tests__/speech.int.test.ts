// Buddy's natural voice (ADR 0008, docs/architecture.md §Voice): one sentence → audio in
// her voice and speed, cached per learner for a day, only the text leaves, honest failures
// (the app then reads with the phone's voice), "sprich langsamer" / "andere Stimme" as a
// Buddy tool behind the context fence (CLAUDE.md rule 4), undoable, and the voice picked with
// a tap in the setup or the settings (preview without changing anything; ADR 0008 §Amendment).
// requires live verification in Claude Code session (needs a running Postgres; the speech
// provider and the model are fakes — the real Google call is verified by hand, ADR 0008)

import type {
  BuddyHome,
  BuddySettingsView,
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
import { bumpContext } from '../modules/buddy/plan.js';

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
  afterEach(() => env.closeChecked());

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

  it('never shares a learner sentence, voice named or not (review 28.09.)', async () => {
    // A named voice alone must NOT route into the shared cache: only the
    // app's own sample sentences are shareable.
    const sneaky = { text: 'Ich heiße Lena Meyer.', locale: 'de-DE', voice: 'warm' as const };
    const res = await speech(sneaky);
    expect(res.status).toBe(200);
    const shared = await env.db.one<{ n: string }>(
      `select count(*)::text as n from speech_cache_shared`,
    );
    expect(Number(shared.n)).toBe(0);
    const personal = await env.db.one<{ n: string }>(
      `select count(*)::text as n from speech_cache where learner_id = $1`,
      [l.learnerId],
    );
    expect(Number(personal.n)).toBe(1);
  });

  it('shares voice-picker samples across learners, long-lived (issue #12)', async () => {
    // A preview names a voice: the app's fixed sample text, cached for everyone.
    const preview = {
      text: 'Hallo, ich bin Buddy. So klinge ich, wenn ich dir etwas vorlese.',
      locale: 'de-DE',
      voice: 'warm' as const,
    };
    const first = await speech(preview);
    expect(first.status).toBe(200);
    expect(env.speech.calls).toHaveLength(1);

    // A different learner taps the same sample: served from the shared cache.
    const other = await onboard(env, { relation: 'self' });
    const again = await other.api.post<SpeechResponse & ErrorBody>('/voice/speech', preview);
    expect(again.status).toBe(200);
    expect(env.speech.calls).toHaveLength(1);

    // It outlives the personal 24-hour purge …
    env.clock.hours(25);
    expect((await runTick(env.deps)).errors).toEqual([]);
    await other.api.post('/voice/speech', preview);
    expect(env.speech.calls).toHaveLength(1);

    // … and her own sentences still stay hers (no voice named → personal cache).
    await speech({ text: 'Meine eigene Frage.', locale: 'de-DE' });
    const shared = await env.db.one<{ n: string }>(
      `select count(*)::text as n from speech_cache_shared`,
    );
    expect(Number(shared.n)).toBe(1);
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
        await bumpContext(env.db, l.learnerId);
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
  it('she picks a voice with a tap: the preview changes nothing, the choice is saved and fenced', async () => {
    const text = 'Hallo! So klinge ich.';
    // Tap to hear: this voice, this once; her settings stay as they are.
    const preview = await speech({ text, locale: 'de-DE', voice: 'bright' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ voice: 'bright', speed: 0 });
    expect(env.speech.calls.at(-1)).toMatchObject({ text, voice: 'bright', rate: 1 });
    // Another voice is another reading (never served from the other voice's cache).
    await speech({ text, locale: 'de-DE', voice: 'clear' });
    expect(env.speech.calls.at(-1)).toMatchObject({ voice: 'clear' });
    expect(env.speech.calls).toHaveLength(2);
    // Only the curated names — never a provider voice.
    expect((await speech({ text, locale: 'de-DE', voice: 'Zephyr' })).status).toBe(422);
    expect(env.speech.calls).toHaveLength(2);

    const settings = await l.api.get<BuddySettingsView>('/buddy/settings');
    expect(settings.body.voice).toBe('warm');
    expect((await speech({ text: 'Und normal?', locale: 'de-DE' })).body.voice).toBe('warm');

    // "Sprich langsamer" first, so there is an undo that a later tap must not be overridden by.
    env.llm.script(
      'buddy_turn',
      reply('Klar, langsamer.', [setVoice('slower', null, 'bitte langsamer')]),
    );
    const slower = await send(l, 'Sprich bitte langsamer');
    const card = slower.body.home.thread.flatMap((m) => m.actions)[0]!;
    const before = await env.db.one<{ context_version: number; version: number }>(
      `select context_version, version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );

    // The choice: one PATCH with the version it was based on. A child needs no parents' PIN.
    const invalid = await l.api.patch<ErrorBody>('/buddy/settings', {
      voice: 'Sulafat',
      version: before.version,
    });
    expect(invalid.status).toBe(422);
    const picked = await l.api.patch<BuddySettingsView>('/buddy/settings', {
      voice: 'clear',
      version: before.version,
    });
    expect(picked.status).toBe(200);
    expect(picked.body).toMatchObject({ voice: 'clear', contact_enabled: false });
    const after = await env.db.one<{
      context_version: number;
      voice: string;
      voice_speed: number;
    }>(`select context_version, voice, voice_speed from buddy_settings where learner_id = $1`, [
      l.learnerId,
    ]);
    // Buddy's context names the voice: a decision made before the tap is stale (rule 4).
    expect(after.context_version).toBeGreaterThan(before.context_version);
    expect(after).toMatchObject({ voice: 'clear', voice_speed: -1 });
    expect((await speech({ text: 'Jetzt klar.', locale: 'de-DE' })).body).toMatchObject({
      voice: 'clear',
      speed: -1,
    });

    // A second tap based on the old version (another device) is refused, nothing changes.
    const stale = await l.api.patch<ErrorBody>('/buddy/settings', {
      voice: 'bright',
      version: before.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('stale');
    // The older "langsamer" cannot be undone blindly over her newer choice.
    expect((await l.api.post<ErrorBody>(`/buddy/actions/${card.id}/undo`)).status).toBe(409);

    // Another learner's choice is theirs alone.
    const other = await onboard(env, { relation: 'self' });
    const theirs = await other.api.get<BuddySettingsView>('/buddy/settings');
    expect(theirs.body.voice).toBe('warm');
    const otherPick = await other.api.patch<BuddySettingsView>('/buddy/settings', {
      voice: 'friendly',
      version: theirs.body.version,
    });
    expect(otherPick.body.voice).toBe('friendly');
    const mine = await l.api.get<BuddySettingsView>('/buddy/settings');
    expect(mine.body.voice).toBe('clear');

    // Asking Buddy still works from the picked voice: "andere Stimme" is the next one.
    env.llm.script('buddy_turn', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('- clear · speed slower (-1 of -2)');
      return reply('Okay, jetzt klinge ich anders.', [
        setVoice(null, 'other', 'eine andere Stimme'),
      ]).json;
    });
    const next = await send(l, 'Ich will eine andere Stimme');
    expect(next.body.home.thread.flatMap((m) => m.actions).at(-1)?.summary).toEqual({
      tool: 'set_voice',
      // "Other" = the next voice after hers in VOICE_NAMES (clear → soft since
      // the set grew to six, migration 0045).
      voice: 'soft',
      speed: -1,
    });
  });

  it('says up front whether her natural voices are there: configured, language missing, not configured (issue #526)', async () => {
    // Configured, and it reads her language: the app may offer the voices to choose from.
    const here = await l.api.get<BuddySettingsView>('/buddy/settings');
    expect(here.body.natural_voice).toBe(true);
    // The answer to a change says it too: the picker keeps what the server sent back.
    const changed = await l.api.patch<BuddySettingsView>('/buddy/settings', {
      voice: 'clear',
      version: here.body.version,
    });
    expect(changed.body).toMatchObject({ voice: 'clear', natural_voice: true });
    // A language the provider has no voice for: nothing to choose — for her, not for others.
    env.speech.lacks('it');
    const italian = await onboard(env, { relation: 'self', locale: 'it' });
    const theirs = await italian.api.get<BuddySettingsView>('/buddy/settings');
    expect(theirs.body.natural_voice).toBe(false);
    expect((await l.api.get<BuddySettingsView>('/buddy/settings')).body.natural_voice).toBe(true);
    // Not configured at all: no natural voice for anyone, whatever the language.
    const off = await createTestEnv({ speech: 'disabled' });
    try {
      const m = await onboard(off);
      const settings = await m.api.get<BuddySettingsView>('/buddy/settings');
      expect(settings.status).toBe(200);
      expect(settings.body.natural_voice).toBe(false);
    } finally {
      await off.close();
    }
  });

  it('a tap on a voice while Buddy is deciding makes that decision stale (fence, rule 4)', async () => {
    env.llm.script(
      'buddy_turn',
      async () => {
        // She taps "Klar" in the settings while Buddy is still thinking about "andere Stimme".
        const s = await l.api.get<BuddySettingsView>('/buddy/settings');
        const tap = await l.api.patch('/buddy/settings', {
          voice: 'clear',
          version: s.body.version,
        });
        expect(tap.status).toBe(200);
        return reply('Okay, eine andere.', [setVoice(null, 'other', 'andere Stimme')]).json;
      },
      (req) => {
        // Decided again on the fresh context, which knows the voice she just picked.
        expect(ScriptedGateway.textOf(req)).toContain('- clear · speed normal');
        return reply('Okay, eine andere.', [setVoice(null, 'other', 'andere Stimme')]).json;
      },
    );
    const res = await send(l, 'Bitte eine andere Stimme');
    expect(res.body.status).toBe('done');
    const s = await env.db.one<{ voice: string }>(
      `select voice from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    // "Other" from her new choice (clear → soft), not from the old one (warm → friendly).
    expect(s.voice).toBe('soft');
  });
});
