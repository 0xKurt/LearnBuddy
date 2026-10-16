// The learning domain's receipt lines (issue #107): what Buddy did with her practice, her sheets
// and her talks, as one sentence from the record, in the conversation and in History alike
// (components/buddy/describe.ts `describeAction`). Its offers, roleplays and rehearsals have a
// card instead, and so has the deletion Buddy asks her to confirm: the card says it, a receipt
// would only repeat the question she is looking at.

import { i18n } from '../../lib/i18n/index.js';
import { formatDay, formatDayShort } from '../../lib/time.js';
import { addReceipt } from '../buddy/extensions.js';

const t = (key: string, vars?: Record<string, string | number>) => i18n.t(`buddy:${key}`, vars);

export function addLearningReceipts(): void {
  addReceipt('prepare_practice', (a) =>
    t('action.prepare_practice', {
      title: a.title,
      count: a.question_count,
      minutes: a.est_minutes,
    }),
  );
  // A page that joins a sheet is not a new sheet, and the card says which it is (#118).
  addReceipt('request_material', (a) =>
    t(a.material_id ? 'action.request_material_page' : 'action.request_material', {
      title: a.title,
    }),
  );
  addReceipt('show_ready', (a) => t('action.show_ready', { title: a.title }));
  // A sheet she never named has no title to show her (issue #111).
  addReceipt('delete_material', (a) =>
    a.title
      ? t('action.delete_material', { title: a.title })
      : t('action.delete_material_untitled'),
  );
  // The talk and its steps, each with its day; the steps' names are the app's (issue #264).
  addReceipt('plan_talk', (a) => {
    const locale = i18n.language;
    return t('action.plan_talk', {
      title: a.title,
      day: formatDay(a.due_date, locale),
      steps: a.steps
        .map((s) => `${t(`rehearse.stage.${s.stage}`)} ${formatDayShort(s.date, locale)}`)
        .join(' · '),
    });
  });
  addReceipt('rename_material', (a) => t('action.rename_material', { title: a.title }));
  addReceipt('delete_item', (a) => t('action.delete_item', { question: a.question }));
}
