// The learning domain registers itself into the core (issue #107). These tests fail when a domain
// tool, lookup, route, job kind, occasion or its context provider lost its registration, when one
// lands twice, or when the order things are mounted and run in changes.

import { describe, expect, it } from 'vitest';

import { routePlugins } from '../../../http/plugins.js';
import { lookupNames, registerLookups } from '../../buddy/lookups.js';
import {
  contextProvider,
  hasContextProvider,
  registerContextProvider,
} from '../../buddy/provider.js';
import { withoutCode } from '../../buddy/registry.js';
import { startsSteps } from '../../buddy/stepStart.js';
import { subscribersOf } from '../../buddy/events.js';
import { fillsPractice, occasions } from '../../buddy/occasions.js';
import { REVIEW_REASONS, reviewAfterBreak, reviewNextDay, runReviews } from '../../buddy/review.js';
import { missingJobKinds, jobKinds, tickWork } from '../../scheduler/registry.js';
import { actHandler, missingActHandlers, registerActHandlers } from '../../buddy/tools.js';
import { LEARNING_LOOKUPS } from '../lookups.js';
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
  it('leaves exactly its own tools without code, and offers no lookup, until it registers', () => {
    // Module state is per test file: nothing has registered yet.
    expect([...missingActHandlers()].sort()).toEqual([...DOMAIN_TOOLS].sort());
    expect(lookupNames()).toEqual([]);
    expect(() => actHandler('prepare_practice')).toThrow(/no handler/);
    expect(hasContextProvider()).toBe(false);
    expect(() => contextProvider()).toThrow(/No context provider/);
  });

  it('gives every tool and lookup the model can call its code, once, however often start-up runs', () => {
    registerLearning();
    registerLearning();
    expect(withoutCode()).toEqual([]);
    for (const tool of DOMAIN_TOOLS) expect(typeof actHandler(tool)).toBe('function');
    // Its lookups, in the order the prompt lists them, each with its code.
    expect(lookupNames()).toEqual(DOMAIN_LOOKUPS);
    expect(hasContextProvider()).toBe(true);
  });

  it('refuses a second handler for a tool or lookup, and a second context provider', () => {
    registerLearning();
    expect(() => registerActHandlers({ remember: actHandler('remember') })).toThrow(/twice/);
    expect(() => registerLookups(LEARNING_LOOKUPS[2]!)).toThrow(/twice/);
    expect(() => registerContextProvider(contextProvider())).toThrow(/twice/);
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

  it('gives every job kind a handler and adds its background work in one order', () => {
    registerLearning();
    expect(missingJobKinds()).toEqual([]);
    expect(jobKinds('waiting').map((k) => k.kind)).toEqual(['extract_material']);
    expect(jobKinds('erasure').map((k) => k.kind)).toEqual(['purge_photos', 'purge_content']);
    // recovery, idle runs, the photo sweep — the order the tick runs them in.
    expect(tickWork().map((w) => Object.keys(w)[0])).toEqual(['recover', 'closeIdle', 'sweep']);
    expect(tickWork()[2]?.sweep?.key).toBe('swept_photos');
  });

  it('adds its occasions after Buddy: the reviews, and what wakes them', () => {
    registerLearning();
    expect(occasions()).toEqual([{ reasons: REVIEW_REASONS, run: runReviews }]);
    // Buddy wakes first, then the review is planned (events.ts).
    expect(subscribersOf('material_ready')).toHaveLength(2);
    expect(subscribersOf('material_ready')[1]).toBe(reviewNextDay);
    expect(subscribersOf('session_finished')).toHaveLength(2);
    expect(subscribersOf('session_finished')[1]).toBe(reviewAfterBreak);
    expect(subscribersOf('homework_ready')).toEqual([]);
    expect(fillsPractice()).toBe(true);
  });
});
