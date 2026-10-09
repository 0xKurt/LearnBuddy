// Unsent work on this device: answers in the outbox (lib/api/outbox.ts) and a
// photo draft (lib/capture/draft.ts). It belongs to whoever was signed in
// (lib/auth/session.ts localOwner): a session that merely ended keeps it for
// her next sign-in; it is deleted only when someone else signs in or when an
// adult signs out on purpose after being told (audit H-28, M-73,
// p2-signout-wipes-unsent-answers-and-photos-without-warning).
import { localDataOnSignIn } from './auth/localData.js';
import { localOwner, setLocalOwner } from './auth/session.js';
import { clearOutbox, hasKeptAnswers } from './api/outboxSync.js';
import { drafts } from './capture/draftStorage.js';
import { clearDrafts } from './drafts.js';

/** Signed in (start or sign-in): another person's leftovers go, hers stay. */
export async function adoptLocalWork(userId: string): Promise<void> {
  const owner = await localOwner();
  if (localDataOnSignIn(owner, userId) === 'wipe') await discardLocalWork();
  if (owner !== userId) await setLocalOwner(userId);
}

/** Something not sent yet: answers waiting or photos in a draft. */
export async function hasUnsentWork(): Promise<boolean> {
  const [answers, draft] = await Promise.all([hasKeptAnswers(), drafts.load()]);
  return answers || draft !== null;
}

/** Deletes the outbox, the drafts (photos and text) and every kept photo. */
async function discardLocalWork(): Promise<void> {
  await clearOutbox();
  await drafts.clearAll();
  await clearDrafts();
}

/** A deliberate sign-out: nothing of hers stays for the next person. */
export async function releaseLocalWork(): Promise<void> {
  await discardLocalWork();
  await setLocalOwner(null);
}
