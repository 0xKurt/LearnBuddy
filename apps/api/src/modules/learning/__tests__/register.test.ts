// The learning domain registers itself into the core (issue #107). The core declares what the
// model can call; these tests fail when a domain tool or lookup lost its registration or when one
// lands twice.

import { describe, expect, it } from 'vitest';

import { routePlugins } from '../../../http/plugins.js';
import { missingLookupRunners, registerLookupRunners } from '../../buddy/lookups.js';
import { withoutCode } from '../../buddy/registry.js';
import { startsSteps } from '../../buddy/stepStart.js';
import { actHandler, missingActHandlers, registerActHandlers } from '../../buddy/tools.js';
import { registerLearning } from '../register.js';

/** The tools and lookups that are the learning domain's, not every Buddy's. */
const DOMAIN_TOOLS = [
  'prepare_practice',
  'request_material',
  'delete_material',
  'rename_material',
  'delete_item',
  'offer_learning',
  'offer_drill',
  'start_roleplay',
  'plan_talk',
  'offer_rehearsal',
] as const;
const DOMAIN_LOOKUPS = ['search_material', 'practice_history', 'find_questions'];

describe('the learning domain in the core', () => {
  it('leaves exactly its own tools and lookups without code until it registers', () => {
    // Module state is per test file: nothing has registered yet.
    expect([...missingActHandlers()].sort()).toEqual([...DOMAIN_TOOLS].sort());
    expect(missingLookupRunners()).toEqual(DOMAIN_LOOKUPS);
    expect(() => actHandler('prepare_practice')).toThrow(/no handler/);
  });

  it('gives every tool and lookup the model can call its code, once, however often start-up runs', () => {
    registerLearning();
    registerLearning();
    expect(withoutCode()).toEqual([]);
    for (const tool of DOMAIN_TOOLS) expect(typeof actHandler(tool)).toBe('function');
  });

  it('refuses a second handler for a tool or lookup', () => {
    registerLearning();
    expect(() => registerActHandlers({ remember: actHandler('remember') })).toThrow(/twice/);
    expect(() => registerLookupRunners({ find_questions: () => Promise.resolve([]) })).toThrow(
      /twice/,
    );
  });

  it('mounts its routes after the core, in one order: practice, sheets, its taps on /buddy', () => {
    registerLearning();
    const mounted = routePlugins().flatMap((p) =>
      p.routes.routes.map((r) => `${r.method} ${p.base}${r.path === '/' ? '' : r.path}`),
    );
    expect(routePlugins().map((p) => p.base)).toEqual(['/practice', '/materials', '/buddy']);
    // The taps that left buddy/routes.ts, and a route of each module, are there.
    expect(mounted).toEqual(
      expect.arrayContaining([
        'POST /practice/sessions',
        'GET /materials',
        'POST /buddy/roleplays/:id/end',
        'POST /buddy/rehearsals',
        'POST /buddy/steps/:id/start',
        'POST /buddy/confirmations/:id',
      ]),
    );
    expect(startsSteps()).toBe(true);
  });
});
