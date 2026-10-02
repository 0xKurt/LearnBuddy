// Evals never quietly share the live app's model quota (issue #206).
//
// On 01.10.2026 every Vertex model in the project answered 429 for 13 minutes while a video
// was being shot and evals were running — in the same project the app uses. Vertex's quota
// is per project (and the dynamic shared quota is borrowed per moment), so an eval run of
// a few hundred calls competes directly with a child waiting for Buddy's answer.
//
// Every eval runner builds its config from `evalEnv()` instead of `process.env`:
//
//   EVAL_GOOGLE_CLOUD_PROJECT=lb-evals            the project evals run in (required)
//   EVAL_GOOGLE_APPLICATION_CREDENTIALS=…json     its service account, if it has its own
//   EVAL_GOOGLE_VERTEX_LOCATION=europe-west4      optional, else the app's location
//
// Without EVAL_GOOGLE_CLOUD_PROJECT the run stops before its first call and says why. Using
// the live project anyway is possible, but only on purpose: EVAL_SHARE_LIVE_QUOTA=1 — for the
// day the owner has not created the second project yet and accepts the risk for one run.
// Either way the requests carry the label traffic=eval (llm/vertex.ts requestLabels), so the
// bill shows what the evals cost and in which project.
//
// Pure apart from reading .env.local: `resolveEvalEnv` decides, `evalEnv` loads and applies.
// Proven in evals/__tests__/eval-env.test.ts.
// requires live verification in Claude Code session (decides where live-model eval calls go)

import { config as loadDotenv } from 'dotenv';

export type Env = Record<string, string | undefined>;

export type EvalEnv = {
  env: Env;
  /** What the runner prints once before it starts, so a log says where the calls went. */
  notice: string;
};

export class EvalEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalEnvError';
  }
}

/** Decides which project an eval run talks to. Throws when that would be the live quota by accident. */
export function resolveEvalEnv(env: Env): EvalEnv {
  const live = env.GOOGLE_CLOUD_PROJECT?.trim() || undefined;
  const evalProject = env.EVAL_GOOGLE_CLOUD_PROJECT?.trim() || undefined;
  const share = env.EVAL_SHARE_LIVE_QUOTA === '1';

  if (evalProject && evalProject === live && !share)
    throw new EvalEnvError(
      `EVAL_GOOGLE_CLOUD_PROJECT is the app's own project (${live}): evals would share the ` +
        'live quota (issue #206). Point it at a separate project, or set EVAL_SHARE_LIVE_QUOTA=1 ' +
        'to run against the live quota on purpose.',
    );

  if (evalProject) {
    const credentials = env.EVAL_GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const location = env.EVAL_GOOGLE_VERTEX_LOCATION?.trim();
    return {
      env: {
        ...env,
        GOOGLE_CLOUD_PROJECT: evalProject,
        // A service account of the live project must not be what the eval project uses by
        // accident either: the inline JSON (Vercel's form) would win over the file, so it
        // is dropped whenever the eval project has its own file.
        ...(credentials
          ? {
              GOOGLE_APPLICATION_CREDENTIALS: credentials,
              GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
            }
          : {}),
        ...(location ? { GOOGLE_VERTEX_LOCATION: location } : {}),
        LLM_TRAFFIC: 'eval',
      },
      notice: `eval traffic → project ${evalProject} (separate from the app's quota)`,
    };
  }

  if (share)
    return {
      env: { ...env, LLM_TRAFFIC: 'eval' },
      notice:
        `eval traffic → project ${live ?? '(unset)'} — the LIVE quota, by EVAL_SHARE_LIVE_QUOTA=1. ` +
        'A child using the app now competes with this run (issue #206).',
    };

  throw new EvalEnvError(
    'Evals need their own Vertex project: set EVAL_GOOGLE_CLOUD_PROJECT (and, if it has its own ' +
      'service account, EVAL_GOOGLE_APPLICATION_CREDENTIALS). Running them against the app’s ' +
      'project throttled the live app on 01.10.2026 (issue #206); EVAL_SHARE_LIVE_QUOTA=1 does ' +
      'it anyway, on purpose. docs/SETUP-VERTEX.md §Evals.',
  );
}

let applied: Env | null = null;

/**
 * `.env.local` + the environment, resolved for an eval run and written back onto
 * `process.env` — Google's client libraries read the credentials file from there, not from
 * the config. Prints once where the calls go; a second call returns the same result.
 */
export function evalEnv(): Env {
  if (applied) return applied;
  loadDotenv({ path: '.env.local', quiet: true });
  const resolved = resolveEvalEnv(process.env);
  for (const [key, value] of Object.entries(resolved.env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  console.error(resolved.notice);
  applied = resolved.env;
  return applied;
}
