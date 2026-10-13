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
});
