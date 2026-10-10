// A Buddy without the learning domain (issue #107): nothing is registered, and the core still
// draws a calm conversation — Markdown without its markers, no empty card or blank receipt for
// a tool nobody draws, and a ⋯ menu with only its places.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';
import { StartSheets } from '../StartSheets.js';

const OFFER: MessageView = {
  id: '33333333-3333-4333-8333-333333333333',
  role: 'buddy',
  text: 'Das ist **wichtig**: $\\frac{1}{2}$',
  status: 'done',
  failure_code: null,
  client_message_id: null,
  options: null,
  reply_to_id: null,
  outreach: null,
  actions: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'applied',
      undoable: false,
      summary: {
        tool: 'offer_learning',
        kind: 'practice',
        material_id: null,
        text: 'Brüche',
        goal_id: null,
        difficulty: null,
        direction: null,
        minutes: null,
        startable: true,
      },
      created_at: '2026-10-01T18:00:00.000Z',
    },
  ],
  roleplay_feedback: null,
  created_at: '2026-10-01T18:00:00.000Z',
};

describe('the core without a domain', () => {
  it('shows a reply as plain text, its markers gone and its notation as written', () => {
    renderInApp(<Conversation messages={[OFFER]} pending={null} busy={false} showActions />);
    expect(screen.getByText('Das ist wichtig: $\\frac{1}{2}$')).toBeTruthy();
  });

  it('leaves out an action nobody draws: no card, no empty receipt', () => {
    renderInApp(<Conversation messages={[OFFER]} pending={null} busy={false} showActions />);
    expect(screen.queryByText('Brüche')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('opens the ⋯ menu with its places only', () => {
    renderInApp(
      <StartSheets
        menuOpen
        onCloseMenu={() => undefined}
        next={[]}
        send={() => undefined}
        canStart
      />,
    );
    expect(screen.getByRole('button', { name: 'Einstellungen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hausaufgabe' })).toBeNull();
  });
});
