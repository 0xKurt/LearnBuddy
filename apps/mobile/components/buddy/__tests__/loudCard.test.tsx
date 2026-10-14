// One primary per screen (HANDOFF §4, #599 correction): the final walkthrough found three filled
// "Los geht's" in view — two offers in the thread under a bar on top that held the primary.

import type { ActionView, MessageView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';
import { loudCard } from '../extensions.js';

// The app as it runs: the learning domain's cards are given at start (app/_layout.tsx).
registerLearning();

const AT = '2026-10-13T08:00:00.000Z';

function offer(n: number, text: string, part: Partial<ActionView> = {}): ActionView {
  return {
    id: `0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    status: 'applied',
    undoable: false,
    created_at: AT,
    summary: {
      tool: 'offer_learning',
      kind: 'practice',
      material_id: null,
      text,
      goal_id: null,
      difficulty: null,
      direction: null,
      minutes: null,
      startable: true,
      finished_session_id: null,
    },
    ...part,
  };
}

function said(n: number, actions: ActionView[]): MessageView {
  return {
    id: `0000000${n}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
    role: 'buddy',
    text: `Vorschlag ${n}`,
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions,
    roleplay_feedback: null,
    created_at: AT,
  };
}

const older = offer(1, 'Brüche kürzen');
const newest = offer(2, 'Brüche erweitern');
const thread = [said(1, [older]), said(2, [newest])];

/** The paper button has a hairline, the filled one none (components/lb/Btn.tsx). */
const filled = (button: HTMLElement): boolean =>
  styleOf(button.firstElementChild!).borderTopWidth !== '1px';
const starts = () => screen.getAllByRole('button', { name: /Los geht/ });

describe('which card’s start is the filled one', () => {
  it('is the newest offer; older ones keep their button on paper', () => {
    expect(loudCard(thread, 'primary')).toBe(newest.id);
    renderInApp(<Conversation messages={thread} pending={null} busy={false} />);
    expect(starts().map(filled)).toEqual([false, true]);
  });

  it('is none while the bar on top holds the primary', () => {
    expect(loudCard(thread, 'soft')).toBeNull();
    renderInApp(<Conversation messages={thread} pending={null} busy={false} quiet="soft" />);
    expect(starts().map(filled)).toEqual([false, false]);
  });

  it('skips what cannot be started: taken back, or refused by the server', () => {
    const undone = offer(3, 'Zurückgenommen', { status: 'undone' });
    const refused = offer(4, 'Abgelehnt');
    if (refused.summary.tool === 'offer_learning') refused.summary.startable = false;
    expect(loudCard([...thread, said(3, [undone]), said(4, [refused])], 'primary')).toBe(newest.id);
    expect(loudCard([said(3, [undone])], 'primary')).toBeNull();
  });

  it('draws a notice at its moment, above what was said after it (issue #630)', () => {
    // The device: "Geschafft! 7 Fragen" stood under her later message and read as the answer.
    renderInApp(
      <Conversation
        messages={thread}
        pending={null}
        busy={false}
        placed={{ before: [], after: new Map([[thread[0]!.id, [<p key="r">Geschafft!</p>]]]) }}
        notices={[<p key="w">Buddy arbeitet</p>]}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Vorschlag 1')).toBeLessThan(text.indexOf('Geschafft!'));
    expect(text.indexOf('Geschafft!')).toBeLessThan(text.indexOf('Vorschlag 2'));
    // What is about now still ends the conversation.
    expect(text.indexOf('Vorschlag 2')).toBeLessThan(text.indexOf('Buddy arbeitet'));
  });

  it('skips practice shown again that no longer waits (issue #630)', () => {
    const gone: ActionView = {
      ...offer(6, 'unused'),
      summary: {
        tool: 'show_ready',
        step_id: '00000000-0000-4000-8000-0000000000bb',
        title: 'Arbeitsblatt Brüche',
        question_count: 7,
        est_minutes: 6,
        ready: false,
      },
    };
    expect(loudCard([...thread, said(6, [gone])], 'primary')).toBe(newest.id);
  });

  it('skips an offer whose run she finished (issue #630)', () => {
    const done = offer(5, 'Brüche addieren', {});
    if (done.summary.tool === 'offer_learning')
      done.summary.finished_session_id = '00000000-0000-4000-8000-0000000000aa';
    expect(loudCard([...thread, said(5, [done])], 'primary')).toBe(newest.id);
  });
});
