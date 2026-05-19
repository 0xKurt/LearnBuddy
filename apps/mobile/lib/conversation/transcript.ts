// Pure resume-transcript reconstruction. No RN/Expo deps so it's
// unit-testable in node. Given a session snapshot's turns + items it
// rebuilds a readable, chronological bubble list (Question → answer →
// feedback → …) and decides which item to resume on.

import type { ConversationTurn, Item } from '@learnbuddy/shared-types';

// 'skipped' is now a first-class, honest verdict: the student gave up / the
// tutor revealed the answer. It must stay distinct from 'incorrect' (an
// attempted wrong answer) so the chip copy and the "Weiter" gate can be
// truthful — never show "Genau!" for a give-up.
export type DisplayVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'skipped';

export function normVerdict(
  v: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null | undefined,
): DisplayVerdict | undefined {
  if (v === 'correct' || v === 'partially_correct' || v === 'incorrect' || v === 'skipped')
    return v;
  return undefined;
}

export type ResumeMsg = {
  id: string;
  role: 'question' | 'learner' | 'tutor';
  text: string;
  verdict?: DisplayVerdict;
};

export function buildResumeTranscript(
  turns: ConversationTurn[],
  items: Item[],
): { messages: ResumeMsg[]; startIdx: number } {
  // Resume at the first item that hasn't been closed out yet — either
  // answered correctly OR given up on (skipped/revealed). Without the
  // skipped case the learner would resume forever on a question they
  // already gave up.
  const closedItem = new Set(
    turns
      .filter((t) => t.role === 'tutor' && (t.verdict === 'correct' || t.verdict === 'skipped'))
      .map((t) => t.item_id),
  );
  let startIdx = items.findIndex((it) => !closedItem.has(it.id));
  if (startIdx < 0) startIdx = items.length;

  // Be robust to unordered input — the natural order is turn_index.
  const ordered = [...turns].sort((a, b) => a.turn_index - b.turn_index);
  const qById = new Map(items.map((it) => [it.id, it.question]));
  const messages: ResumeMsg[] = [];
  let lastItemId: string | null = null;
  for (const tn of ordered) {
    if (tn.role !== 'learner' && tn.role !== 'tutor') continue;
    if (tn.item_id && tn.item_id !== lastItemId) {
      const q = qById.get(tn.item_id);
      if (q) messages.push({ id: `q-${tn.item_id}`, role: 'question', text: q });
      lastItemId = tn.item_id;
    }
    messages.push({
      id: tn.id,
      role: tn.role === 'learner' ? 'learner' : 'tutor',
      text: tn.content,
      verdict: normVerdict(tn.verdict),
    });
  }
  return { messages, startIdx };
}
