// Files handed to LearnBuddy from outside (another app's share sheet) on their way into
// the capture screen: the open capture screen takes them at once; otherwise they wait
// here until one opens (components/capture/ShareIntake.tsx opens it).
import type { IncomingFile } from './files.js';

type Taker = (files: IncomingFile[]) => void;

let waiting: IncomingFile[] = [];
let taker: Taker | null = null;

/** Hands files over; true when an open capture screen took them. */
export function handIn(files: readonly IncomingFile[]): boolean {
  if (files.length === 0) return true;
  if (taker) {
    taker([...files]);
    return true;
  }
  waiting = [...waiting, ...files];
  return false;
}

/** The capture screen takes what waits and what comes while it is open. */
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

/** Files wait for a capture screen (e.g. shared while signed out). */
export function hasIncoming(): boolean {
  return waiting.length > 0;
}

/** Signed out: nothing handed over stays behind for the next person. */
export function clearIncoming(): void {
  waiting = [];
}
