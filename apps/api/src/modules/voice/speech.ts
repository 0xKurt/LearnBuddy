// Buddy's natural voice: one sentence → audio (ADR 0008, docs/architecture.md §Voice).
//
// The app sends the text exactly as it is read (math already in words) and the locale;
// voice and speed come from her settings here, so "sprich langsamer" (tool set_voice) takes
// effect with the next sentence. Only the voice picker's preview names a voice to try (one of
// the same curated set, validated by the contract); her settings stay as they are. Only the text goes to the provider — never her name, id or
// anything else. The audio is cached per learner for 24 hours (the same question read again
// costs nothing); the cache key is a hash, the text itself is not stored.
//
// Cost protection only (never a limit on normal use): a budget of provider calls per account
// and hour (lib/limits.ts). When it or the provider fails, the app reads the sentence with the
// phone's own voice — she never goes without hearing it.

import { createHash } from 'node:crypto';

import type { SpeechRequest, SpeechResponse, VoiceName } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { consume, limitError } from '../../lib/limits.js';
import { rateFor, SpeechError } from '../../speech/gateway.js';

/** How long synthesised audio is kept (docs/privacy.md). */
export const SPEECH_CACHE_MS = 24 * 3_600_000;
const SPEECH_TIMEOUT_MS = 8_000;

export async function synthesizeSpeech(
  deps: Deps,
  who: { accountId: string; learnerId: string },
  input: SpeechRequest,
): Promise<SpeechResponse> {
  if (!deps.speech.available) {
    throw new AppError('unavailable', 'Buddy’s own voice is not configured', {
      reason: 'speech_off',
    });
  }
  const locale = deps.speech.localeFor(input.locale);
  if (!locale) {
    throw new AppError('unavailable', 'No natural voice for this language', {
      reason: 'language',
    });
  }
  const settings = await deps.db.one<{ voice: VoiceName; voice_speed: number }>(
    `select voice, voice_speed from buddy_settings where learner_id = $1`,
    [who.learnerId],
  );
  const voice = input.voice ?? settings.voice;
  const rate = rateFor(settings.voice_speed, input.slow ?? false);
  const text = input.text.replace(/\s+/g, ' ').trim();
  const key = createHash('sha256')
    .update(JSON.stringify([deps.speech.voiceId(voice, locale), locale, rate, text]))
    .digest('hex');
  const now = deps.now();
  const answer = (mime: SpeechResponse['mime'], audio: Buffer): SpeechResponse => ({
    mime,
    audio_base64: audio.toString('base64'),
    voice,
    speed: settings.voice_speed,
  });

  const cached = await deps.db.maybeOne<{ mime: SpeechResponse['mime']; audio: Buffer }>(
    `select mime, audio from speech_cache
      where learner_id = $1 and key = $2 and expires_at > $3`,
    [who.learnerId, key, now],
  );
  if (cached) return answer(cached.mime, cached.audio);

  const budget = await consume(deps.db, 'speech', who.accountId, now);
  if (!budget.allowed) throw limitError(budget);

  let audio;
  try {
    audio = await deps.speech.synthesize({
      text,
      locale,
      voice,
      rate,
      timeoutMs: SPEECH_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof SpeechError) {
      // Logs carry the kind only, never the text.
      console.warn('[voice] speech provider failed', { kind: err.kind });
      throw new AppError('unavailable', 'Buddy’s own voice is not available right now', {
        reason: err.kind,
      });
    }
    throw err;
  }
  await deps.db.query(
    `insert into speech_cache (learner_id, key, mime, audio, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (learner_id, key) do update
       set mime = excluded.mime, audio = excluded.audio,
           created_at = excluded.created_at, expires_at = excluded.expires_at`,
    [who.learnerId, key, audio.mime, audio.audio, now, new Date(now.getTime() + SPEECH_CACHE_MS)],
  );
  return answer(audio.mime, audio.audio);
}

/** Retention: audio older than a day is deleted (scheduler, docs/privacy.md). */
export async function purgeSpeechCache(deps: Deps): Promise<number> {
  const gone = await deps.db.query(
    `delete from speech_cache
      where ctid in (select ctid from speech_cache where expires_at <= $1 limit 2000)
      returning 1`,
    [deps.now()],
  );
  return gone.length;
}
