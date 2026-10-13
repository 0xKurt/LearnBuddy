import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { MeResponse } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { gateRoute, guardRoute, PRE_APP_ROUTES, profileLeavesTo } from '../gate.js';

type Account = NonNullable<MeResponse['account']>;
const account = (patch: Partial<Account> = {}): Account => ({
  id: '00000000-0000-4000-8000-000000000001',
  locale: 'de',
  pin_set: true,
  deletion_due_at: null,
  deletion_running: false,
  consent_current: true,
  ...patch,
});
type Learner = NonNullable<MeResponse['learner']>;
const learner = { own_consent_due: false } as Learner;

describe('the start gate', () => {
  it('shows the calm "being deleted" screen while a deletion runs (409 deletion_running)', () => {
    expect(gateRoute({ account: account({ deletion_running: true }), learner })).toBe('/deleting');
    // Also when a new privacy text is waiting: agreeing to it is no longer possible.
    expect(
      gateRoute({ account: account({ deletion_running: true, consent_current: false }), learner }),
    ).toBe('/deleting');
  });

  it('otherwise: consent, then the profile, then Buddy', () => {
    expect(gateRoute({ account: null, learner: null })).toBe('/consent');
    expect(gateRoute({ account: account({ consent_current: false }), learner })).toBe('/consent');
    expect(gateRoute({ account: account(), learner: null })).toBe('/profile');
    expect(gateRoute({ account: account(), learner })).toBe('/buddy');
  });

  it('asks her once when she has turned 16 — the parents carried it until then (issue #31)', () => {
    const grown = { own_consent_due: true } as Learner;
    expect(gateRoute({ account: account(), learner: grown })).toBe('/consent');
    // A running deletion still comes first: nothing else can be decided any more.
    expect(gateRoute({ account: account({ deletion_running: true }), learner: grown })).toBe(
      '/deleting',
    );
  });
});

// A direct link reaches any route without passing the start screen (#599): the guard around
// every screen of the root Stack decides from the same `/me`.
describe('the guard around every route', () => {
  const done = { account: account(), learner };
  const noConsent = { account: account({ consent_current: false }), learner: null };
  const noProfile = { account: account(), learner: null };
  const deleting = { account: account({ deletion_running: true }), learner };
  const settled = { signedIn: true, fetching: false, failed: false };

  // Every file under app/, as expo-router names it.
  const files = (dir: string, base = ''): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path, `${base}${name}/`);
      return [`${base}${name.replace(/\.tsx$/, '')}`];
    });
  const routes = files(join(__dirname, '../../app')).filter(
    // Not screens: the Stack itself, and the hook that rewrites incoming links.
    (r) => r !== '_layout' && r !== '+native-intent',
  );
  const inApp = routes.filter((r) => !PRE_APP_ROUTES.has(r));

  it('leaves exactly the pages before the app open; every other route is guarded', () => {
    expect([...PRE_APP_ROUTES].filter((r) => !routes.includes(r))).toEqual([]);
    expect([...PRE_APP_ROUTES].sort()).toEqual(
      [
        '+not-found',
        'consent',
        'deleting',
        'index',
        'profile',
        'reset-password',
        'update',
        'welcome',
      ].sort(),
    );
    for (const r of ['buddy', 'talk', 'pin', 'onboarding', 'settings', 'library', 'memory'])
      expect(inApp, r).toContain(r);
    for (const r of ['history', 'settings/parents', 'material/[id]', 'subject/[id]'])
      expect(inApp, r).toContain(r);
  });

  it('draws the pages before the app whatever is known', () => {
    for (const route of PRE_APP_ROUTES) {
      expect(guardRoute(route, { ...settled, signedIn: false, me: undefined })).toBe('show');
      expect(guardRoute(route, { ...settled, me: noConsent })).toBe('show');
      expect(guardRoute(route, { ...settled, me: done })).toBe('show');
    }
  });

  it('sends every in-app route where the start screen would, before it is drawn', () => {
    for (const route of inApp) {
      expect(guardRoute(route, { ...settled, me: noConsent }), route).toBe('/consent');
      expect(guardRoute(route, { ...settled, me: { account: null, learner: null } })).toBe(
        '/consent',
      );
      expect(guardRoute(route, { ...settled, me: noProfile }), route).toBe('/profile');
      expect(guardRoute(route, { ...settled, me: deleting }), route).toBe('/deleting');
      expect(guardRoute(route, { ...settled, me: done }), route).toBe('show');
    }
  });

  it('draws nothing while it cannot know: no session, or `/me` not there yet', () => {
    expect(guardRoute('talk', { ...settled, signedIn: false, me: done })).toBe('wait');
    expect(guardRoute('talk', { ...settled, me: undefined })).toBe('wait');
    expect(guardRoute('talk', { ...settled, fetching: true, me: undefined })).toBe('wait');
  });

  it('does not send her back into the setup on a kept copy that is being refreshed', () => {
    expect(guardRoute('settings', { ...settled, fetching: true, me: noProfile })).toBe('wait');
    // A finished setup stays on screen through every refresh.
    expect(guardRoute('settings', { ...settled, fetching: true, me: done })).toBe('show');
  });

  it('lets the screen say it itself when `/me` cannot be loaded and nothing is kept', () => {
    expect(guardRoute('settings', { ...settled, failed: true, me: undefined })).toBe('show');
    expect(guardRoute('settings', { ...settled, failed: true, me: noProfile })).toBe('/profile');
  });
});

describe('the profile page with a learner that exists already', () => {
  const done = { account: account(), learner };
  const grown = { account: account(), learner: { own_consent_due: true } as Learner };

  const idle = { saving: false, saved: false, goingOn: false };

  it('leaves as soon as `/me` has a learner it did not make on this visit', () => {
    expect(profileLeavesTo(done, idle)).toBe('/buddy');
    expect(profileLeavesTo(grown, idle)).toBe('/consent');
  });

  it('stays while there is none, while `/me` is unknown, and through its own later steps', () => {
    expect(profileLeavesTo({ account: account(), learner: null }, idle)).toBeNull();
    expect(profileLeavesTo(undefined, idle)).toBeNull();
    // While the answer is being saved, and for the hand-over and the voice after it.
    expect(profileLeavesTo(done, { ...idle, saving: true })).toBeNull();
    expect(profileLeavesTo(done, { ...idle, saved: true })).toBeNull();
  });

  // "The profile exists already": the page loads `/me` itself and goes on to the tour. Once the
  // save is no longer in flight nothing else said "mine", and the page sent her to `/buddy` over
  // the tour it had just opened (review of #619).
  it('does not overrule its own way on when the learner turned out to exist already', () => {
    expect(profileLeavesTo(done, { ...idle, goingOn: true })).toBeNull();
  });
});
