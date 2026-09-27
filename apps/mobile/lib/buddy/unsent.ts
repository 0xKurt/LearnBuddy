// A chat message whose send failed (audit M-76): if the server stored it, it
// stands in the thread with its failure and "Nochmal senden"; if it never
// arrived, her words go back into the composer instead of vanishing.

/** True when the message with this client id is in the thread she sees. */
export function inThread(
  home: { thread: readonly { client_message_id: string | null }[] } | undefined,
  clientMessageId: string,
): boolean {
  return (home?.thread ?? []).some((m) => m.client_message_id === clientMessageId);
}

/**
 * The text for the composer after a send ended: the unsent text, unless she has
 * typed something new meanwhile (that is never overwritten).
 */
export function composerAfterSend(current: string, sent: string, delivered: boolean): string {
  if (delivered) return current;
  return current.trim().length > 0 ? current : sent;
}
