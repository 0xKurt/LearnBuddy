// Files handed to LearnBuddy from outside (another app's share sheet) on their way into
// the chat's input bar (issue #519): the bar takes them at once while it is there; otherwise
// they wait here until it is (components/capture/ShareIntake.tsx opens the chat).
import type { IncomingFile } from './files.js';

type Taker = (files: IncomingFile[]) => void;

let waiting: IncomingFile[] = [];
let taker: Taker | null = null;

/** Hands files over: to the chat's bar now, or as soon as it is there. */
export function handIn(files: readonly IncomingFile[]): void {
  if (files.length === 0) return;
  if (taker) taker([...files]);
  else waiting = [...waiting, ...files];
}

/** The chat's bar takes what waits and what comes while it is there. */
export function takeIncoming(next: Taker): () => void {
  taker = next;
  if (waiting.length > 0) {
    const files = waiting;
    waiting = [];
    next(files);
  }
  return () => {
    if (taker === next) taker = null;
  };
}

/** Files wait for the chat's bar (e.g. shared while signed out). */
export function hasIncoming(): boolean {
  return waiting.length > 0;
}

/** Signed out: nothing handed over stays behind for the next person. */
export function clearIncoming(): void {
  waiting = [];
}
