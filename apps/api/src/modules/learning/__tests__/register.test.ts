// The learning domain registers itself into the core (issue #107). These tests fail when a domain
// tool, lookup, route, job kind, occasion or its context provider lost its registration, when one
// lands twice, or when the order things are mounted and run in changes.

import { describe, expect, it } from 'vitest';

import { checkConfig, type Config } from '../../../config.js';
import { Hono } from 'hono';

import type { AppEnv } from '../../../http/context.js';
import { routePlugins } from '../../../http/plugins.js';
import { mountBuddy } from '../../buddy/routes.js';
import { pushDeviceRoutes } from '../../devices/routes.js';
import { identityRoutes } from '../../identity/routes.js';
import { voiceRoutes } from '../../voice/routes.js';
import { ACT_SCHEMAS } from '../../buddy/decision.js';
import { lookupNames, registerLookups } from '../../buddy/lookups.js';
import {
  contextProvider,
  hasContextProvider,
  registerContextProvider,
} from '../../buddy/provider.js';
import { toolsWith, withoutCode } from '../../buddy/registry.js';
import { startsSteps } from '../../buddy/stepStart.js';
import { subscribersOf } from '../../buddy/events.js';
import { fillsPractice, occasions } from '../../buddy/occasions.js';
import { REVIEW_REASONS, reviewAfterBreak, reviewNextDay, runReviews } from '../../buddy/review.js';
import { privacyTables } from '../../identity/privacyTables.js';
import { isPersistent, jobKinds, tickWork } from '../../scheduler/registry.js';
import { actHandler, missingActHandlers, registerActHandlers } from '../../buddy/tools.js';
import { LEARNING_ACT_TOOLS } from '../actTools.js';
import { LEARNING_LOOKUPS } from '../lookups.js';
import { registerLearning } from '../register.js';

/**
 * The tools and lookups that are the learning domain's, not every Buddy's: the guard's list
 * (tools/guards/boundaries.config.mjs, read at run time like DOMAIN_TABLES below), which also
 * tells a core copy which tests are the domain's.
 */
const BOUNDARIES = '../../../../../../tools/guards/boundaries.config.mjs';
const guard = (await import(BOUNDARIES)) as { DOMAIN_TOOLS: string[]; DOMAIN_ROUTES: string[] };
const DOMAIN_LOOKUPS = ['search_material', 'practice_history', 'find_questions'];
const DOMAIN_TOOLS = guard.DOMAIN_TOOLS.filter((t) => !DOMAIN_LOOKUPS.includes(t));

describe('the learning domain in the core', () => {
  it('offers none of its tools and no lookup until it registers', () => {
    // Module state is per test file: nothing has registered yet. Since cut 7b the core does not
    // declare the domain's tools at all, so none of them is offered, and none waits for code.
    expect(missingActHandlers()).toEqual([]);
    for (const tool of DOMAIN_TOOLS) expect(tool in ACT_SCHEMAS).toBe(false);
    expect(lookupNames()).toEqual([]);
    expect(toolsWith('offer')).toEqual(['open_area']);
    expect(toolsWith('prepares')).toEqual([]);
    expect(() => actHandler('prepare_practice')).toThrow(/no handler/);
    expect(hasContextProvider()).toBe(false);
    expect(() => contextProvider()).toThrow(/No context provider/);
  });

  it('gives every tool and lookup the model can call its code, once, however often start-up runs', () => {
    registerLearning();
    registerLearning();
    expect(withoutCode()).toEqual([]);
    for (const tool of DOMAIN_TOOLS)
      expect(typeof actHandler(tool as Parameters<typeof actHandler>[0])).toBe('function');
    // The guard's list is exactly the tools it registers.
    expect(LEARNING_ACT_TOOLS.map((t) => t.name).sort()).toEqual([...DOMAIN_TOOLS].sort());
    // Its lookups, in the order the prompt lists them, each with its code.
    expect(lookupNames()).toEqual(DOMAIN_LOOKUPS);
    expect(hasContextProvider()).toBe(true);
  });

  it('marks its offers and the tool that prepares practice, which the core reads by flag', () => {
    // The home's list of what Buddy did leaves the offers out (buddy/home.ts), and an answer to
    // a sheet starts what prepare_practice prepared (buddy/checkAnswer.ts) — the core names
    // neither tool (#107).
    registerLearning();
    expect([...toolsWith('offer')].sort()).toEqual([
      'offer_drill',
      'offer_learning',
      'offer_rehearsal',
      'open_area',
      'start_roleplay',
    ]);
    expect(toolsWith('prepares')).toEqual(['prepare_practice']);
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
    // Every route it mounts lies under a path the guard knows as the domain's (DOMAIN_ROUTES).
    for (const route of mounted)
      expect(
        guard.DOMAIN_ROUTES.some((p) => route.split(' ')[1]?.startsWith(p)),
        route,
      ).toBe(true);
    // …and every path the guard knows as the domain's is one it mounts: a prefix wider than its
    // routes would leave the core's own specs out of a core copy unseen (packages/buddy-kit).
    for (const prefix of guard.DOMAIN_ROUTES)
      expect(
        mounted.some((r) => r.split(' ')[1]?.startsWith(prefix)),
        prefix,
      ).toBe(true);
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

  it('names no path of the core as its own (DOMAIN_ROUTES stay exactly its routes)', () => {
    // A prefix that also covers a route of the core would leave the core's own specs out of a
    // core copy unseen (packages/buddy-kit/src/core.ts `namesDomain`).
    const core = new Hono<AppEnv>();
    core.route('/', identityRoutes);
    core.route('/', pushDeviceRoutes);
    mountBuddy(core, '/buddy');
    core.route('/voice', voiceRoutes);
    const paths = core.routes.map((r) => r.path);
    expect(paths.length).toBeGreaterThan(10);
    for (const prefix of guard.DOMAIN_ROUTES)
      expect(
        paths.filter((p) => p === prefix || p.startsWith(`${prefix}/`)),
        prefix,
      ).toEqual([]);
  });

  it('checks its forms in the configuration before the app serves (FORMS_OFF, #296)', () => {
    registerLearning();
    const config = (off: string[]) => ({ FORMS_OFF: new Set(off) }) as unknown as Config;
    expect(() => checkConfig(config(['grid_drwa']))).toThrow(/^Invalid configuration: FORMS_OFF: /);
    expect(() => checkConfig(config(['grid_draw', 'find_error']))).not.toThrow();
  });

  it('gives every job kind a handler and adds its background work in one order', () => {
    registerLearning();
    // Its erasures are never parked, as the core's account deletion (docs/privacy.md).
    expect(
      ['purge_photos', 'purge_content', 'delete_account'].every((k) => isPersistent(k as never)),
    ).toBe(true);
    expect(isPersistent('extract_material')).toBe(false);
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

  it('registers exactly the tables the SQL guard calls its own, for export and deletion', async () => {
    registerLearning();
    // The guard's list (tools/guards/boundaries.config.mjs, read at run time: it is not part of
    // the API's program) and the domain's registration name the same tables, so a table the
    // core may not name in SQL is never missing from her export or her deletion.
    const config = '../../../../../../tools/guards/boundaries.config.mjs';
    const { DOMAIN_TABLES } = (await import(config)) as { DOMAIN_TABLES: string[] };
    expect(
      privacyTables()
        .map((t) => t.table)
        .sort(),
    ).toEqual([...DOMAIN_TABLES].sort());
    // Children before their parents: a session's items and turns before the session, a
    // sheet's photos, crops and passages before the sheet, subjects last.
    const order = privacyTables().map((t) => t.table);
    const before = (a: string, b: string) => order.indexOf(a) < order.indexOf(b);
    expect(before('session_items', 'practice_sessions')).toBe(true);
    expect(before('practice_turns', 'practice_sessions')).toBe(true);
    expect(before('item_states', 'items')).toBe(true);
    expect(before('material_photos', 'materials')).toBe(true);
    expect(before('items', 'materials')).toBe(true);
  });
});
