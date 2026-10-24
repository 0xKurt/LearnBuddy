// requires live verification in Claude Code session (paid, EU endpoint, throwaway DB only)
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../../src/config.js';
import { OpenAIGateway } from '../../src/llm/openai.js';
import { openAIClient } from '../../src/llm/openai-client.js';
import { registerLearning } from '../../src/modules/learning/register.js';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../../src/testing/harness.js';
import { closeSheetBrowser } from '../sheetPhoto.js';
import { GOALS, initialRequests } from './cases.js';
import { choose, PERSONAS, Action, type Persona } from './actor.js';
import { Session, snapshot, type Step } from './session.js';
import { Budget } from './budget.js';
import { advise, calibration, forHumans } from './judge.js';
import { candidate, dedupe, economics, gate, keyOf } from './report.js';
import { OPENAI_EU_PRICES } from '../../src/llm/openai-config.js';
import { listUsd } from '../../src/testing/bench/costs.js';
import type { Finding } from './checks.js';

type Run = Awaited<ReturnType<Session['finish']>> & {
  id: string;
  persona: Persona;
  impressions: unknown[];
  prefix: Step['action'][];
  advisory?: Awaited<ReturnType<typeof advise>>;
  error?: string;
};
type Replay = {
  key: string;
  script: string;
  reused?: boolean;
  attempt: number;
  reproduced: boolean;
  findings: Finding[];
  error: string | null;
  actions: Step['action'][];
  trace: Step[];
};
registerLearning();
if (process.env.LB_TEST_LOCK_HELD !== '1')
  throw new Error('Run pnpm eval:explore (machine lock required)');
if (process.env.LB_TEST_DATABASE_URL !== 'postgres://postgres@127.0.0.1:54316/postgres')
  throw new Error('Only the shared local test Postgres is allowed');
const config = loadConfig({
  ...process.env,
  LLM_BACKEND: 'openai',
  OPENAI_MODEL_SMART: 'gpt-5.4-mini',
  OPENAI_MODEL_FAST: 'gpt-5.4-mini',
  OPENAI_ROUTES: '{}',
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const explorerConfig = {
  ...config,
  OPENAI_MODEL_SMART: 'gpt-4.1-mini' as const,
  OPENAI_MODEL_FAST: 'gpt-4.1-mini' as const,
};
const build = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceHash = createHash('sha256')
  .update(
    readdirSync('evals/explore')
      .filter((f) => f.endsWith('.ts'))
      .sort()
      .map((f) => readFileSync(join('evals/explore', f), 'utf8'))
      .join('\n'),
  )
  .digest('hex');
const replayIndex = process.argv.indexOf('--replay');
const replayFile = replayIndex < 0 ? null : process.argv[replayIndex + 1];
if (replayIndex >= 0 && !replayFile) throw new Error('--replay requires a recorded session file');
const mode = process.argv.includes('--verify-photo')
  ? 'photo-check'
  : replayFile
    ? 'replay'
    : process.argv.includes('--smoke')
      ? 'smoke'
      : 'pilot';
// Operators subtract earlier batch ceilings from the shared pilot allowance.
const budget = new Budget(
  Number(process.env.EXPLORE_MAX_USD ?? 12),
  Number(process.env.EXPLORE_MAX_MINUTES ?? 35) * 60_000,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => budget.stop(`interrupted: ${signal}`));
const buddy = budget.wrap(new OpenAIGateway(config));
const actor = budget.wrap(new OpenAIGateway(explorerConfig));
const maxSteps = Number(process.env.EXPLORE_MAX_STEPS ?? 5);
if (!Number.isInteger(maxSteps) || maxSteps < 3 || maxSteps > 12)
  throw new Error('Steps must be 3..12');
const outDir = process.env.EXPLORE_OUT ?? `../../docs/measurements/explore/${mode}-${Date.now()}`;
mkdirSync(outDir, { recursive: true });
budget.onChange = () =>
  writeFileSync(
    join(outDir, 'budget.json'),
    JSON.stringify(
      {
        spentUsd: budget.spent,
        reservedUsd: budget.reservedUsd,
        receipts: budget.receipts,
      },
      null,
      2,
    ),
  );
const runs: Run[] = [];
const replays: Replay[] = [];
let aborted: string | null = null;
const expected = mode === 'pilot' ? 24 : mode === 'photo-check' ? 6 : mode === 'replay' ? 1 : 2;
const euroRate = Number(process.env.EXPLORE_USD_PER_EUR);
if (!(euroRate > 0)) throw new Error('Set EXPLORE_USD_PER_EUR (dated reference in report)');
const labelData = process.env.EXPLORE_HUMAN_LABELS
  ? (JSON.parse(readFileSync(process.env.EXPLORE_HUMAN_LABELS, 'utf8')) as unknown)
  : [];
const humanCalibration = calibration(labelData);
const create = async (
  p: Persona,
  contact = false,
): Promise<{ env: TestEnv; l: Learner; session: Session }> => {
  const env = await createTestEnv({ gateway: buddy, start: '2026-10-24T10:00:00Z' });
  try {
    const l = await onboard(env, {
      relation: p.age < 16 ? 'child' : 'self',
      birthDate: `${2026 - p.age}-03-10`,
      locale: p.locale,
      contact: contact ? 'yes' : 'no',
      ...(p.age < 16 ? { pin: '4826' } : {}),
    });
    return { env, l, session: new Session(env, l, p.locale, p.age < 16) };
  } catch (error) {
    await env.close();
    throw error;
  }
};
function save() {
  const findings = dedupe(runs.flatMap((r) => r.findings));
  const receiptUsd = budget.receipts.reduce(
    (sum, r) =>
      sum + (r.usage ? (listUsd(OPENAI_EU_PRICES, r.usage) ?? r.usage.costMicros / 1e6) : 0),
    0,
  );
  const allReplayed = findings.every((f) => replays.filter((r) => r.key === keyOf(f)).length === 3);
  const summary = {
    build,
    sourceHash,
    mode,
    models: { buddy: config.OPENAI_MODEL_SMART, explorer: explorerConfig.OPENAI_MODEL_SMART },
    expected,
    completed: runs.length,
    aborted,
    passed: gate(expected, runs.length, findings, aborted, allReplayed),
    repairProbe: process.env.EXPLORE_REPLAY_PROBE === '1',
    limits: { maxSteps, maxUsd: budget.maxUsd, maxMs: budget.maxMs },
    economics: economics(findings, receiptUsd, budget.spent, euroRate),
    humanCalibration,
    humanSample: forHumans(
      runs.flatMap((r) => (r.advisory ? [{ id: r.id, agreement: r.advisory }] : [])),
    ),
    findings,
    replays,
    frequencies: findings.map((f) => {
      const attempts = replays.filter((r) => r.key === keyOf(f));
      return {
        key: keyOf(f),
        attempts: attempts.length,
        complete: attempts.filter((r) => !r.error).length,
        reproduced: attempts.filter((r) => r.reproduced).length,
        divergent: attempts.filter((r) => r.error).length,
      };
    }),
    receipts: budget.receipts,
    runs: runs.map((r) => r.id),
    coverageGaps: [
      'Device audio quality requires controlled recording and human listening.',
      'Short/mixed-language text cannot be reliably language-classified.',
      'Human calibration remains unverified until supplied labels pass the calibration gate.',
      'Standalone speech quality and all free-text paths need separate safeguarding probes.',
    ],
  };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(summary, null, 2));
  writeFileSync(
    join(outDir, 'candidates.json'),
    JSON.stringify(
      findings.map((f) => {
        const run = runs.find((r) => r.findings.some((v) => keyOf(v) === keyOf(f)))!;
        return {
          ...candidate(run.steps, f),
          initial: run.initial,
          goal: run.goal,
          requiredPrefix: run.prefix,
        };
      }),
      null,
      2,
    ),
  );
  return summary;
}
try {
  const available = new Set((await openAIClient(config).models.list()).data.map((m) => m.id));
  if (
    !available.has(config.OPENAI_MODEL_SMART) ||
    !available.has(explorerConfig.OPENAI_MODEL_SMART)
  )
    throw new Error('Required distinct models absent from the EU project model list');
  if (mode === 'photo-check') {
    const goal = GOALS.find((g) => g.expect === 'photo')!;
    for (const persona of PERSONAS.filter((p) => ['new-german', 'italian-parent'].includes(p.id))) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { env, l, session } = await create(persona);
        try {
          const initial = await snapshot(env, l);
          await session.act({ type: 'photo' });
          for (const text of initialRequests(goal, persona.locale))
            await session.act({ type: 'message', text, double: false });
          await session.probeOffers(maxSteps - session.steps.length);
          const result: Run = {
            ...(await session.finish(goal, initial, 0)),
            id: `${persona.id}-photo-check-${attempt}`,
            persona,
            prefix: [],
            impressions: [],
          };
          runs.push(result);
          writeFileSync(join(outDir, `${result.id}.json`), JSON.stringify(result, null, 2));
          save();
          console.info(
            `${result.id}: ${result.findings.map((f) => f.invariant).join(', ') || 'PASS'}`,
          );
        } finally {
          await env.close();
        }
      }
    }
  } else if (replayFile) {
    const recorded = JSON.parse(readFileSync(replayFile, 'utf8')) as Run;
    if (
      !PERSONAS.some((p) => p.id === recorded.persona.id) ||
      !GOALS.some((g) => g.id === recorded.goal.id)
    )
      throw new Error('Unknown recorded persona or goal');
    for (const action of [...recorded.prefix, ...recorded.steps.map((step) => step.action)]) {
      if (action.type !== 'photo' && action.type !== 'tick') Action.parse(action);
    }
    if (process.env.EXPLORE_REPLAY_INVARIANT)
      recorded.findings = recorded.findings.filter(
        (f) => f.invariant === process.env.EXPLORE_REPLAY_INVARIANT,
      );
    if (!recorded.findings.length) throw new Error('No selected findings in recorded session');
    runs.push(recorded);
    writeFileSync(join(outDir, `${recorded.id}.json`), JSON.stringify(recorded, null, 2));
    save();
  } else {
    const personas = mode === 'pilot' ? PERSONAS : PERSONAS.slice(0, 2);
    const rotation = mode === 'pilot' ? 0 : parseInt(build.slice(0, 4), 16) % GOALS.length;
    for (const [pIndex, persona] of personas.entries()) {
      const contact = Array.from(
        { length: mode === 'pilot' ? 3 : 1 },
        (_, n) => GOALS[(pIndex * 3 + n + rotation) % GOALS.length]!.expect,
      ).includes('reminder');
      const { env, l, session } = await create(persona, contact);
      try {
        for (let n = 0; n < (mode === 'pilot' ? 3 : 1); n++) {
          budget.check();
          const goal = GOALS[(pIndex * 3 + n + rotation) % GOALS.length]!;
          const initial = await snapshot(env, l);
          const start = session.steps.length;
          const prefix = session.steps.map((s) => s.action);
          const impressions: unknown[] = [];
          let error: string | undefined;
          let abandoned = false;
          try {
            if (goal.expect === 'photo') await session.act({ type: 'photo' });
            for (const text of initialRequests(goal, persona.locale))
              await session.act({ type: 'message', text, double: persona.id === 'young-reader' });
            if (!abandoned && goal.expect === 'reminder') await session.act({ type: 'tick' });
            while (!abandoned && session.steps.length - start < maxSteps - 1) {
              budget.check();
              const decision = await choose(actor, persona, goal, await session.visible());
              impressions.push(decision);
              await session.act(decision.action);
              if (decision.action.type === 'abort') {
                abandoned = true;
                break;
              }
            }
            // Code probes are independent of the actor’s reported success/frustration.
            await session.probeOffers(maxSteps - (session.steps.length - start));
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
          const result: Run = {
            ...(await session.finish(goal, initial, start)),
            id: `${persona.id}-${goal.id}`,
            persona,
            impressions,
            prefix,
            ...(error ? { error } : {}),
          };
          if (error)
            result.findings.push({
              invariant: 'execution.error',
              kind: goal.expect,
              route: '/explorer',
              evidence: error,
              category: error.startsWith('simulator:') ? 'simulator' : 'infra',
            });
          if (runs.length % 3 === 0)
            result.advisory = await advise(actor, {
              persona,
              goal: goal.wants,
              conversation: (await session.visible()).conversation,
            });
          runs.push(result);
          writeFileSync(join(outDir, `${result.id}.json`), JSON.stringify(result, null, 2));
          save();
          console.info(
            `${runs.length}/${expected} ${result.id}: ${
              dedupe(result.findings)
                .map((f) => f.invariant)
                .join(', ') || 'PASS'
            }; $${budget.spent.toFixed(3)}`,
          );
        }
      } finally {
        await env.close();
      }
    }
  }
  // One fresh script can check several invariants; do not pay twice for identical replays.
  const completedScripts = new Map<string, Replay>();
  // Fixed actions, not another actor improvisation. Full causal prefix, fresh DB each time.
  for (const f of dedupe(runs.flatMap((r) => r.findings))) {
    const original = runs
      .filter((r) => r.findings.some((v) => keyOf(v) === keyOf(f)))
      .sort((a, b) => a.prefix.length + a.steps.length - b.prefix.length - b.steps.length)[0]!;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const script = `${original.id}:${attempt}`;
      const reused = completedScripts.get(script);
      if (reused) {
        replays.push({
          ...reused,
          key: keyOf(f),
          reproduced: reused.findings.some((v) => keyOf(v) === keyOf(f)),
          reused: true,
        });
        save();
        continue;
      }
      budget.check();
      const { env, l, session } = await create(
        original.persona,
        original.initial.settings.contact_enabled,
      );
      let findings: Finding[] = [];
      let error: string | null = null;
      let replayInitial: Awaited<ReturnType<typeof snapshot>> | null = null;
      let replayStart = 0;
      try {
        for (const action of original.prefix) await session.act(action);
        const initial = await snapshot(env, l);
        const start = session.steps.length;
        replayInitial = initial;
        replayStart = start;
        for (const step of original.steps) await session.act(step.action);
        if (process.env.EXPLORE_REPLAY_PROBE === '1')
          await session.probeOffers(12 - (session.steps.length - start));
        findings = (await session.finish(original.goal, initial, start)).findings;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (replayInitial)
          findings = (await session.finish(original.goal, replayInitial, replayStart)).findings;
      } finally {
        await env.close();
      }
      replays.push({
        script,
        key: keyOf(f),
        attempt,
        reproduced: findings.some((v) => keyOf(v) === keyOf(f)),
        findings: dedupe(findings),
        error,
        actions: [...original.prefix, ...original.steps.map((s) => s.action)],
        trace: session.steps,
      });
      completedScripts.set(script, replays.at(-1)!);
      save();
      console.info(
        `replay ${keyOf(f)} ${attempt}/3: ${replays.at(-1)!.reproduced ? 'reproduced' : (error ?? 'not observed')}`,
      );
    }
  }
} catch (error) {
  aborted = error instanceof Error ? error.message : String(error);
  console.error(aborted);
} finally {
  await closeSheetBrowser();
  const summary = save();
  appendFileSync(
    `${process.env.HOME}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`,
    `\n2026-10-24 | child-explorer | #944 | ${budget.receipts.length} | ${budget.spent.toFixed(6)} USD upper | ${mode}: ${outDir}\n`,
  );
  console.info(
    JSON.stringify({
      report: join(outDir, 'report.json'),
      passed: summary.passed,
      ...summary.economics,
    }),
  );
  process.exitCode = summary.passed ? 0 : 1;
}
