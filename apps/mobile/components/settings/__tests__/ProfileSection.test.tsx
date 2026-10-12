// requires live verification in Claude Code session — navigation is the platform edge;
// the actual Settings/Profile browser cases verify route history and the full destination.
import { LearnerView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { router } from 'expo-router';
import { renderInApp } from '../../../testing/render.js';
import { ProfileSection } from '../ProfileSection.js';
const learner = LearnerView.parse({
  id: '11111111-1111-4111-8111-111111111111',
  relation: 'child',
  display_name: 'Mia',
  birth_date: '2013-01-01',
  is_minor: true,
  level: 'school',
  grade: 6,
  locale: 'de',
  curriculum_region: 'he',
  version: 2,
  own_consent_due: false,
});
afterEach(() => vi.restoreAllMocks());
it('opens the factual Profile destination through navigation without presenting a modal', () => {
  const push = vi.spyOn(router, 'push').mockImplementation(() => undefined);
  renderInApp(<ProfileSection learner={learner} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mia, Profil · Klasse 6' }));
  expect(push).toHaveBeenCalledWith('/settings/profile');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
});
