// requires live verification in Claude Code session
import { LearnerView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { ProfileView } from '../ProfileView.js';

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
describe('factual Profile view', () => {
  it('shows actual learner fields without sample email, school form or dead editing controls', () => {
    renderInApp(
      <ProfileView learner={learner}>
        <span>Existing editors</span>
      </ProfileView>,
    );
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Existing editors')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Gymnasium|mail\.de/);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('renders the actual unknown learning level without assigning school or exposing a missing key', () => {
    renderInApp(
      <ProfileView learner={{ ...learner, grade: null, level: 'unknown' }}>{null}</ProfileView>,
    );
    expect(screen.getAllByText('Noch nicht angegeben')).toHaveLength(1);
    expect(screen.queryByText('Schule')).toBeNull();
    expect(document.body.textContent).not.toContain('profile.level_unknown');
  });
  it('does not expose a minor parent account email even when supplied, and shows a factual adult email', () => {
    const view = renderInApp(
      <ProfileView learner={learner} email="parent@example.invalid">
        {null}
      </ProfileView>,
    );
    expect(screen.queryByText('parent@example.invalid')).toBeNull();
    view.rerender(
      <ProfileView
        learner={{ ...learner, is_minor: false, relation: 'self' }}
        email="learner@example.invalid"
      >
        {null}
      </ProfileView>,
    );
    expect(screen.getByText('learner@example.invalid')).toBeTruthy();
  });
  it('omits a missing grade and uses the actual non-school learning level', () => {
    renderInApp(
      <ProfileView learner={{ ...learner, grade: null, level: 'university' }}>{null}</ProfileView>,
    );
    expect(screen.queryByText('Klasse')).toBeNull();
    expect(screen.getAllByText('Studium')).toHaveLength(1);
  });
});
