// The learning domain's names in the core's configuration (src/config.ts, issue #107): the
// practice forms switched off in this environment (FORMS_OFF, issue #296) must be forms it has —
// an unknown name stops the boot rather than switching nothing.

import { ItemKind } from '@learnbuddy/shared-types/contracts';

import type { Config } from '../../config.js';

export function formsOffIssues(config: Pick<Config, 'FORMS_OFF'>): string[] {
  const names = [...config.FORMS_OFF];
  if (names.every((n) => ItemKind.safeParse(n).success)) return [];
  return [
    `FORMS_OFF: FORMS_OFF: unknown form in "${names.join(',')}" (expected ${ItemKind.options.join(', ')})`,
  ];
}
