// Fill a gap between the cached chat and a later server window before replacing the chat.
import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { mergeThread } from '../threadMerge.js';

type Page = { messages: MessageView[]; has_more: boolean };

export function conversationGap(incoming: BuddyHome, held: BuddyHome | undefined): boolean {
  const first = incoming.thread[0];
  const last = held?.thread.at(-1);
  return Boolean(
    incoming.thread_has_more &&
    first &&
    last &&
    Date.parse(last.created_at) <= Date.parse(first.created_at) &&
    !incoming.thread.some((m) => held?.thread.some((old) => old.id === m.id)),
  );
}

export async function fillConversationGap(
  incoming: BuddyHome,
  held: BuddyHome | undefined,
  load: (before: string) => Promise<Page>,
): Promise<BuddyHome> {
  let next = incoming;
  while (conversationGap(next, held)) {
    const first = next.thread[0]!;
    const page = await load(first.id);
    if (!page.messages.length || page.messages[0]!.id === first.id)
      throw new Error('Conversation pagination did not advance');
    next = {
      ...next,
      thread: mergeThread(page.messages, next.thread),
      thread_has_more: page.has_more,
    };
  }
  return next;
}
