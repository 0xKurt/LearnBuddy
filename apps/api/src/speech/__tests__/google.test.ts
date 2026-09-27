// The Google speech adapter's request and error mapping, against a stand-in for Google's
// HTTP endpoint (ADR 0008). The real call is verified by hand (no credentials here).
// requires live verification in Claude Code session

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../config.js';
import { rateFor, SpeechError } from '../gateway.js';
import { chirp3Locale, GoogleSpeech } from '../google.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-used',
  ADMIN_TOKEN_SECRET: 'test-admin-secret-0123456789abcdef0123',
  LLM_BACKEND: 'disabled',
  SPEECH_BACKEND: 'google',
  GOOGLE_CLOUD_PROJECT: 'learnbuddy-test',
});
const token = { getAccessToken: async () => 'tok' };
const input = {
  text: 'Hallo Lena.',
  locale: 'de-DE',
  voice: 'warm' as const,
  rate: 0.88,
  timeoutMs: 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GoogleSpeech', () => {
  it('asks the EU endpoint for the Chirp 3 HD voice with only the text, and returns MP3', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ audioContent: Buffer.from('ID3-audio').toString('base64') }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await new GoogleSpeech(config, token).synthesize(input);
    expect(out).toEqual({ mime: 'audio/mpeg', audio: Buffer.from('ID3-audio') });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu-texttospeech.googleapis.com/v1/text:synthesize');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer tok',
      'x-goog-user-project': 'learnbuddy-test',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      input: { text: 'Hallo Lena.' },
      voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Sulafat' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.88 },
    });
  });

  it('maps provider answers to the shared outcome classes', async () => {
    const answer = (status: number) => vi.fn(async () => new Response('{}', { status }));
    const kindFor = async (f: () => Promise<Response>) => {
      vi.stubGlobal('fetch', f);
      try {
        await new GoogleSpeech(config, token).synthesize(input);
        return 'ok';
      } catch (err) {
        return err instanceof SpeechError ? err.kind : 'other';
      }
    };
    expect(await kindFor(answer(429))).toBe('rate_limited');
    expect(await kindFor(answer(503))).toBe('unavailable');
    expect(await kindFor(answer(400))).toBe('refused');
    expect(await kindFor(answer(200))).toBe('refused'); // no audio in the answer
    expect(
      await kindFor(async () => {
        throw Object.assign(new Error('t'), { name: 'TimeoutError' });
      }),
    ).toBe('timeout');
    expect(await kindFor(async () => Promise.reject(new TypeError('fetch failed')))).toBe(
      'unavailable',
    );
    const noToken = new GoogleSpeech(config, { getAccessToken: async () => null });
    await expect(noToken.synthesize(input)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reads a region it lacks in the language’s main one, and nothing it cannot', () => {
    expect(chirp3Locale('fr-FR')).toBe('fr-FR');
    expect(chirp3Locale('de-AT')).toBe('de-DE');
    expect(chirp3Locale('en-NZ')).toBe('en-GB');
    expect(chirp3Locale('ja-JP')).toBeNull();
  });
});

describe('rateFor', () => {
  it('steps the speed and makes "langsam" slower still', () => {
    expect([-2, -1, 0, 1, 2].map((s) => rateFor(s, false))).toEqual([0.75, 0.88, 1, 1.12, 1.25]);
    expect(rateFor(0, true)).toBe(0.8);
    expect(rateFor(-2, true)).toBe(0.6);
    expect(rateFor(9, false)).toBe(1.25);
  });
});
