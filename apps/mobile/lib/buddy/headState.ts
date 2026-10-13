// What the orb in the head shows (issue #179). Pure, so the claim is checkable.
//
// It is the one place she always sees, so what it says about Buddy has to follow what is
// happening on the screen (owner rule 1, #599). In #174 it was wired to `pending !== null` alone
// — the message being sent. The moment the answer starts arriving, `pending` is null again, so
// the orb went back to idle **while Buddy was writing**: the busiest moment of the whole app,
// shown as nothing happening.
//
// The choreography is the design's (ui_kits/app/App.jsx, HANDOFF §6): she writes → listening ·
// sent → thinking · the answer arrives → speaking · an open task → waiting · right → happy ·
// otherwise idle. Only existing poses (`MoonState`), nothing new.

import { create } from 'zustand';

import { moonForReply, type MoonState } from './moon.js';

/**
 * A recording of hers runs on a card in the thread (the rehearsal card, issue #264): the fact
 * lives in that card's recorder, deep in the thread, and the head is drawn by the screen — so
 * the card says it here and the chat reads it, as the Composer tells the screen that she types.
 * True only while a recorder really runs (each card says it from its phase, under its own name,
 * and takes it back when it goes). Kept per card: two rehearsal cards can stand in the thread,
 * and the second one mounting, stopping or leaving must not end what the first one says.
 */
export const useThreadRecording = create<{
  /** The cards whose recorder runs. */
  cards: ReadonlySet<string>;
  /** Whether any of them records. */
  on: boolean;
  set: (card: string, on: boolean) => void;
}>((set) => ({
  cards: new Set(),
  on: false,
  set: (card, on) =>
    set((state) => {
      if (state.cards.has(card) === on) return state;
      const cards = new Set(state.cards);
      if (on) cards.add(card);
      else cards.delete(card);
      return { cards, on: cards.size > 0 };
    }),
}));

export type HeadFacts = {
  /** A message of hers is on its way to the server. */
  sending: boolean;
  /** The server is working on a message of hers (status 'processing'). */
  working: boolean;
  /** An answer is arriving word by word. */
  streaming: boolean;
  /** She is writing or dictating a message right now. */
  typing?: boolean;
  /** A recording of hers runs on a card in the thread (`useThreadRecording`). */
  recording?: boolean;
  /** Buddy is reading a sheet she sent (ui_kits/app/Flows.jsx `ChatState` "reading"). */
  reading?: boolean;
};

/**
 * The order is the statement: what Buddy is doing now beats what he was doing.
 * Writing wins over thinking, because the words on screen are the newer truth.
 */
export function headState(f: HeadFacts): MoonState {
  if (f.streaming) return 'speak';
  if (f.sending || f.working) return 'think';
  // Manager decision recorded on #599, announced to the owner on 12 and 13 Oct without
  // objection: the chat header orb shows `listen` while she types or dictates, as the prototype
  // (`App.jsx`) and owner rule 1 ask; the state is the orb's pose, not a claim about an open
  // microphone. The owner can reverse it.
  if (f.typing) return 'listen';
  // Her talk is being recorded on the rehearsal card: the microphone is open, Buddy listens
  // (design components/practice/Modes.jsx:44, ui_kits/app/Extra.jsx:185).
  if (f.recording) return 'listen';
  if (f.reading) return 'think';
  return 'idle';
}

export type PracticeFacts = {
  /** She is saying her answer and it is being recorded. */
  listening?: boolean;
  /** Her answer (or her question about the task) is with the server. */
  checking: boolean;
  /** The task on screen still waits for her answer. */
  open: boolean;
  /** Buddy's newest reply arrived while she was looking, not with the screen. */
  fresh: boolean;
  /** …and it answers a try of hers that was right. Never true where verdicts are hidden. */
  afterCorrect: boolean;
  /**
   * …or a try that was not right yet, and his words about it are still the newest thing on
   * screen: she has not started her next answer. Never true where verdicts are hidden.
   */
  replying?: boolean;
};

/**
 * The head of a task (design ui_kits/app/App.jsx:57–68, Tasks.jsx:176; MIGRATION §6): waiting
 * while it is open, thinking while her answer is checked, then the feedback — a right answer
 * that just came back celebrates (`moonForReply`; it ends by itself, moon.ts), one that is not
 * right yet has Buddy speaking until she starts again. A reply that was already there when the
 * screen opened moves nothing.
 */
export function practiceHeadState(f: PracticeFacts): MoonState {
  if (f.listening) return 'listen';
  if (f.checking) return 'think';
  const reply = moonForReply({ fresh: f.fresh, afterCorrect: f.afterCorrect });
  if (reply !== 'idle') return reply;
  if (f.fresh && f.replying) return 'speak';
  return f.open ? 'wait' : 'idle';
}
