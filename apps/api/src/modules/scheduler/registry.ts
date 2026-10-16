// What a domain adds to the scheduler (issue #107): the job kinds it owns and the work it adds to
// one run. The domain registers both at start-up (modules/learning/register.ts); the tick runs
// them in the order they were registered and never names the domain.
// docs/architecture.md §Background work.

import type { Deps } from '../../deps.js';
import { CORE_JOB_KINDS, PERSISTENT_KINDS, type JobKind, type JobRow } from './jobs.js';

export type JobHandler = (deps: Deps, job: JobRow) => Promise<void>;

/**
 * Where the tick runs a kind:
 *   waiting — a learner waits for it: claimed right after the recovery, behind the consent gate;
 *   erasure — with the account deletions in the maintenance batch, never behind the consent gate
 *             (a deletion does not wait for a consent).
 */
type JobLane = 'waiting' | 'erasure';

type JobKindSpec = {
  kind: JobKind;
  lane: JobLane;
  run: JobHandler;
  /** An erasure: never parked, retried with backoff until done (jobs.ts `PERSISTENT_KINDS`). */
  persistent?: true;
};

/** What a domain adds to one run. Each part is optional; parts run in registration order. */
type TickWork = {
  /** Right after expired leases: its own work that got stuck because its job gave up. */
  recover?: (deps: Deps) => Promise<void>;
  /** What was left alone past its limit is closed; returns how many (TickStats.idleSessions). */
  closeIdle?: (deps: Deps) => Promise<number>;
  /** A retention sweep no job carries, reported under `key` in the retention stats. */
  sweep?: { key: string; run: (deps: Deps) => Promise<number> };
};

const CORE_KINDS: readonly JobKind[] = CORE_JOB_KINDS;

const kinds: JobKindSpec[] = [];
const work: TickWork[] = [];

/** A kind has exactly one handler: a second one, or one for a core kind, throws. */
export function registerJobKinds(...more: JobKindSpec[]): void {
  for (const spec of more) {
    if (CORE_KINDS.includes(spec.kind) || kinds.some((k) => k.kind === spec.kind)) {
      throw new Error(`job kind registered twice: ${spec.kind}`);
    }
    kinds.push(spec);
  }
}

export function registerTickWork(...more: TickWork[]): void {
  work.push(...more);
}

/** The registered kinds of one lane, in registration order. */
export function jobKinds(lane: JobLane): readonly JobKindSpec[] {
  return kinds.filter((k) => k.lane === lane);
}

/** What the domain adds to one run, in registration order. */
export function tickWork(): readonly TickWork[] {
  return work;
}

/** The kinds retried until done instead of parked: the core's and every registered erasure. */
export function persistentKinds(): JobKind[] {
  return [...PERSISTENT_KINDS, ...kinds.filter((k) => k.persistent).map((k) => k.kind)];
}

/** Whether a job of this kind is retried until done instead of parked (an erasure). */
export function isPersistent(kind: JobKind): boolean {
  return persistentKinds().includes(kind);
}
