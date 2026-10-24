// requires live verification in Claude Code session (scripted gateways, real shared Postgres)
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../testing/harness.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { bumpContext } from '../modules/buddy/plan.js';
import { scriptPronunciationTip } from '../testing/pronunciation.js';
import { openAIClient } from '../llm/openai-client.js';
import { OpenAIAudioGateway } from '../speech/audio.js';

const dbReady = await testDatabaseAvailable();
describe.skipIf(!dbReady)('prepared offline pronunciation (#896)', () => {
  let env: TestEnv, learner: Learner, run: SessionView;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-23T12:00:00Z' });
    learner = await onboard(env, { name: 'Lena' });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Sprechen',
        subject: null,
        items: [
          {
            kind: 'speak',
            prompt: 'Three trees.',
            answer: 'Three trees.',
            confusions: [['free'], ['tries']],
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Sprechen',
            difficulty: 1,
            lang: 'en',
            prompt_lang: 'en',
            figure: null,
            source_excerpt: null,
          },
        ],
      },
    });
    const response = await learner.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: 'Three trees.',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    run = response.body;
  });
  afterEach(() => env.closeChecked());

  const evidence = (first = 'three', confidence = 1) => ({
    source: 'vosk',
    heard: `${first} trees`,
    elapsed_ms: 90,
    unavailable: [],
    words: [
      { heard: first, confidence },
      { heard: 'trees', confidence: 0.99 },
    ],
  });
  const body = (e = evidence(), id = randomUUID()) => ({
    client_turn_id: id,
    item_id: run.items[0]!.item.id,
    evidence: e,
  });
  const take = (input: unknown) =>
    learner.api.post<AnswerResponse>(`/practice/sessions/${run.id}/speak`, input);

  it('persists checked model candidates during preparation and returns the plan to the app', async () => {
    expect(run.items[0]!.item.pronunciation_plan).toEqual({
      version: 1,
      language: 'en',
      words: [
        { expected: 'Three', confusions: ['free'] },
        { expected: 'trees', confusions: ['tries'] },
      ],
    });
    const stored = await env.db.one<{ pronunciation_plan: unknown }>(
      'select pronunciation_plan from items where id = $1',
      [run.items[0]!.item.id],
    );
    expect(stored.pronunciation_plan).toEqual(run.items[0]!.item.pronunciation_plan);
  });
  it('computes the verdict from evidence, sends only breakdown text for tips, and replays duplicates', async () => {
    scriptPronunciationTip(env, 2);
    env.llm.script('safeguard', { json: { concern: false } });
    const input = body(evidence('free'));
    const result = await take(input);
    expect(result.status).toBe(200);
    expect(result.body.verdict).toBe('not_an_attempt');
    expect(result.body.reply.pronunciation?.breakdown?.words[0]?.verdict).toBe('unsicher');
    expect((await take(input)).body.reply.id).toBe(result.body.reply.id);
    expect(env.llm.callsFor('pronounce')).toHaveLength(0);
    const tip = env.llm.callsFor('tutor');
    expect(tip).toHaveLength(1);
    expect(tip[0]!.contents.every((m) => m.parts.every((p) => 'text' in p))).toBe(true);
    expect(JSON.stringify(tip[0]!.contents)).toContain('unsicher');
    const turns = await env.db.query<{ evaluated_by: string }>(
      "select evaluated_by from practice_turns where session_id = $1 and role = 'learner'",
      [run.id],
    );
    expect(turns).toEqual([{ evaluated_by: 'rule' }]);
  });
  it('does not count uncertain evidence as a failed attempt or schedule a review', async () => {
    scriptPronunciationTip(env, 2);
    const result = await take(body(evidence('three', 0.3)));
    expect(result.body.verdict).toBe('not_an_attempt');
    expect(result.body.session.items[0]).toMatchObject({ attempts: 0, status: 'open' });
    expect(
      await env.db.query('select 1 from item_states where item_id = $1', [run.items[0]!.item.id]),
    ).toEqual([]);
  });
  it('uses the audio-hearing provider for online evidence and keeps the tip text-only', async () => {
    const http = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                audible: true,
                heard: 'free trees',
                words: evidence('free').words,
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      }),
    );
    env.deps.llm = new OpenAIAudioGateway(
      openAIClient(
        { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' },
        Object.assign(http, { Response }),
      ),
      env.llm,
    );
    scriptPronunciationTip(env, 2);
    env.llm.script('safeguard', { json: { concern: false } });
    const audio_base64 = Buffer.alloc(100, 1).toString('base64');
    const result = await take({
      client_turn_id: randomUUID(),
      item_id: run.items[0]!.item.id,
      mime: 'audio/wav',
      audio_base64,
    });
    expect(result.status).toBe(200);
    expect(result.body.reply.pronunciation?.breakdown?.words[0]?.verdict).toBe('nochmal');
    expect(http).toHaveBeenCalledTimes(1);
    expect(String(http.mock.calls[0]![0])).toContain('/chat/completions');
    const request = JSON.parse(String(http.mock.calls[0]![1]?.body)) as {
      model: string;
      messages: unknown[];
    };
    expect(request.model).toBe('gpt-audio-1.5');
    expect(JSON.stringify(request.messages)).toContain('input_audio');
    expect(JSON.stringify(request.messages)).toContain(audio_base64);
    expect(env.llm.callsFor('transcribe')).toHaveLength(0);
    expect(env.llm.callsFor('pronounce')).toHaveLength(0);
    expect(
      env.llm.callsFor('tutor')[0]!.contents.every((m) => m.parts.every((p) => 'text' in p)),
    ).toBe(true);
  });
  it('refuses audio mixed with offline evidence and a claimed server evidence source', async () => {
    expect(
      (await take({ ...body(), mime: 'audio/wav', audio_base64: 'x'.repeat(100) })).status,
    ).toBe(422);
    expect(
      (await take({ ...body(), evidence: { ...evidence(), source: 'audio-model' } })).status,
    ).toBe(422);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
  it('checks ownership and the persisted plan before any model call', async () => {
    const other = await onboard(env, { name: 'Sam' });
    expect((await other.api.post(`/practice/sessions/${run.id}/speak`, body())).status).toBe(404);
    await env.db.query('update items set pronunciation_plan = null where id = $1', [
      run.items[0]!.item.id,
    ]);
    expect((await take(body())).status).toBe(409);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
  it('keeps the code verdict when the text tip service is unavailable', async () => {
    env.llm.script('tutor', { json: { malformed: true } });
    const result = await take(body());
    expect(result.status).toBe(200);
    expect(result.body.verdict).toBe('correct');
    expect(result.body.reply.text).toBe('Das klingt passend.');
  });
  it('rejects a result whose learner context changed while the tip was being written', async () => {
    env.llm.script('tutor', async () => {
      await bumpContext(env.db, learner.learnerId);
      return { reply: 'Hör zu.', tips: [null, null] };
    });
    expect((await take(body())).status).toBe(409);
    expect(
      await env.db.query('select 1 from practice_turns where session_id = $1', [run.id]),
    ).toEqual([]);
    expect(
      await env.db.query('select 1 from item_states where item_id = $1', [run.items[0]!.item.id]),
    ).toEqual([]);
  });
});
