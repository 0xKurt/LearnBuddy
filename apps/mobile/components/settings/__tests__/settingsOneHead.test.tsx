// The settings keep one head while their content arrives (#637, #711). Measured on the POCO X3
// (dev JS, React Profiler, 14.10.): the first open drew the page twice from scratch — the bones
// under one head, then the groups under a second — and mounting Buddy's orb a second time alone
// took ~620 ms. Now the head stands once; Buddy thinks while the bones show, then rests.

import { BuddySettingsView, MeResponse } from '@learnbuddy/shared-types/contracts';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import SettingsScreen from '../../../app/settings.js';
import * as endpoints from '../../../lib/api/endpoints.js';
import * as push from '../../../lib/push.js';
import { renderInApp } from '../../../testing/render.js';

const orbs = vi.hoisted(() => ({ mounted: 0 }));
vi.mock('../../lb/BuddyOrb.js', () => ({
  BuddyOrb: ({ state }: { state?: string }) => {
    useEffect(() => {
      orbs.mounted += 1;
    }, []);
    return <div data-testid="orb" data-state={state} />;
  },
}));

afterEach(() => vi.restoreAllMocks());

it('mounts the head once: Buddy thinks over the bones, then rests over the groups', async () => {
  orbs.mounted = 0;
  onlineManager.setOnline(true);
  const never = () => new Promise<never>(() => undefined);
  let settingsArrive: (v: BuddySettingsView) => void = () => undefined;
  let meArrives: (v: MeResponse) => void = () => undefined;
  vi.spyOn(endpoints, 'getSettings').mockReturnValue(
    new Promise((resolve) => (settingsArrive = resolve)),
  );
  vi.spyOn(endpoints, 'getMe').mockReturnValue(new Promise((resolve) => (meArrives = resolve)));
  vi.spyOn(endpoints, 'getHome').mockImplementation(never);
  vi.spyOn(push, 'registeredHere').mockResolvedValue(false);
  renderInApp(<SettingsScreen />);
  expect(screen.getByTestId('orb').getAttribute('data-state')).toBe('think');
  expect(orbs.mounted).toBe(1);

  await act(async () => {
    settingsArrive(
      BuddySettingsView.parse({
        version: 1,
        voice: 'warm',
        natural_voice: false,
        timezone: 'Europe/Berlin',
        contact_enabled: false,
        only_important: false,
        paused_until: null,
        avoid_weekdays: [],
        preferred_start: '15:00',
        preferred_end: '18:00',
        quiet_start: '20:00',
        quiet_end: '07:00',
        can_loosen: true,
      }),
    );
    meArrives(
      MeResponse.parse({
        consent_version: 'v1',
        capabilities: { model: true, push: false },
        account: {
          id: '55555555-5555-4555-8555-555555555555',
          locale: 'de',
          pin_set: false,
          consent_current: true,
          deletion_due_at: null,
          deletion_running: false,
        },
        learner: {
          id: '66666666-6666-4666-8666-666666666666',
          display_name: 'Lena',
          relation: 'self',
          birth_date: '2010-05-05',
          is_minor: true,
          level: 'school',
          grade: 9,
          locale: 'de',
          curriculum_region: 'by',
          version: 1,
          own_consent_due: false,
        },
      }),
    );
  });
  await waitFor(() => expect(screen.getByTestId('orb').getAttribute('data-state')).toBe('idle'));
  expect(screen.getByText('Profil · Klasse 9')).toBeTruthy();
  expect(orbs.mounted).toBe(1);
});
