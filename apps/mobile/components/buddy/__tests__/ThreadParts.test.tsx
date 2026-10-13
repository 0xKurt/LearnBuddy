// What hangs on one of Buddy's lines (#599; design components/buddy/Message.jsx:17–19,
// ui_kits/app/Chat.jsx:20, Gaps.jsx:83–85, Flows.jsx:196): his mini orb at the newest line only,
// the receipt chip, the quiet "Zurücknehmen", her quick answers as chips. Before, his lines
// started at the page edge without an orb, a receipt was a small line with a tick, and
// "Zurücknehmen" a bold ghost button.

import type { ActionView, MessageView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';

const SENTENCE = 'Eingetragen: Mathearbeit Brüche am Freitag, 2. Oktober';

const PLAN_EXAM: ActionView = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'applied',
  undoable: true,
  summary: {
    tool: 'plan_exam',
    goal_id: '22222222-2222-4222-8222-222222222222',
    title: 'Mathearbeit Brüche',
    due_date: '2026-10-02',
    subject_name: 'Mathe',
  },
  created_at: '2026-10-01T18:00:00.000Z',
};

function buddySaid(actions: ActionView[]): MessageView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    role: 'buddy',
    text: 'Alles klar, ich habe die Arbeit eingetragen.',
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions,
    roleplay_feedback: null,
    created_at: '2026-10-01T18:00:00.000Z',
  };
}

function renderThread() {
  return renderInApp(
    <Conversation
      messages={[buddySaid([PLAN_EXAM])]}
      pending={null}
      busy={false}
      showActions
      onUndo={vi.fn()}
    />,
  );
}

describe('Buddy’s line stands beside his mini orb (Message.jsx:17–19, #599)', () => {
  const older = { ...buddySaid([]), id: '88888888-8888-4888-8888-888888888888', text: 'Erstens.' };
  const newest = {
    ...buddySaid([]),
    id: '99999999-9999-4999-8999-999999999999',
    text: 'Zweitens.',
  };
  /** The row a line stands in: the orb's column, then the text. */
  const rowOf = (text: string) => screen.getByText(text).closest('[style*="flex-direction: row"]')!;

  it('shows the orb beside the newest line only; an older line keeps its column', () => {
    renderInApp(<Conversation messages={[older, newest]} pending={null} busy={false} />);
    expect(screen.getAllByTestId('thread-orb')).toHaveLength(1);
    expect(rowOf('Zweitens.').contains(screen.getByTestId('thread-orb'))).toBe(true);
    const column = rowOf('Erstens.').firstElementChild!;
    expect(styleOf(column).width).toBe('26px');
    expect(column.childElementCount).toBe(0);
    expect(styleOf(rowOf('Erstens.')).gap).toBe('10px');
  });

  it('hands the orb to the dots while he is writing, never two at once', () => {
    renderInApp(<Conversation messages={[older, newest]} pending={{ text: 'Und dann?' }} busy />);
    const orbs = screen.getAllByTestId('thread-orb');
    expect(orbs).toHaveLength(1);
    expect(screen.getByLabelText('Buddy schreibt …').contains(orbs[0]!)).toBe(true);
  });

  it('keeps the orb at the greeting only until Buddy says something after it', () => {
    const greeting = { afterMessageId: older.id, text: 'Hi, Mia!' };
    const view = renderInApp(
      <Conversation messages={[older]} pending={null} busy={false} sessionStart={greeting} />,
    );
    // The greeting closes the thread: it is his newest line.
    expect(rowOf('Hi, Mia!').contains(screen.getByTestId('thread-orb'))).toBe(true);
    // He answers later in the same visit; the greeting stays where it was said.
    view.rerender(
      <Conversation
        messages={[older, newest]}
        pending={null}
        busy={false}
        sessionStart={greeting}
      />,
    );
    expect(screen.getAllByTestId('thread-orb')).toHaveLength(1);
    expect(rowOf('Zweitens.').contains(screen.getByTestId('thread-orb'))).toBe(true);
    expect(rowOf('Hi, Mia!').firstElementChild!.childElementCount).toBe(0);
  });

  it('gives her own bubble no orb column', () => {
    const mine = { ...buddySaid([]), role: 'learner' as const, text: 'Meine Frage' };
    renderInApp(<Conversation messages={[mine]} pending={null} busy={false} />);
    expect(screen.queryByTestId('thread-orb')).toBeNull();
  });
});

describe('a receipt is the canvas chip, its way back a quiet line (Chat.jsx:20, Gaps.jsx:83, #599)', () => {
  it('draws the receipt as a 34 pt chip with its sign, under the line’s text', () => {
    renderThread();
    const chip = screen.getByText(SENTENCE).parentElement!;
    expect(styleOf(chip).minHeight).toBe('34px');
    // A pill on one line (20 is more than half of 34); a sentence that wraps keeps soft corners.
    expect(styleOf(chip).borderTopLeftRadius).toBe('20px');
    expect(styleOf(chip).borderTopWidth).toBe('1px');
    expect(screen.getByText(SENTENCE).style.lineHeight).toBe('20px');
    // The calendar for what went into her calendar; the sign before the words.
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(styleOf(chip.parentElement!).paddingLeft).toBe('36px');
  });

  it('keeps "Zurücknehmen" quiet: ink-2 600 14 with the undo sign, not a primary button', () => {
    renderThread();
    const label = screen.getByText('Zurücknehmen');
    // What the text declares itself: jsdom's cascade lets react-native-web's reset win over it.
    expect([label.style.fontWeight, label.style.fontSize]).toEqual(['600', '14px']);
    expect(label.style.color).not.toBe(screen.getByText(SENTENCE).style.color);
    expect(label.previousElementSibling?.tagName.toLowerCase()).toBe('svg');
    const button = screen.getByRole('button', { name: 'Zurücknehmen' });
    expect(styleOf(button).paddingLeft).toBe('34px');
    expect(styleOf(button).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('offers her quick answers as chips under the line', () => {
    const onOption = vi.fn();
    const asked = { ...buddySaid([]), options: ['Brüche vergleichen', 'Später'] };
    renderInApp(
      <Conversation messages={[asked]} pending={null} busy={false} onOption={onOption} />,
    );
    const chip = screen.getByText('Brüche vergleichen').parentElement!;
    expect(styleOf(chip).minHeight).toBe('34px');
    fireEvent.click(screen.getByRole('button', { name: 'Später' }));
    expect(onOption).toHaveBeenCalledWith(asked.id, 'Später');
  });
});
