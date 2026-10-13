import { useHomeAct } from '../../../lib/buddy/useHomeAct.js';
import { ApiError } from '../../../lib/api/apiError.js';
import { messageFor } from '../../../lib/errors.js';
// The receipts under one of Buddy's messages — what he did, with the way back (issue #191).
//
// On the phone the owner saw a green pill with "✓" on one line and "Ein" on the next. The
// sentence was "Eingetragen: Mathearbeit Brüche am Freitag, 2. Oktober". It was a `Text` with
// `flex: 1` sitting NEXT TO the "Rückgängig" button inside a row: the button took the width
// it wanted, the text got what was left, and what was left fitted three letters. The column
// around it also stood in a block that aligns its children to the side, so each receipt was
// only as wide as its own button.
//
// Both causes are structural, and both are visible here: whether the sentence shares a row
// with a button, and whether the column stretches. How many pixels the sentence ends up with
// is not — jsdom lays nothing out; that is tests/web.

import type { ActionView, MessageView } from '@learnbuddy/shared-types/contracts';
import { act, fireEvent, screen } from '@testing-library/react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { commonBox, renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { Conversation } from '../Conversation.js';

// The app as it runs: the learning domain's cards are given at start (app/_layout.tsx).
registerLearning();

/** The real sentence from the owner's phone, 01.10. */
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

function renderThread(onUndo?: (actionId: string) => void) {
  return renderInApp(
    <Conversation
      messages={[buddySaid([PLAN_EXAM])]}
      pending={null}
      busy={false}
      showActions
      onUndo={onUndo}
    />,
  );
}

describe('a receipt gets the whole line (issue #191)', () => {
  it('says what Buddy did in full, not clipped to its first word', () => {
    renderThread();
    // The whole sentence stands as one piece of text. "Ein" was all she could read.
    expect(screen.getByText(SENTENCE)).toBeTruthy();
  });

  it('puts the quiet trigger after the factual receipt instead of inside its text', () => {
    renderThread(vi.fn());
    expect(screen.getByText(SENTENCE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zurücknehmen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rückgängig:/ })).toBeNull();
  });
});

function openUndo(index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Zurücknehmen' })[index]!);
}

describe('the action chooser takes back real actions without a second confirmation', () => {
  it('opens without submitting and hands the chosen exact ID to onUndo once', () => {
    const onUndo = vi.fn();
    renderThread(onUndo);
    openUndo();
    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.getByText('Was du zurücknehmen kannst')).toBeTruthy();
    const action = screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith(PLAN_EXAM.id);
  });

  it('keeps the chosen action busy, locks all rows and permits retry after failure', () => {
    const onUndo = vi.fn();
    const thread = (undoBusy: boolean) => (
      <Conversation
        messages={[buddySaid([PLAN_EXAM, REQUEST_PHOTO])]}
        pending={null}
        busy={false}
        showActions
        undoBusy={undoBusy}
        onUndo={onUndo}
      />
    );
    const view = renderInApp(thread(false));
    openUndo();
    const name = `Rückgängig: ${SENTENCE}`;
    fireEvent.click(screen.getByRole('button', { name }));
    view.rerender(thread(true));
    const running = screen.getByRole('button', { name });
    expect(running.getAttribute('aria-busy')).toBe('true');
    expect(running.getAttribute('aria-disabled')).toBe('true');
    for (const row of screen.getAllByRole('button', { name: /^Rückgängig:/ }))
      expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(running);
    expect(onUndo).toHaveBeenCalledTimes(1);
    view.rerender(thread(false));
    expect(screen.getByRole('button', { name }).getAttribute('aria-busy')).not.toBe('true');
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it('keeps a returned undone row visible and non-actionable', () => {
    const onUndo = vi.fn();
    const view = renderThread(onUndo);
    openUndo();
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    view.rerender(
      <Conversation
        messages={[buddySaid([{ ...PLAN_EXAM, status: 'undone' }])]}
        pending={null}
        busy={false}
        showActions
        onUndo={onUndo}
      />,
    );
    expect(screen.getByText('Zurückgenommen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Rückgängig:/ })).toBeNull();
    expect(screen.getByText(`${SENTENCE} – rückgängig gemacht`)).toBeTruthy();
  });

  it('keeps an immediate HomeAct failure retryable through its committed busy lifecycle', async () => {
    const failure = new ApiError('network', 'transport failed', 0);
    const request = vi.fn().mockRejectedValue(failure);
    const committedBusy: boolean[] = [];
    function Parent() {
      const { busy, act: run } = useHomeAct();
      useLayoutEffect(() => {
        committedBusy.push(busy);
      }, [busy]);
      const [error, setError] = useState<{ actionId: string; text: string } | null>(null);
      return (
        <Conversation
          messages={[buddySaid([PLAN_EXAM])]}
          pending={null}
          busy={false}
          showActions
          undoBusy={busy}
          undoError={error}
          onUndo={(id) => {
            setError(null);
            void run(request, (text) => setError({ actionId: id, text }));
          }}
        />
      );
    }
    renderInApp(<Parent />);
    openUndo();
    const action = () => screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    await act(async () => {
      action().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(screen.getByText(messageFor(failure))).toBeTruthy();
    expect(action().getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => {
      action().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(committedBusy).toContain(true);
    expect(committedBusy.at(-1)).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shows only the selected action error and clears it from a different turn', () => {
    const text = "Keine Verbindung. Check dein Internet und versuch's nochmal.";
    const view = chat({ undoError: { actionId: PLAN_EXAM.id, text } });
    openUndo();
    expect(screen.getByText(text)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    openUndo(1);
    expect(screen.queryByText(text)).toBeNull();
    view.unmount();
  });

  it('does not expose action controls when the caller hides actions', () => {
    chat({ showActions: false });
    expect(screen.queryByRole('button', { name: 'Zurücknehmen' })).toBeNull();
  });

  it('removes stale actions if the chosen turn disappears and after unmount', () => {
    const onUndo = vi.fn();
    const view = renderThread(onUndo);
    openUndo();
    const old = screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    view.rerender(<Conversation messages={[]} pending={null} busy={false} onUndo={onUndo} />);
    expect(screen.queryByRole('button', { name: /^Rückgängig:/ })).toBeNull();
    fireEvent.click(old);
    expect(onUndo).not.toHaveBeenCalled();
    view.unmount();
    fireEvent.click(old);
    expect(onUndo).not.toHaveBeenCalled();
  });
});

const AFTER_PRACTICE = 'Hey Mia – 6 Fragen, alles gleich beim ersten Mal.';

function renderGreeting(action?: ReactNode) {
  return renderInApp(
    <Conversation
      messages={[buddySaid([])]}
      pending={null}
      busy={false}
      sessionStart={{
        afterMessageId: '33333333-3333-4333-8333-333333333333',
        text: AFTER_PRACTICE,
        action,
      }}
    />,
  );
}

describe('the greeting opens on what just happened (issue #195)', () => {
  it('says it in Buddy’s own bubble, as him, once', () => {
    renderGreeting();
    expect(screen.getByText(AFTER_PRACTICE)).toBeTruthy();
    // A screen reader hears who is talking, like any of his messages.
    expect(screen.getByLabelText(`Buddy: ${AFTER_PRACTICE}`)).toBeTruthy();
  });

  it('carries the way into the full view itself, in the same block as the sentence', () => {
    renderGreeting(
      <Btn size="sm" onPress={() => undefined}>
        Ansehen
      </Btn>,
    );
    const sentence = screen.getByText(AFTER_PRACTICE);
    const view = screen.getByRole('button', { name: 'Ansehen' });
    const block = commonBox(sentence, view);
    // The block that holds both is the greeting's own, not the whole conversation: a button
    // in a notice at the end of the thread would only meet the greeting above Buddy's
    // earlier message — which is exactly the two-voices reading the owner saw.
    expect(
      block.contains(screen.getByText('Alles klar, ich habe die Arbeit eingetragen.')),
      'the button belongs to the greeting, not to a card at the end of the conversation',
    ).toBe(false);
    // And they stand one under the other, not side by side in one row.
    expect(styleOf(block).flexDirection, 'the greeting and its button are a column').not.toBe(
      'row',
    );
  });

  it('is just a greeting when there is nothing to look at', () => {
    renderGreeting();
    expect(screen.queryByRole('button', { name: 'Ansehen' })).toBeNull();
  });

  it('stands under the message it was anchored to, not over the conversation', () => {
    renderGreeting();
    // Everything older stays: nothing is cleared or hidden for the fresh page (issue #104).
    expect(screen.getByText('Alles klar, ich habe die Arbeit eingetragen.')).toBeTruthy();
  });
});

// ── One turn, one receipt — and one way back in view (issue #204) ───────────────────────
//
// The owner, on the promo footage of a chat after two things she had done: „das sind drei
// Rückgängig-Knöpfe und vier Statuszeilen für zwei Dinge, die sie getan hat … auf dem Handy
// liest man es noch, im Video (und für ein Kind) ist es eine Wand."
//
// What is checked here is what is rendered: how many lines a turn becomes, how many
// "Rückgängig" stand in the chat, that the rest stays reachable, and that a note which is
// true for every card is said once. How tall any of it is belongs to tests/web.

const REQUEST_PHOTO: ActionView = {
  id: '44444444-4444-4444-8444-444444444444',
  status: 'applied',
  undoable: true,
  summary: {
    tool: 'request_material',
    step_id: '55555555-5555-4555-8555-555555555555',
    title: 'Arbeitsblatt Brüche',
    material_id: null,
  },
  created_at: '2026-10-01T18:00:01.000Z',
};

const PREPARED: ActionView = {
  id: '66666666-6666-4666-8666-666666666666',
  status: 'applied',
  undoable: true,
  summary: {
    tool: 'prepare_practice',
    step_id: '77777777-7777-4777-8777-777777777777',
    title: 'Mathearbeit Brüche',
    question_count: 4,
    est_minutes: 5,
  },
  created_at: '2026-10-01T18:05:00.000Z',
};

const PHOTO_SENTENCE = 'Ich warte auf dein Foto: Arbeitsblatt Brüche';
const PREPARED_SENTENCE = 'Vorbereitet: Mathearbeit Brüche – 4 Aufgaben, ca. 5 Min.';

function laterMessage(actions: ActionView[]): MessageView {
  return {
    ...buddySaid(actions),
    id: '88888888-8888-4888-8888-888888888888',
    text: 'Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.',
    created_at: '2026-10-01T18:05:00.000Z',
  };
}

function chat(props: Partial<Parameters<typeof Conversation>[0]> = {}) {
  return renderInApp(
    <Conversation
      messages={[buddySaid([PLAN_EXAM, REQUEST_PHOTO]), laterMessage([PREPARED])]}
      pending={null}
      busy={false}
      showActions
      receipts="turn"
      onUndo={() => undefined}
      {...props}
    />,
  );
}

describe('one turn is one receipt, with one way back (issue #204)', () => {
  it('says both things of one answer in a single line, not two with two ticks', () => {
    chat();
    // The two sentences are there, as one piece of text — not as two status lines.
    expect(screen.getByText(`${SENTENCE} · ${PHOTO_SENTENCE}`)).toBeTruthy();
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });

  it('offers one chooser per turn in both Chat and History, with every actual action', () => {
    const view = chat();
    expect(screen.getAllByRole('button', { name: 'Zurücknehmen' })).toHaveLength(2);
    openUndo();
    expect(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Rückgängig: ${PHOTO_SENTENCE}` })).toBeTruthy();
    view.unmount();
    chat({ receipts: 'step' });
    expect(screen.getAllByRole('button', { name: 'Zurücknehmen' })).toHaveLength(2);
    openUndo();
    expect(screen.getAllByRole('button', { name: /^Rückgängig:/ })).toHaveLength(2);
  });

  it('chooses either actual action, keeps returned state and leaves the other reachable', () => {
    const onUndo = vi.fn();
    const view = chat({ onUndo });
    openUndo();
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${PHOTO_SENTENCE}` }));
    expect(onUndo).toHaveBeenLastCalledWith(REQUEST_PHOTO.id);
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    view.rerender(
      <Conversation
        messages={[
          buddySaid([PLAN_EXAM, { ...REQUEST_PHOTO, status: 'undone' }]),
          laterMessage([PREPARED]),
        ]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
        onUndo={onUndo}
      />,
    );
    expect(screen.getByText('Zurückgenommen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    expect(onUndo).toHaveBeenLastCalledWith(PLAN_EXAM.id);
  });

  it('opens nothing from a receipt’s words: they are text, not a button (issue #520)', () => {
    chat();
    expect(screen.queryByRole('button', { name: `${SENTENCE} · ${PHOTO_SENTENCE}` })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('what the bar on top already says is not said twice (issue #204)', () => {
  it('keeps the top-carried action available without repeating its receipt', () => {
    const onUndo = vi.fn();
    chat({ carriedOnTop: new Set([PREPARED.id]), onUndo });
    expect(screen.queryByText(PREPARED_SENTENCE)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Zurücknehmen' })).toHaveLength(2);
    openUndo(1);
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${PREPARED_SENTENCE}` }));
    expect(onUndo).toHaveBeenCalledWith(PREPARED.id);
  });
});

describe('"nur hier in der App" is explained once (issue #204)', () => {
  const sentInApp = (id: string, created: string): NonNullable<MessageView['outreach']> => ({
    id,
    kind: 'reminder',
    origin: 'agreed',
    title: 'Übung ist bereit',
    body: 'Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.',
    why: null,
    status: 'in_app',
    send_at: null,
    sent_at: null,
    opened_at: null,
    created_at: created,
  });

  it('says it under the newest of Buddy’s in-app messages, not under every one', () => {
    renderInApp(
      <Conversation
        messages={[
          {
            ...buddySaid([]),
            outreach: sentInApp('99999999-9999-4999-8999-999999999999', '2026-10-01T18:00:00.000Z'),
          },
          {
            ...laterMessage([]),
            outreach: sentInApp('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-01T18:05:00.000Z'),
          },
        ]}
        pending={null}
        busy={false}
      />,
    );
    expect(screen.getAllByText('nur hier in der App')).toHaveLength(1);
  });

  it('keeps a state that is about one message with that message', () => {
    renderInApp(
      <Conversation
        messages={[
          {
            ...buddySaid([]),
            outreach: {
              ...sentInApp('99999999-9999-4999-8999-999999999999', '2026-10-01T18:00:00.000Z'),
              status: 'provider_accepted',
            },
          },
          {
            ...laterMessage([]),
            outreach: sentInApp('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-01T18:05:00.000Z'),
          },
        ]}
        pending={null}
        busy={false}
      />,
    );
    expect(screen.getByText('an dein Handy geschickt')).toBeTruthy();
    expect(screen.getAllByText('nur hier in der App')).toHaveLength(1);
  });
});

describe('what was agreed says where it will appear — once (issue #204)', () => {
  const agreed = (id: string, title: string): ActionView => ({
    id,
    status: 'applied',
    undoable: false,
    summary: {
      tool: 'plan_step',
      step_id: id,
      title,
      date: '2026-10-05',
      time: '17:00',
      agreed: true,
      repeat: null,
      repeat_until: null,
    },
    created_at: '2026-10-01T18:00:00.000Z',
  });

  it('puts the note under the newest arrangement, not into every sentence', () => {
    renderInApp(
      <Conversation
        messages={[
          buddySaid([agreed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vokabeln üben')]),
          laterMessage([agreed('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Brüche üben')]),
        ]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
        contactOn={false}
      />,
    );
    // The sentence is the arrangement, nothing else: the explanation used to be glued to it.
    expect(screen.getByText(/^Verabredet: Vokabeln üben/).textContent).not.toMatch(/App/);
    expect(
      screen.getAllByText('Verabredetes erscheint hier in der App – Benachrichtigungen sind aus.'),
    ).toHaveLength(1);
  });

  it('does not guess that phone contact is disabled while its state is unknown', () => {
    renderInApp(
      <Conversation
        messages={[buddySaid([agreed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vokabeln üben')])]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
      />,
    );
    expect(screen.queryByText(/erscheint hier in der App/)).toBeNull();
  });

  it('says nothing about it when Buddy may message her phone', () => {
    renderInApp(
      <Conversation
        messages={[buddySaid([agreed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vokabeln üben')])]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
        contactOn
      />,
    );
    expect(screen.queryByText(/erscheint hier in der App/)).toBeNull();
  });
});

describe('the feedback after a roleplay is its result card (issue #384, #599)', () => {
  const ended: MessageView = {
    ...buddySaid([]),
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    text: 'Das Rollenspiel ist vorbei – so lief es:\n✓ Begrüßen: geschafft – „Hello“',
    roleplay_feedback: {
      points: [
        { name: 'Begrüßen', met: true, quote: 'Hello' },
        { name: 'Nach dem Preis fragen', met: false, quote: null },
      ],
      better: [{ said: 'How much it costs?', better: 'How much does it cost?' }],
    },
  };

  it('shows each task with its state, her own words and the better line — not the text', () => {
    renderInApp(<Conversation messages={[ended]} pending={null} busy={false} />);
    expect(screen.getByRole('heading', { name: "So lief's" })).toBeTruthy();
    // A managed task carries a tick; the word for it is what a screen reader hears.
    expect(screen.getByLabelText('Geschafft: Begrüßen: „Hello“')).toBeTruthy();
    expect(screen.getByText('Begrüßen')).toBeTruthy();
    expect(screen.getByText('„Hello“')).toBeTruthy();
    expect(screen.getByText('Noch nicht dabei')).toBeTruthy();
    expect(screen.getByText('Nach dem Preis fragen')).toBeTruthy();
    expect(screen.getByText('So klingt es noch besser')).toBeTruthy();
    expect(screen.getByText('„How much it costs?“')).toBeTruthy();
    expect(screen.getByText('„How much does it cost?“')).toBeTruthy();
    // The card takes the text's place: never parsed out of it, and never shown twice.
    expect(screen.queryByText(/Das Rollenspiel ist vorbei/)).toBeNull();
  });

  it('keeps an ordinary message a bubble', () => {
    renderInApp(<Conversation messages={[buddySaid([])]} pending={null} busy={false} />);
    expect(screen.queryByRole('heading', { name: "So lief's" })).toBeNull();
  });
});

describe('redesigned conversation roles', () => {
  it('keeps Buddy text plain while learner text uses the onPrimary role', () => {
    const buddy = buddySaid([]);
    const mine = {
      ...buddy,
      id: '77777777-7777-4777-8777-777777777777',
      role: 'learner' as const,
      text: 'Meine Frage',
    };
    renderInApp(<Conversation messages={[mine, buddy]} pending={null} busy={false} />);
    const answer = screen.getByText(buddy.text);
    expect(styleOf(answer.parentElement!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(styleOf(answer.parentElement!).boxShadow).toBe('');
    const question = screen.getByText(mine.text);
    expect(styleOf(question).color).toBe('rgb(255, 255, 255)');
    expect(styleOf(question.parentElement!).paddingTop).toBe('10px');
  });
  it('keeps a failed learner turn visually distinct and its retry action usable', () => {
    const failed = {
      ...buddySaid([]),
      role: 'learner' as const,
      text: 'Noch nicht gesendet',
      status: 'failed' as const,
    };
    const resend = vi.fn();
    renderInApp(<Conversation messages={[failed]} pending={null} busy={false} onResend={resend} />);
    expect(styleOf(screen.getByText(failed.text).parentElement!).borderTopStyle).toBe('dashed');
    fireEvent.click(screen.getByRole('button', { name: /Nochmal senden/ }));
    expect(resend).toHaveBeenCalledWith(failed);
  });
});
