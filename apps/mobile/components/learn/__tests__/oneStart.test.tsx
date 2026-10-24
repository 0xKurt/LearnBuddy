// One start per practice on the screen (issue #846, CLAUDE.md rule 19): on the device the bar on
// top said "Vokabeln Unité 3 · Jetzt üben" and the chat card under Buddy's answer "Vokabeln Unité 3
// · Los geht's" — two controls for one thing. While the bar holds a practice, its card in the
// thread keeps its words and leaves the start (or "Weitermachen") to the bar.

import type { ActionSummary, BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { HomeLayout } from '../../../lib/homeLayout.js';
import { barPractice, LearningHome } from '../../../lib/learning/homeScope.js';
import { renderInApp } from '../../../testing/render.js';
import { OfferCard } from '../OfferCard.js';
import { ReadyCard } from '../ReadyCard.js';
import { Conversation } from '../../buddy/Conversation.js';
import { registerLearning } from '../../../lib/learning/register.js';

registerLearning();

const STEP = '00000000-0000-4000-8000-0000000000bb';
const RUN = '00000000-0000-4000-8000-0000000000cc';

const READY: Extract<ActionSummary, { tool: 'show_ready' }> = {
  tool: 'show_ready',
  step_id: STEP,
  title: 'Vokabeln Unité 3',
  question_count: 6,
  est_minutes: 5,
  ready: true,
  outcome: null,
};

const OFFER: Extract<ActionSummary, { tool: 'offer_learning' }> = {
  tool: 'offer_learning',
  kind: 'practice',
  material_id: null,
  text: 'Brüche',
  goal_id: null,
  difficulty: null,
  direction: null,
  minutes: null,
  startable: true,
  finished_session_id: null,
  running_session_id: RUN,
  pictures_shown: null,
};

const LAYOUT: HomeLayout = {
  bar: null,
  failed: false,
  result: false,
  decisionInline: false,
  working: null,
  photoAsk: 'thread',
  preparedIn: 'thread',
};

function home(now: BuddyHome['now']): BuddyHome {
  return { now } as BuddyHome;
}

const ready: BuddyHome['now'] = {
  type: 'practice_ready',
  step_id: STEP,
  title: 'Vokabeln Unité 3',
  question_count: 6,
  est_minutes: 5,
  focus_topics: [],
  goal: null,
};
const resume: BuddyHome['now'] = {
  type: 'resume_practice',
  session_id: RUN,
  mode: 'practice',
  title: 'Brüche',
  remaining: 5,
};

function onHome(h: BuddyHome, layout: HomeLayout, card: ReactNode) {
  return renderInApp(
    <LearningHome h={h} layout={layout}>
      {card}
    </LearningHome>,
  );
}

describe('one start per practice on the screen (issue #846)', () => {
  const announcement: MessageView = {
    id: '00000000-0000-4000-8000-0000000000dd',
    role: 'buddy',
    text: 'Aus deinem Blatt habe ich eine Übung gemacht.',
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions: [],
    roleplay_feedback: null,
    created_at: '2026-10-24T08:00:00.000Z',
    announces: READY,
  };
  const announced = (message = announcement) => (
    <Conversation messages={[message]} pending={null} busy={false} />
  );

  it('an announcement leaves the repeated title, count and start to the visible ready bar', () => {
    onHome(home(ready), { ...LAYOUT, bar: 'ready' }, announced());
    expect(screen.getByText(announcement.text)).toBeTruthy();
    expect(screen.queryByText(READY.title)).toBeNull();
    expect(screen.queryByText('6 Aufgaben · ca. 5 Min.')).toBeNull();
  });

  it('a finished announcement leaves the result to its current result card', () => {
    onHome(
      home({ type: 'practice_result', session_id: RUN } as BuddyHome['now']),
      { ...LAYOUT, result: true },
      announced({
        ...announcement,
        announces: { ...READY, outcome: { state: 'done', session_id: RUN } },
      }),
    );
    expect(screen.getByText(announcement.text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ansehen' })).toBeNull();
  });
  it('knows what the bar holds, only while it is shown', () => {
    expect(barPractice(home(ready), { ...LAYOUT, bar: 'ready' })).toEqual({
      step: STEP,
      session: null,
    });
    expect(barPractice(home(resume), { ...LAYOUT, bar: 'resume' })).toEqual({
      step: null,
      session: RUN,
    });
    // She closed the bar on this phone: the card is the start again.
    expect(barPractice(home(ready), LAYOUT)).toEqual({ step: null, session: null });
  });

  it('a waiting practice the bar starts: the card keeps its words, no second start', () => {
    onHome(home(ready), { ...LAYOUT, bar: 'ready' }, <ReadyCard ready={READY} />);
    expect(screen.getByText('Vokabeln Unité 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Los geht's" })).toBeNull();
  });

  it('with the bar closed the card starts it', () => {
    onHome(home(ready), LAYOUT, <ReadyCard ready={READY} />);
    expect(screen.getByRole('button', { name: "Los geht's" })).toBeTruthy();
  });

  it('a running practice the bar continues: no second "Weitermachen"', () => {
    onHome(
      home(resume),
      { ...LAYOUT, bar: 'resume' },
      <ReadyCard ready={{ ...READY, outcome: { state: 'running', session_id: RUN, left: 5 } }} />,
    );
    expect(screen.getByText('Noch 5 Aufgaben')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Weitermachen' })).toBeNull();
  });

  it('an offer whose open run the bar continues: no second start', () => {
    onHome(home(resume), { ...LAYOUT, bar: 'resume' }, <OfferCard actionId="a1" offer={OFFER} />);
    expect(screen.getByText('Brüche')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Los geht's" })).toBeNull();
  });
});
