// The sheet she is sending right now (issue #632): from the tap on "Senden" it stands in the
// conversation as her message, with how far the upload is — the phone's own knowledge, so it says
// nothing the phone does not know (CLAUDE.md rule 5). Once the API has the sheet, her stored message
// takes its place (`MessageView.sheet`, matched by the material); a send that failed leaves the
// conversation again and its pages go back above the field with what went wrong
// (lib/capture/useAttachments.ts).

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { create } from 'zustand';

import { pageHandler, type SendProgress } from './pages.js';

export type SendingSheet = {
  requestId: string;
  /** The pages on the phone, in order; empty for a set with a PDF (a file is not a page). */
  uris: readonly string[];
  pages: number;
  /** How far the upload is; null once the API has it. */
  progress: SendProgress | null;
  /** The material, once reserved: her stored message for it replaces this one. */
  materialId: string | null;
};

type Sending = {
  sheet: SendingSheet | null;
  start: (sheet: Omit<SendingSheet, 'progress' | 'materialId'>) => void;
  update: (
    requestId: string,
    change: Partial<Pick<SendingSheet, 'progress' | 'materialId'>>,
  ) => void;
  /** This send is over without a sheet (failed), or her stored message is on screen. */
  end: (requestId: string) => void;
};

export const useSendingSheet = create<Sending>((set) => ({
  sheet: null,
  start: (sheet) => set({ sheet: { ...sheet, progress: { step: 'reserving' }, materialId: null } }),
  update: (requestId, change) =>
    set((s) => (s.sheet?.requestId === requestId ? { sheet: { ...s.sheet, ...change } } : s)),
  end: (requestId) => set((s) => (s.sheet?.requestId === requestId ? { sheet: null } : s)),
}));

/**
 * The sheet to draw as her message in this conversation: none once her stored message for it is
 * there (`stored` names the materials her stored messages are for).
 */
export function sendingShown(
  sheet: SendingSheet | null,
  stored: ReadonlySet<string>,
): SendingSheet | null {
  if (!sheet) return null;
  return sheet.materialId !== null && stored.has(sheet.materialId) ? null : sheet;
}

/** The sheet she is sending, as long as this conversation has no stored message for it yet. */
export function useSendingInThread(
  thread: readonly MessageView[] | undefined,
): SendingSheet | null {
  const sheet = useSendingSheet((s) => s.sheet);
  const sentIn = pageHandler.get()?.sentIn;
  const stored = new Set(
    (thread ?? []).flatMap((m) => {
      const id = sentIn?.(m) ?? null;
      return id !== null ? [id] : [];
    }),
  );
  // The send ends it once the home is refreshed (lib/capture/useAttachments.ts); until then her
  // stored message, already there, is the one drawn.
  return sendingShown(sheet, stored);
}
