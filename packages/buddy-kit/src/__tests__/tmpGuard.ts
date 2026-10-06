// The temp dirs of a test run are gone when it ends (issue #449). The kit's tests copy whole
// app trees into temp dirs; left behind, they filled /tmp with 2.8 GB across runs. Every dir a
// run makes carries its run's mark (`helpers.ts` `tmp`), so this checks only its own: other
// runs on the same machine, in parallel, are not counted.

import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** The mark of this run's temp dirs; `tmp` names every dir with it. */
export const RUN_ENV = 'BUDDY_KIT_RUN';

export default function setup(): () => void {
  const run = `${process.pid.toString(36)}${Date.now().toString(36)}`;
  process.env[RUN_ENV] = run;
  return () => {
    const left = readdirSync(tmpdir()).filter((n) => n.startsWith(`buddy-kit-${run}-`));
    if (left.length > 0) {
      throw new Error(
        `${left.length} temp dir(s) of this run were left behind: ${left.join(', ')}`,
      );
    }
  };
}
