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
import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { commonBox, renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { Conversation } from '../Conversation.js';

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

  it('keeps the whole line for the sentence; the way back is a small arrow at its end (#295)', () => {
    renderThread(() => undefined);
    const sentence = screen.getByText(SENTENCE);
    const undo = screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    // Since #295 the arrow stands right after the sentence, on its line — which is only
    // safe because the sentence is the one that gives way (it wraps) and the arrow cannot
    // grow: the old pill took the width it wanted and left three letters ("Ein", #191).
    const row = commonBox(sentence, undo);
    expect(styleOf(row).flexDirection).toBe('row');
    const childOf = (el: Element) => [...ancestors(el)].find((up) => up.parentElement === row);
    expect(styleOf(childOf(sentence) ?? sentence).flexShrink, 'the sentence gives way').toBe('1');
    expect(styleOf(childOf(undo) ?? undo).flexShrink, 'the arrow never shrinks').toBe('0');
    expect(styleOf(sentence).flexShrink, 'and the text inside wraps').toBe('1');
    // No word on it: the round arrow carries the meaning, the label says what it takes back.
    expect(undo.textContent).toBe('');
    // 44 × 44 to the finger, laid out as 24 (the negative margin gives the rest back).
    expect(styleOf(undo).width).toBe('44px');
    expect(styleOf(undo).height).toBe('44px');
  });

  it('stretches across the message block instead of shrinking to its button', () => {
    renderThread(() => undefined);
    const undo = screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    const column = commonBox(screen.getByText(SENTENCE), undo);
    // Buddy's messages sit in a block with `alignItems: 'flex-start'`. Anything inside it
    // that must be wider than its content has to say so.
    const stretching = [...ancestors(column)].some((el) => styleOf(el).alignSelf === 'stretch');
    expect(
      stretching,
      'without alignSelf stretch each receipt is only as wide as its own button',
    ).toBe(true);
  });
});

describe('the way back works (UX-PRINCIPLES: undo over confirmation)', () => {
  it('hands the action id to onUndo when she taps Rückgängig', () => {
    const onUndo = vi.fn();
    renderThread(onUndo);
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    expect(onUndo).toHaveBeenCalledWith(PLAN_EXAM.id);
  });

  it('takes it back at once, without asking first', () => {
    const onUndo = vi.fn();
    renderThread(onUndo);
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('turns the arrow into a spinner while undoing, and back into an arrow if it failed', () => {
    const onUndo = vi.fn();
    const thread = (undoBusy: boolean) => (
      <Conversation
        messages={[buddySaid([PLAN_EXAM])]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
        undoBusy={undoBusy}
        onUndo={onUndo}
      />
    );
    const view = renderInApp(thread(false));
    const name = `Rückgängig: ${SENTENCE}`;
    expect(screen.getByRole('button', { name }).getAttribute('aria-busy')).not.toBe('true');
    fireEvent.click(screen.getByRole('button', { name }));
    // In flight: the same button, in the same place, now busy (the spinner) and locked.
    view.rerender(thread(true));
    const running = screen.getByRole('button', { name });
    expect(running.getAttribute('aria-busy')).toBe('true');
    expect(running.getAttribute('aria-disabled')).toBe('true');
    expect(running.querySelector('[role="progressbar"]')).not.toBeNull();
    // The server said no (the step stays applied): the arrow is back and can be tapped again.
    view.rerender(thread(false));
    const again = screen.getByRole('button', { name });
    expect(again.getAttribute('aria-busy')).not.toBe('true');
    expect(again.querySelector('[role="progressbar"]')).toBeNull();
    fireEvent.click(again);
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it('does not set an old arrow spinning when something else is busy later', () => {
    const thread = (undoBusy: boolean) => (
      <Conversation
        messages={[buddySaid([PLAN_EXAM])]}
        pending={null}
        busy={false}
        showActions
        receipts="turn"
        undoBusy={undoBusy}
        onUndo={() => undefined}
      />
    );
    const view = renderInApp(thread(false));
    // She tapped, it ran and failed…
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` }));
    view.rerender(thread(true));
    view.rerender(thread(false));
    // …and now something else is in flight: the arrow is locked, but it is not its spinner.
    view.rerender(thread(true));
    const locked = screen.getByRole('button', { name: `Rückgängig: ${SENTENCE}` });
    expect(locked.getAttribute('aria-busy')).not.toBe('true');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
  });

  it('offers no way back once the action was taken back', () => {
    renderInApp(
      <Conversation
        messages={[buddySaid([{ ...PLAN_EXAM, status: 'undone' }])]}
        pending={null}
        busy={false}
        showActions
        onUndo={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Rückgängig: / })).toBeNull();
    // It still says what happened, now as something that was taken back.
    expect(screen.getByText(/zurückgenommen|rückgängig/i)).toBeTruthy();
  });
});

/** The element and every box above it, up to the document. */
function* ancestors(el: Element): Generator<Element> {
  for (let up: Element | null = el; up; up = up.parentElement) yield up;
}

// ── The greeting a visit opens on (issues #104, #195) ───────────────────────────────────
//
// The owner, on his own app in the promo footage: „Das ist auch doof — Hi Lienne! / Done. —
// Was für ne tolle conversation". She had just worked through six questions; Buddy said hello
// as if nothing had happened and a card under it stated the fact flatly.
//
// What the greeting SAYS is decided in lib/buddy/sessionAnchor.ts and lib/homeLayout.ts (both
// pure, both tested there). What is visible here: the sentence stands in Buddy's own bubble,
// and where it tells about something she can look at, the way in rides WITH that bubble
// instead of in a second card under it.

/** The sentence the anchor composes after a round she got all right at once, in German. */
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

  it('gives every receipt its own ↺ in the chat; History keeps one per step (issue #520)', () => {
    const chatView = chat();
    const inChat = screen.getAllByRole('button', { name: /^Rückgängig: / });
    // One per receipt: the older answer's (its newest step) and the newer answer's.
    expect(inChat.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Rückgängig: ${PHOTO_SENTENCE}`,
      `Rückgängig: ${PREPARED_SENTENCE}`,
    ]);
    // History is the record of the single steps: there every one carries its own.
    chatView.unmount();
    chat({ receipts: 'step' });
    expect(screen.getAllByRole('button', { name: /^Rückgängig: / })).toHaveLength(3);
  });

  it('takes back the turn’s steps one by one, newest first', () => {
    const onUndo = vi.fn();
    const view = chat({ onUndo });
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig: ${PHOTO_SENTENCE}` }));
    expect(onUndo).toHaveBeenLastCalledWith(REQUEST_PHOTO.id);
    // The photo request is back: the same receipt's ↺ now names the step before it.
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
  it('drops the prepared practice’s line, and its ↺, while the bar carries it', () => {
    chat({ carriedOnTop: new Set([PREPARED.id]) });
    expect(screen.queryByText(PREPARED_SENTENCE)).toBeNull();
    const inChat = screen.getAllByRole('button', { name: /^Rückgängig: / });
    expect(inChat.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Rückgängig: ${PHOTO_SENTENCE}`,
    ]);
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

describe("the feedback after a roleplay is the Probetest's result list (issue #384)", () => {
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
    expect(screen.getByText('Geschafft')).toBeTruthy();
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
