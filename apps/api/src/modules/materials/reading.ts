// The extraction job: the first reading of a sheet (firstReading.ts), or one more reading for a
// spot she settled (clarifiedReading.ts). docs/architecture.md §Material.

import type { Deps } from '../../deps.js';
import type { JobRow } from '../scheduler/jobs.js';
import { runClarifiedReading } from './clarifiedReading.js';
import { runFirstReading } from './firstReading.js';

/** The extraction job. Idempotent: a re-run after a crash starts over for the same material. */
export async function runExtraction(deps: Deps, job: JobRow): Promise<void> {
  // A reading the learner's own answer asked for (issue #164 point 1): the same job kind and the
  // same photos, told one fact the photo could not give. It never touches the sheet's status —
  // the sheet has been `ready` and usable since its first reading.
  const spotId = job.payload.unclear_spot_id;
  if (typeof spotId === 'string') return runClarifiedReading(deps, job, spotId);
  return runFirstReading(deps, job);
}
