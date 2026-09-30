// Read-only audit reproduction: mutations are confined to disposable test databases.
import { randomUUID } from 'node:crypto';
import { createTestEnv, onboard } from '/Users/kurt/git/LearnBuddy/apps/api/src/testing/harness.ts';
import { loadBuddyState } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/buddy/state.ts';
import { buildContext } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/buddy/context.ts';
import { searchMaterials } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/buddy/connectors/material.ts';
import {
  planSummaries,
  runSummary,
} from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/buddy/summarise.ts';
import { claimJobs } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/scheduler/jobs.ts';
import { LlmError } from '/Users/kurt/git/LearnBuddy/apps/api/src/llm/gateway.ts';

const report = {};
const facts = {
  display_name: 'Lena',
  birth_date: '2013-04-10',
  level: 'school',
  grade: 7,
  locale: 'de',
  isMinor: true,
} as const;
const answer = (reply: string, actions: unknown[] = [], asks_permission = false) => ({
  concern: false,
  also_asked: false,
  reply,
  options: null,
  actions,
  asks_permission,
});
async function isolated(
  name: string,
  run: (
    env: Awaited<ReturnType<typeof createTestEnv>>,
    l: Awaited<ReturnType<typeof onboard>>,
  ) => Promise<unknown>,
) {
  const env = await createTestEnv({ start: '2026-09-28T08:00:00Z', embeddings: 'disabled' });
  try {
    const l = await onboard(env);
    report[name] = await run(env, l);
  } finally {
    await env.close();
  }
}
async function send(l: Awaited<ReturnType<typeof onboard>>, text: string) {
  return l.api.post('/buddy/messages', { client_message_id: randomUUID(), text });
}
async function sheet(
  env: Awaited<ReturnType<typeof createTestEnv>>,
  learnerId: string,
  title: string,
) {
  return env.db.one<{ id: string }>(
    `insert into materials (learner_id,client_request_id,title,status,photo_count,extracted_text,ready_at,created_at)
  values ($1,gen_random_uuid(),$2,'ready',1,$2,$3,$3) returning id`,
    [learnerId, title, env.clock.now()],
  );
}

await isolated('old_sheet_unreachable', async (env, l) => {
  const old = await sheet(env, l.learnerId, 'Latein Einzigartiger Originalzettel');
  for (let i = 0; i < 10; i++) {
    env.clock.advance(1000);
    await sheet(env, l.learnerId, `Neuer Zettel ${i}`);
  }
  const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
  const ctx = buildContext(facts, state, env.clock.now());
  const hits = await searchMaterials(
    env.deps,
    l.learnerId,
    'Europe/Berlin',
    'Latein Einzigartiger',
    3,
  );
  return {
    database_sheet_count: state.totals.materials,
    state_sheet_count: state.materials.length,
    old_sheet_has_alias: [...ctx.aliases.materials.values()].some((x) => x.id === old.id),
    lookup_hits: hits,
    lookup_keys: hits[0] ? Object.keys(hits[0]) : [],
    context_says: ctx.state.split('\n').find((x) => x.includes('of 11 sheets')),
  };
});

await isolated('recurrence_context_and_undo', async (env, l) => {
  const step = await env.db.one<{ id: string }>(
    `insert into buddy_steps (learner_id,kind,title,state,planned_date,planned_time,agreed,repeat,repeat_until) values ($1,'practice','Vokabeln','planned','2026-09-29','17:00',true,'daily','2026-10-02') returning id`,
    [l.learnerId],
  );
  const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
  const ctx = buildContext(facts, state, env.clock.now());
  env.llm.script('buddy_turn', {
    json: answer('Die Wiederholung endet.', [
      {
        tool: 'update_step',
        args: {
          step: 'st1',
          day: null,
          time: null,
          state: null,
          repeat: 'never',
          quote: 'Nicht mehr jeden Tag',
        },
      },
    ]),
  });
  const changed = await send(l, 'Nicht mehr jeden Tag');
  const actual = await env.db.one<{ repeat: string | null; version: number }>(
    `select repeat,version from buddy_steps where id=$1`,
    [step.id],
  );
  const action = await env.db.one<{ id: string; undo: unknown }>(
    `select id,undo from buddy_actions where learner_id=$1 and tool='update_step'`,
    [l.learnerId],
  );
  const undo = await l.api.post(`/buddy/actions/${action.id}/undo`);
  return {
    persisted_repeat: 'daily',
    loaded_has_repeat: Object.hasOwn(state.steps[0]!, 'repeat'),
    context_repeats: ctx.state.includes('repeats daily'),
    changed_status: changed.status,
    actual,
    stored_undo: action.undo,
    undo_response: undo,
  };
});

await isolated('lookup_confirmation_not_recognised', async (env, l) => {
  const target = await sheet(env, l.learnerId, 'Latein Vokabeln');
  env.llm.script(
    'buddy_turn',
    { json: { ...answer(''), lookups: [{ tool: 'search_material', args: { query: 'Latein' } }] } },
    { json: answer('Soll ich das Lateinblatt endgültig löschen?', [], true) },
  );
  const asked = await send(l, 'Lösche bitte das Lateinblatt');
  env.clock.advance(1000);
  env.llm.script(
    'buddy_turn',
    {
      json: answer('Gelöscht.', [
        { tool: 'delete_material', args: { material: 'sh1', quote: 'Ja löschen' } },
      ]),
    },
    { json: answer('Ich muss noch einmal fragen.') },
  );
  const confirmed = await send(l, 'Ja löschen');
  const row = await env.db.one<{ archived_at: Date | null }>(
    `select archived_at from materials where id=$1`,
    [target.id],
  );
  const rejected = await env.db.query(
    `select disposition,errors from buddy_decisions where learner_id=$1 and disposition='rejected'`,
    [l.learnerId],
  );
  return {
    asked_status: asked.status,
    confirmed_status: confirmed.status,
    actually_deleted: row.archived_at !== null,
    rejected,
  };
});

await isolated('unrelated_confirmation_accepts_deletion', async (env, l) => {
  const target = await sheet(env, l.learnerId, 'Latein Vokabeln');
  env.llm.script('buddy_turn', { json: answer('Soll ich eine Matheübung vorbereiten?', [], true) });
  await send(l, 'Vielleicht später Mathe');
  env.clock.advance(1000);
  // Deliberately wrong model decision: the test asks whether the server enforces consent.
  env.llm.script(
    'buddy_turn',
    {
      json: answer('Die Liste ist gelöscht.', [
        { tool: 'delete_material', args: { material: 'sh1', quote: 'Nein die Liste behalten' } },
      ]),
    },
    { json: answer('Nichts gelöscht.') },
  );
  const res = await send(l, 'Nein die Liste behalten');
  const row = await env.db.one<{ archived_at: Date | null }>(
    `select archived_at from materials where id=$1`,
    [target.id],
  );
  return { status: res.status, actually_deleted: row.archived_at !== null };
});

await isolated('sensitive_and_blocked_messages_enter_summary', async (env, l) => {
  const concernText = 'Ich werde zuhause geschlagen';
  const blockedText = 'Ich habe Angst und möchte mir wehtun';
  env.llm.script('buddy_turn', { json: { ...answer(''), concern: true } });
  await send(l, concernText);
  env.clock.advance(1000);
  env.llm.script('buddy_turn', { error: new LlmError('blocked', 'synthetic safety block') });
  await send(l, blockedText);
  env.clock.hours(5);
  env.llm.script('summary', {
    json: { summary: 'Sie wird zuhause geschlagen und möchte sich wehtun.', topics: ['Notlage'] },
  });
  const planned = await planSummaries(env.deps);
  const [job] = await claimJobs(env.db, {
    now: env.clock.now(),
    kinds: ['summarise_session'],
    limit: 1,
    leaseSeconds: 120,
    learnerId: l.learnerId,
  });
  if (!job) throw new Error('no summary job');
  await runSummary(env.deps, job);
  const req = env.llm.callsFor('summary')[0]!;
  const sent = req.contents
    .flatMap((x) => x.parts)
    .map((x) => ('text' in x ? x.text : ''))
    .join('\n');
  const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
  const ctx = buildContext(facts, state, env.clock.now());
  return {
    planned,
    concern_original_sent_to_summary: sent.includes(concernText),
    blocked_original_sent_to_summary: sent.includes(blockedText),
    memories: state.memories.length,
    persisted_summaries: state.summaries,
    derived_sensitive_sentence_in_later_state: ctx.state.includes('Sie wird zuhause geschlagen'),
  };
});

console.log(JSON.stringify(report, null, 2));
