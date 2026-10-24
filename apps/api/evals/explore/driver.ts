// requires live verification in Claude Code session (real API/DB, isolated synthetic learners)
import {
  BuddyHome,
  ReplyStreamEvent,
  SendMessageResponse,
  SessionView,
  StartTopicRequest,
  StartStepResponse,
  type MessageView,
} from '@learnbuddy/shared-types/contracts';
import {
  apiClient,
  type Learner,
  type TestEnv,
  TEST_TICK_SECRET,
} from '../../src/testing/harness.js';

export type Turn = {
  http: number;
  status: string;
  code: string | null;
  replies: string[];
  ms: number;
  text: string;
  id: string;
};
export async function say(
  env: TestEnv,
  l: Learner,
  text: string,
  id = crypto.randomUUID(),
): Promise<Turn> {
  const started = performance.now();
  const res = await env.app.request('/v1/buddy/messages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ client_message_id: id, text }),
    signal: AbortSignal.timeout(90_000),
  });
  const out: Turn = {
    http: res.status,
    status: 'incomplete',
    code: null,
    replies: [],
    ms: 0,
    text,
    id,
  };
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const take = (block: string) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const raw = /^data: (.+)$/m.exec(block)?.[1];
    if (!raw) return;
    const data: unknown = JSON.parse(raw);
    if (event === 'reply') out.replies.push(ReplyStreamEvent.parse(data).text);
    if (event === 'done') {
      const done = SendMessageResponse.parse(data);
      out.status = done.status;
      out.code = done.error_code;
    }
    if (event === 'error') {
      out.status = 'failed';
      out.code = String((data as { code: string }).code);
    }
  };
  try {
    for (let c = await reader?.read(); c && !c.done; c = await reader?.read()) {
      buffer += decoder.decode(c.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        take(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }
    take(buffer);
  } finally {
    reader?.releaseLock();
  }
  await env.flushBackground();
  out.ms = Math.round(performance.now() - started);
  return out;
}
export async function home(l: Learner) {
  return BuddyHome.parse((await l.api.get('/buddy')).body);
}
export async function history(env: TestEnv, l: Learner): Promise<MessageView[]> {
  const api = apiClient(env, l.token); // new client: no cached home window
  const all: MessageView[] = [];
  let before = '';
  for (let page = 0; page < 100; page++) {
    const res = await api.get<{ messages: MessageView[]; has_more: boolean }>(
      `/buddy/thread${before ? `?before=${before}` : ''}`,
    );
    if (res.status !== 200) throw new Error(`history http ${res.status}`);
    all.unshift(...res.body.messages);
    if (!res.body.has_more) return all;
    const next = res.body.messages[0]?.id;
    if (!next || next === before) throw new Error('history cursor stalled');
    before = next;
  }
  throw new Error('history page limit');
}
/** The two real card contracts: generated offers and prepared/announced steps. */
export function visibleOffers(messages: MessageView[]): MessageView['actions'] {
  const unique = new Map<string, MessageView['actions'][number]>();
  for (const message of messages) {
    const actions = [...message.actions];
    if (message.announces)
      actions.push({
        id: message.announces.step_id,
        status: 'applied',
        undoable: false,
        created_at: message.created_at,
        summary: { tool: 'show_ready', ready: true, ...message.announces },
      });
    for (const action of actions) {
      const summary = action.summary;
      if (summary.tool === 'offer_learning' && summary.startable && !summary.finished_session_id)
        unique.set(action.id, action);
      if (
        summary.tool === 'show_ready' &&
        summary.ready &&
        (!summary.outcome || summary.outcome.state === 'running')
      )
        unique.set(`step:${summary.step_id}`, action);
    }
  }
  return [...unique.values()];
}
export type Tap = {
  action: string;
  kind: string;
  route: string;
  http: number;
  session: SessionView | null;
  error: unknown;
};
export async function tap(l: Learner, action: MessageView['actions'][number]): Promise<Tap> {
  const s = action.summary;
  if (s.tool === 'show_ready') {
    const running = s.outcome?.state === 'running' ? s.outcome.session_id : null;
    const res = running
      ? await l.api.get(`/practice/sessions/${running}`)
      : await l.api.post(`/buddy/steps/${s.step_id}/start`);
    const started = StartStepResponse.safeParse(res.body);
    const session = running
      ? SessionView.safeParse(res.body)
      : started.success
        ? SessionView.safeParse(
            started.data.session ??
              (await l.api.get(`/practice/sessions/${started.data.session_id}`)).body,
          )
        : null;
    return {
      action: action.id,
      kind: 'practice',
      route: running ? '/practice/sessions/:id' : '/buddy/steps/:id/start',
      http: res.status,
      session: session?.success ? session.data : null,
      error: session?.success ? null : res.body,
    };
  }
  if (s.tool !== 'offer_learning') throw new Error('simulator: not a visible learning card');
  const route = '/practice/topic';
  // Same optional-field rules as mobile/components/learn/useStartTopic.ts.
  const request = StartTopicRequest.parse({
    client_request_id: action.id,
    kind: s.kind,
    text: s.text.trim(),
    ...(s.goal_id ? { goal_id: s.goal_id } : {}),
    ...(s.material_id ? { material_id: s.material_id } : {}),
    ...(s.difficulty ? { difficulty: s.difficulty } : {}),
    ...(s.direction ? { direction: s.direction } : {}),
    ...(s.minutes ? { minutes: s.minutes } : {}),
    ...(s.figures?.length ? { figures: s.figures } : {}),
  });
  const res = await l.api.post(route, request);
  const parsed = SessionView.safeParse(res.body);
  return {
    action: action.id,
    kind: s.kind,
    route,
    http: res.status,
    session: parsed.success ? parsed.data : null,
    error: parsed.success ? null : res.body,
  };
}
export async function tick(env: TestEnv) {
  env.clock.advance(6 * 60_000);
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  await env.flushBackground();
  if (res.status !== 200) throw new Error(`tick http ${res.status}`);
}
