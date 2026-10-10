// A rehearsal talk and reading aloud in the chat (issue #264). What is held here:
//
//   · the card Buddy offers is the recorder: the passage to read stands whole on it, the length she
//     was given says itself, and the one button starts the recording — no screen of its own;
//   · the result is Buddy's message, shown as the one "So lief's" list: the length against the
//     length she was given, never a score; a part of the talk "heard" only as the server said;
//   · a recording shorter than the minimum is never stretched to it.

import type { MessageView, RehearsalView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { lengthVerdict, sentDuration, wordsToPractise } from '../../../lib/buddy/rehearsal.js';
import { renderInApp } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';

const PASSAGE =
  'Der kleine Fuchs lief am Morgen durch den Wald. Er suchte etwas zu essen für seine Familie.';

const TALK: RehearsalView = {
  id: '44444444-4444-4444-8444-444444444444',
  kind: 'talk',
  duration_s: 240,
  target_s: 300,
  words: 480,
  words_per_minute: 120,
  fillers: 2,
  skipped: [],
  misread: [],
  structure: [
    { part: 'opening', status: 'heard' },
    { part: 'main', status: 'unknown' },
    { part: 'closing', status: 'not_heard' },
  ],
  step_done: true,
  created_at: '2026-10-10T08:00:00.000Z',
};

function message(over: Partial<MessageView>): MessageView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    role: 'buddy',
    text: 'Los geht’s.',
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions: [],
    roleplay_feedback: null,
    created_at: '2026-10-10T08:00:00.000Z',
    ...over,
  };
}

const show = (m: MessageView) =>
  renderInApp(<Conversation messages={[m]} pending={null} busy={false} showActions />);

describe('the card Buddy offers records her', () => {
  it('shows the whole passage to read and one button to start', () => {
    show(
      message({
        actions: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'applied',
            undoable: false,
            summary: {
              tool: 'offer_rehearsal',
              kind: 'read_aloud',
              title: 'Der kleine Fuchs lief am Morgen …',
              text: PASSAGE,
              minutes: null,
              goal_id: null,
            },
            created_at: '2026-10-10T08:00:00.000Z',
          },
        ],
      }),
    );
    expect(screen.getByTestId('rehearse-text').textContent).toBe(PASSAGE);
    expect(screen.getByText('Lies den Text laut vor. Höchstens 2 Minuten.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aufnahme starten' })).toBeTruthy();
  });

  it('says the length of a talk she was given', () => {
    show(
      message({
        actions: [
          {
            id: '11111111-1111-4111-8111-111111111112',
            status: 'applied',
            undoable: false,
            summary: {
              tool: 'offer_rehearsal',
              kind: 'talk',
              title: 'Vulkane',
              text: null,
              minutes: 5,
              goal_id: '22222222-2222-4222-8222-222222222222',
            },
            created_at: '2026-10-10T08:00:00.000Z',
          },
        ],
      }),
    );
    expect(
      screen.getByText('Vorgesehen sind 5 Minuten. Halte ihn, als ob die Klasse zuhört.'),
    ).toBeTruthy();
  });
});

describe('what a rehearsal measured', () => {
  it('stands as the one result list: length against the given length, pace, sounds, parts', () => {
    show(message({ text: 'Dein Probevortrag dauerte 4:00 Minuten.', rehearsal: TALK }));
    for (const text of [
      '4:00 von 5:00',
      'Etwas kurz – da ist noch Zeit',
      '120 Wörter pro Minute',
      '2-mal „äh“ oder „ähm“',
      'Einleitung',
      'Gehört',
      'Nicht sicher erkannt',
      'Noch nicht gehört',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
  });

  it('names the words of the text to look at again, each once', () => {
    show(
      message({
        rehearsal: {
          ...TALK,
          kind: 'read_aloud',
          target_s: null,
          fillers: null,
          structure: null,
          skipped: ['kleine'],
          misread: ['Wald', 'kleine'],
        },
      }),
    );
    expect(screen.getByText('kleine, Wald')).toBeTruthy();
  });
});

describe('the numbers behind it', () => {
  it('fits within a tenth of the length, at least 15 s either way', () => {
    expect(lengthVerdict(290, 300)).toBe('fits');
    expect(lengthVerdict(240, 300)).toBe('short');
    expect(lengthVerdict(340, 300)).toBe('long');
    expect(lengthVerdict(240, null)).toBeNull();
    expect(wordsToPractise({ skipped: ['Wald'], misread: ['wald', 'seine'] })).toEqual([
      'Wald',
      'seine',
    ]);
  });

  it('sends the real length, never one stretched to the minimum', () => {
    expect(sentDuration('read_aloud', 2_000)).toBeNull();
    expect(sentDuration('read_aloud', 45_000)).toBe(45_000);
    expect(sentDuration('read_aloud', 125_000)).toBe(120_000);
  });
});
