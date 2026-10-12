import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
// A requested caption follows its pages without page navigation or hidden-route speech.
import { newId } from '../api/client.js';
import { getHome, sendMessageStreamed } from '../api/endpoints.js';
import { keys, queryClient, setHome } from '../api/queries.js';
import { currentSession } from '../auth/session.js';
import { inThread } from '../buddy/unsent.js';
import { draftGeneration, updateDraft } from '../drafts.js';
import type { CaptureCaption } from './draft.js';
import { drafts } from './draftStorage.js';

function ownerLifetime(owner: string | undefined) {
  const generation = draftGeneration();
  let query = queryClient.getQueryCache().find({ queryKey: keys.home });
  const captureAlive = drafts.lifetime();
  const isCurrent = () =>
    owner !== undefined &&
    currentSession()?.user_id === owner &&
    generation === draftGeneration() &&
    captureAlive() &&
    queryClient.getQueryCache().find({ queryKey: keys.home }) === query;
  return {
    isCurrent,
    writeHome(home: BuddyHome) {
      if (!isCurrent()) return;
      setHome(home);
      // Direct entry may not have loaded Home yet; this guarded write owns that creation.
      query = queryClient.getQueryCache().find({ queryKey: keys.home });
    },
  };
}

/** Guard the editor's awaited lookup without reserving a caption or creating an ID. */
export function captureIsCurrent(): () => boolean {
  return ownerLifetime(currentSession()?.user_id).isCurrent;
}

/** Snapshot at the submit tap. An unchanged resumed caption retains its actual message ID. */
export function captureCaption(text: string, resumed?: CaptureCaption) {
  const caption = text.trim();
  const owner = currentSession()?.user_id;
  const metadata: CaptureCaption | undefined =
    caption && owner
      ? {
          text: caption,
          owner,
          clientMessageId:
            resumed?.text === caption && resumed.owner === owner
              ? resumed.clientMessageId
              : newId(),
        }
      : undefined;
  const owns = ownerLifetime(owner);
  let completion: Promise<void> | undefined;

  async function deliver(requestId: string): Promise<void> {
    if (!metadata || !owns.isCurrent()) return;
    drafts.startCaption(requestId);
    let delivered = false;
    try {
      const response = await sendMessageStreamed(
        metadata.text,
        metadata.clientMessageId,
        null,
        () => undefined,
      );
      if (!owns.isCurrent()) return;
      owns.writeHome(response.home);
      // Server-stored failed turns are delivered too.
      delivered = true;
    } catch {
      if (!owns.isCurrent()) return;
      try {
        const home = await getHome();
        if (!owns.isCurrent()) return;
        owns.writeHome(home);
        delivered = inThread(home, metadata.clientMessageId);
      } catch {
        // No blind resend: the original ID stays durable until an explicit retry.
      }
    } finally {
      if (owns.isCurrent()) drafts.stopCaption(requestId);
    }
    if (!owns.isCurrent()) return;
    if (delivered) await drafts.finishCaption(requestId, metadata.clientMessageId);
    else updateDraft('chat', (current) => (current.trim() ? current : metadata.text));
  }

  return {
    metadata,
    isCurrent: owns.isCurrent,
    reserve: () => {
      if (metadata && owns.isCurrent())
        updateDraft('chat', (current) => (current.trim() === caption ? '' : current));
    },
    complete: (requestId: string) => (completion ??= deliver(requestId)),
    restore: () => {
      if (metadata && owns.isCurrent())
        updateDraft('chat', (current) => (current.trim() ? current : caption));
    },
  };
}

type CaptureRecovery = {
  requestId: string;
  materialId: string;
  caption: CaptureCaption;
  isCurrent: () => boolean;
  confirmed: boolean;
};

/** Only a real editor recovery: inspect actual thread first, then await the user's send. */
export async function recoverCaptureCaption(retryText?: string): Promise<CaptureRecovery | null> {
  const owner = currentSession()?.user_id;
  const owns = ownerLifetime(owner);
  const pending = await drafts.pendingCaptions();
  if (!owns.isCurrent()) return null;
  const matching = pending.filter((p) => p.caption.owner === owner);
  if (!matching.length) return null;
  let home: BuddyHome | undefined;
  try {
    home = await getHome();
  } catch {
    /* Offline confirmation never replaces the local retry identity. */
  }
  if (!owns.isCurrent()) return null;
  if (home) owns.writeHome(home);
  for (const entry of matching) {
    if (!owns.isCurrent()) return null;
    if (home && inThread(home, entry.caption.clientMessageId)) {
      await drafts.finishCaption(entry.requestId, entry.caption.clientMessageId);
      if (!owns.isCurrent()) return null;
      let matchingDraft = false;
      updateDraft('chat', (current) => {
        if (current.trim() !== entry.caption.text) return current;
        matchingDraft = true;
        return '';
      });
      if (retryText?.trim() === entry.caption.text || matchingDraft)
        return { ...entry, isCurrent: owns.isCurrent, confirmed: true };
      continue;
    }
    if (retryText !== undefined && retryText.trim() !== entry.caption.text) continue;
    let recovered = false;
    updateDraft('chat', (current) => {
      if (current.trim() && current.trim() !== entry.caption.text) return current;
      if (!home && current.trim() !== entry.caption.text) return current;
      recovered = true;
      return entry.caption.text;
    });
    if (recovered) return { ...entry, isCurrent: owns.isCurrent, confirmed: false };
    // Newer text already in the editor takes precedence without abandoning this caption.
    return null;
  }
  return null;
}

/** Explicit edits supersede recovered text; unrelated newer text does not erase a caption. */
export async function supersedeCaptureCaption(previous: string, next: string): Promise<void> {
  if (!previous.trim() || previous.trim() === next.trim()) return;
  const owner = currentSession()?.user_id;
  const owns = ownerLifetime(owner);
  const pending = await drafts.pendingCaptions();
  if (!owns.isCurrent()) return;
  for (const entry of pending) {
    if (entry.caption.owner === owner && entry.caption.text === previous.trim())
      await drafts.abandonCaption(entry.requestId, entry.caption.clientMessageId);
  }
  const draft = await drafts.load();
  if (!owns.isCurrent()) return;
  const caption = draft?.caption;
  if (draft?.requestId && caption && caption.owner === owner && caption.text === previous.trim())
    await drafts.abandonCaption(draft.requestId, caption.clientMessageId);
}
