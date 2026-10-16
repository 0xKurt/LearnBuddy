// The title of the home card for a sheet that failed (components/buddy/HomeNotices.tsx). A sheet that was read
// and only gives nothing to practise is never called unreadable (rule 5, issue #411); which
// reasons those are is the shared contract's (READ_WITHOUT_EXERCISES), as in MaterialCard.

import {
  MaterialFailure,
  READ_WITHOUT_EXERCISES,
  type NowCard,
} from '@learnbuddy/shared-types/contracts';

type Failed = Pick<Extract<NowCard, { type: 'material_failed' }>, 'reason' | 'title'>;

/** The i18n key (namespace buddy) of the card's title. */
export function failedTitleKey(card: Failed): string {
  const reason = MaterialFailure.safeParse(card.reason);
  // A photo of something else was looked at, not unreadable: said so, never with its "title"
  // (whatever the reading called the photo is no sheet's name).
  if (reason.success && reason.data === 'not_learning_material') return 'now.failed_title_no_sheet';
  const read = reason.success && READ_WITHOUT_EXERCISES.has(reason.data);
  const base = read ? 'now.failed_title_read' : 'now.failed_title';
  return card.title ? `${base}_named` : base;
}
