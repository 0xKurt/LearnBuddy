// Starting a prepared step from a tap outside the conversation — "Jetzt üben" on a phone message
// (POST /buddy/outreach/:id/act). What a step starts is a domain's (in LearnBuddy: a practice run,
// practice/service.ts); it registers how at start-up (modules/learning/register.ts, issue #107).

import type { Deps } from '../../deps.js';

/** Starts the step and returns what it started (a session id); throws an AppError when it cannot. */
type StepStarter = (deps: Deps, learnerId: string, stepId: string) => Promise<string>;

let starter: StepStarter | null = null;

export function registerStepStarter(start: StepStarter): void {
  if (starter) throw new Error('step starter registered twice');
  starter = start;
}

/** What the step started, or null when no domain starts steps (the app then opens Buddy). */
export function startStep(deps: Deps, learnerId: string, stepId: string): Promise<string | null> {
  return starter ? starter(deps, learnerId, stepId) : Promise.resolve(null);
}

/** Whether a domain starts steps (the start-up test asks). */
export function startsSteps(): boolean {
  return starter !== null;
}
