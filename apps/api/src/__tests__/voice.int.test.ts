// Speech to text: talking instead of typing. docs/architecture.md §Voice.
// requires live verification in Claude Code session (needs a running Postgres)

import type { TranscribeResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POLICIES } from '../lib/limits.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(120_000, 3).toString('base64');

describe.skipIf(!dbReady)('voice', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('writes down a spoken answer, tells the model the mode and language, stores nothing', async () => {
    env.llm.script('transcribe', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('MODE: ANSWER\nEXPECTED LANGUAGE: fr');
      expect(
        req.contents[0]!.parts.some(
          (p) => 'inlineData' in p && p.inlineData.mimeType === 'audio/webm',
        ),
      ).toBe(true);
      return { heard_speech: true, text: ' la chambre ' };
    });
    const res = await l.api.post<TranscribeResponse>('/voice/transcribe', {
      mime: 'audio/webm',
      audio_base64: audio,
      purpose: 'answer',
      lang: 'fr',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'la chambre' });
    const tables = await env.db.query(
      `select 1 from practice_turns union all select 1 from buddy_messages`,
    );
    expect(tables).toEqual([]);
  });

  it('returns empty text for silence, and an honest error when the model is down', async () => {
    env.llm.script(
      'transcribe',
      { json: { heard_speech: false, text: 'ähm' } },
      { error: new LlmError('unavailable', 'down') },
    );
    const silent = await l.api.post<TranscribeResponse>('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(silent.body).toEqual({ text: '' });
    const down = await l.api.post('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(down.status).toBe(503);
  });

  // A dictation has no time limit any more (issue #19): the app cuts a long
  // recording into pieces at pauses and sends them one after another. What the
  // server guarantees for that: each piece is heard with the tail of the earlier
  // ones as context, a broken piece costs neither the rest nor the day's
  // allowance, and every piece counts honestly against the hourly budget.
  it('writes down a long dictation piece by piece, each heard with the tail of the ones before', async () => {
    env.llm.script(
      'transcribe',
      (req) => {
        expect(ScriptedGateway.textOf(req)).not.toContain('SPOKEN JUST BEFORE');
        return { heard_speech: true, text: 'Es war einmal ein Kind,' };
      },
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain(
          "SPOKEN JUST BEFORE (the same dictation's earlier pieces; context only, never write it again): Es war einmal ein Kind,",
        );
        return { heard_speech: true, text: 'das sehr lange erzählte' };
      },
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('das sehr lange erzählte');
        return { heard_speech: true, text: 'und nie unterbrochen wurde.' };
      },
    );
    const texts: string[] = [];
    let tail: string | null = null;
    for (let piece = 0; piece < 3; piece++) {
      const res = await l.api.post<TranscribeResponse>('/voice/transcribe', {
        mime: 'audio/mp4',
        audio_base64: audio,
        purpose: 'message',
        prev_tail: tail,
      });
      expect(res.status).toBe(200);
      texts.push(res.body.text);
      // The app stitches and sends the tail of what was understood so far.
      tail = texts.join(' ').slice(-400);
    }
    expect(texts.join(' ')).toBe(
      'Es war einmal ein Kind, das sehr lange erzählte und nie unterbrochen wurde.',
    );
  });

  it("a broken piece costs neither the other pieces nor the day's allowance", async () => {
    env.llm.script(
      'transcribe',
      { json: { heard_speech: true, text: 'Erstes Stück.' } },
      { error: new LlmError('unavailable', 'down') },
      { json: { heard_speech: true, text: 'Drittes Stück.' } },
      { json: { heard_speech: true, text: 'Zweites Stück, doch noch.' } },
    );
    const piece = (tail: string | null) =>
      l.api.post<TranscribeResponse>('/voice/transcribe', {
        mime: 'audio/mp4',
        audio_base64: audio,
        purpose: 'message',
        prev_tail: tail,
      });
    const first = await piece(null);
    expect(first.status).toBe(200);
    // The second piece fails alone; the first piece's text is not lost with it.
    expect((await piece('Erstes Stück.')).status).toBe(503);
    expect((await piece('Erstes Stück.')).status).toBe(200);
    // A retry of the broken piece stands on its own and can still succeed.
    expect((await piece('Erstes Stück.')).body).toEqual({ text: 'Zweites Stück, doch noch.' });
    // The failed call gave its reservation back: three of the daily allowance used, not four.
    const used = await env.db.one<{ calls: number }>(
      `select coalesce(sum(calls), 0)::int as calls from usage_daily
        where learner_id = $1 and kind = 'transcribe'`,
      [l.learnerId],
    );
    expect(used.calls).toBe(3);
  });

  it('counts every piece against the hourly budget and refuses honestly beyond it', async () => {
    env.llm.script(
      'transcribe',
      { json: { heard_speech: true, text: 'eins' } },
      { json: { heard_speech: true, text: 'zwei' } },
      { json: { heard_speech: true, text: 'wieder da' } },
    );
    const piece = () =>
      l.api.post<TranscribeResponse>('/voice/transcribe', {
        mime: 'audio/mp4',
        audio_base64: audio,
        purpose: 'message',
      });
    expect((await piece()).status).toBe(200);
    expect((await piece()).status).toBe(200);
    const counted = await env.db.one<{ count: number }>(
      `select count from attempt_counters where scope = 'voice' and account_id = $1`,
      [l.accountId],
    );
    expect(counted.count).toBe(2);
    await env.db.query(
      `update attempt_counters set count = $2 where scope = 'voice' and account_id = $1`,
      [l.accountId, POLICIES.voice.limit],
    );
    const refused = await piece();
    expect(refused.status).toBe(429);
    env.clock.hours(1);
    expect((await piece()).status).toBe(200);
  });

  it('refuses an oversized single piece (transport bound; the app cuts long dictations first), and unknown formats', async () => {
    const tooBig = await l.api.post('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: 'A'.repeat(2_100_000),
      purpose: 'message',
    });
    expect(tooBig.status).toBe(422);
    const odd = await l.api.post('/voice/transcribe', {
      mime: 'video/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(odd.status).toBe(422);
    const longTail = await l.api.post('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: audio,
      purpose: 'message',
      prev_tail: 'x'.repeat(500),
    });
    expect(longTail.status).toBe(422);
  });
});
