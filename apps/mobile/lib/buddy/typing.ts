// Whether she is writing or dictating a message right now — what the head's orb leans in to
// (`headState` `typing`, design ui_kits/app/App.jsx:46, decision on #599). Pure, so the claim is
// checkable.
//
// Text in the field alone is not writing: a draft restored after a restart, or a message that
// never arrived and was put back, would keep Buddy "listening" for as long as the chat is open.
// She is writing while the field has the focus and holds something, and she is dictating while
// the mic is busy. It ends by itself on send (the field is empty), on blur and when she leaves.

export type TypingFacts = {
  /** The chat is the screen she sees (not a practice or the library standing over it). */
  onScreen: boolean;
  /** The Composer's field has the focus. */
  fieldFocused: boolean;
  text: string;
  /** The mic is getting ready, recording or writing down. */
  dictating: boolean;
};

export function isTyping(f: TypingFacts): boolean {
  if (!f.onScreen) return false;
  return f.dictating || (f.fieldFocused && f.text.length > 0);
}
