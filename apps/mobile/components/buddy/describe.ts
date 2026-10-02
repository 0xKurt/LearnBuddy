// Words for Buddy's data: action summaries, days, delivery states.
// Everything shown comes from the API's stored data — nothing is inferred.

import type { ActionSummary, OutreachView } from '@learnbuddy/shared-types/contracts';

import { i18n } from '../../lib/i18n/index.js';
import { KIND_LABEL } from '../learn/kinds.js';
import {
  daysUntil,
  formatDay,
  formatDayShort,
  formatIsoWeekdays,
  formatLastDay,
  formatTime,
  formatWeekday,
} from '../../lib/time.js';

const t = (key: string, vars?: Record<string, string | number>) => i18n.t(`buddy:${key}`, vars);

/** "heute", "morgen", "am Freitag", "am Fr., 9. Okt." (+ time: "morgen, 17:00", "am Freitag um 17:00"). */
export function whenText(date: string, time: string | null = null): string {
  const locale = i18n.language;
  const d = daysUntil(date);
  if (d === 0 || d === 1) {
    const day = t(d === 0 ? 'when.today' : 'when.tomorrow');
    return time ? `${day}, ${time}` : day;
  }
  const day = d > 1 && d < 7 ? formatWeekday(date, locale) : formatDayShort(date, locale);
  return time ? t('when.on_at', { day, time }) : t('when.on', { day });
}

function isoDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Buddy's speed steps (-2 … +2) as locale keys. */
const SPEED_KEY = ['slower2', 'slower', 'normal', 'faster', 'faster2'] as const;

/**
 * Whether this is something agreed that can only reach her inside the app, because messages
 * to the phone are off. True for every such arrangement — the sentence itself no longer says
 * it (issue #204: it stood under every single card); the conversation explains it once, under
 * the newest receipt that needs it (Conversation.tsx, `done.in_app_only`).
 */
export function onlyInApp(a: ActionSummary, opts: { contactOn?: boolean } = {}): boolean {
  return a.tool === 'plan_step' && a.agreed && opts.contactOn === false;
}

/** What Buddy did, as one sentence. Nothing is inferred; everything comes from the record. */
export function describeAction(a: ActionSummary): string {
  const locale = i18n.language;
  switch (a.tool) {
    case 'remember':
      return a.valid_until
        ? t('action.remember_until', {
            statement: a.statement,
            date: formatLastDay(a.valid_until, locale),
          })
        : t('action.remember', { statement: a.statement });
    case 'correct_memory':
      return t('action.correct_memory', { statement: a.statement });
    case 'forget':
      // Everything at once has no single statement to name — it has a number (issue #114).
      return a.statement === null
        ? t('action.forget_all', { count: a.forgotten ?? 0 })
        : t('action.forget', { statement: a.statement });
    case 'set_level':
      if (a.level === 'school') {
        return a.grade
          ? t('action.set_level_school', { grade: a.grade })
          : t('action.set_level_school_unknown');
      }
      return t(`action.set_level_${a.level}`);
    case 'plan_exam':
      return t('action.plan_exam', { title: a.title, day: formatDay(a.due_date, locale) });
    case 'update_goal':
      return a.due_date
        ? t('action.update_goal_day', { title: a.title, day: formatDay(a.due_date, locale) })
        : t('action.update_goal', { title: a.title });
    case 'close_goal':
      return t(a.status === 'done' ? 'action.close_goal_done' : 'action.close_goal_dropped', {
        title: a.title,
      });
    case 'prepare_practice':
      return t('action.prepare_practice', {
        title: a.title,
        count: a.question_count,
        minutes: a.est_minutes,
      });
    case 'plan_step':
      // A standing arrangement is what she agreed to — the card says the rhythm, not the one
      // date it happens to start on (issue #112).
      if (a.repeat && a.time) {
        const until = a.repeat_until
          ? t('action.plan_step_repeat_until', { date: formatDayShort(a.repeat_until, locale) })
          : '';
        return (
          t(`action.plan_step_repeat_${a.repeat}`, {
            title: a.title,
            time: a.time,
            weekday: formatWeekday(a.date, locale),
          }) + until
        );
      }
      return t(a.agreed ? 'action.plan_step_agreed' : 'action.plan_step', {
        title: a.title,
        when: whenText(a.date, a.time),
      });
    case 'update_step':
      if (a.state === 'skipped') return t('action.update_step_skipped', { title: a.title });
      if (a.state === 'cancelled') return t('action.update_step_cancelled', { title: a.title });
      return t('action.update_step_moved', {
        title: a.title,
        when: a.date ? whenText(a.date, a.time) : '',
      });
    case 'mark_step_done':
      return t('action.mark_step_done', { title: a.title });
    case 'request_material':
      // A page that joins a sheet is not a new sheet, and the card says which it is (#118).
      return t(a.material_id ? 'action.request_material_page' : 'action.request_material', {
        title: a.title,
      });
    case 'set_contact': {
      if (a.paused_until) {
        return t('action.set_contact_pause', { date: formatLastDay(a.paused_until, locale) });
      }
      const rules = a.quiet_start
        ? t('action.set_contact_quiet', {
            from: a.preferred_start,
            to: a.preferred_end,
            quiet: a.quiet_start,
          })
        : t('action.set_contact', {
            from: a.preferred_start,
            to: a.preferred_end,
          });
      // Days she asked to be left alone are part of what was agreed (p2-set-contact-card-omits-avoided-weekdays).
      return a.avoid_weekdays.length > 0
        ? `${rules}, ${t('action.set_contact_days', { days: formatIsoWeekdays(a.avoid_weekdays, locale) })}`
        : rules;
    }
    case 'offer_learning':
      return t('action.offer_learning', {
        what: i18n.t(`learn:${KIND_LABEL[a.kind]}`),
        text: a.text,
      });
    case 'open_area':
      return t('action.open_area', { what: t(`area.${a.area}`) });
    case 'set_voice':
      return t('action.set_voice', {
        voice: t(`voice.name.${a.voice}`),
        speed: t(`voice.speed.${SPEED_KEY[a.speed + 2] ?? 'normal'}`),
      });
    case 'delete_material':
      // A sheet she never named has no title to show her (issue #111).
      return a.title
        ? t('action.delete_material', { title: a.title })
        : t('action.delete_material_untitled');
    case 'confirm_delete':
      // The card says it; the chip list would only repeat the question she is looking at.
      return '';
    case 'rename_material':
      return t('action.rename_material', { title: a.title });
    case 'delete_item':
      return t('action.delete_item', { question: a.question });
    case 'plan_talk':
      // The talk and its steps, each with its day (issue #264); the steps' names are the app's.
      return t('action.plan_talk', {
        title: a.title,
        day: formatDay(a.due_date, locale),
        steps: a.steps
          .map(
            (s) => `${i18n.t(`learn:rehearse.stage.${s.stage}`)} ${formatDayShort(s.date, locale)}`,
          )
          .join(' · '),
      });
    case 'offer_rehearsal':
      // Shown as its own card (RehearseCard); the receipt list never carries it.
      return '';
    case 'schedule_check':
      return t('action.schedule_check', {
        when: whenText(isoDate(a.at), formatTime(a.at, locale)),
      });
  }
}

/** Only what the provider or the app confirmed; never "delivered" or "read" without proof. */
export function deliveryText(o: OutreachView): string {
  if (o.opened_at) return t('delivery.opened');
  if (o.status === 'scheduled' && o.send_at) {
    return t('delivery.scheduled', {
      when: whenText(isoDate(o.send_at), formatTime(o.send_at, i18n.language)),
    });
  }
  return t(`delivery.${o.status}`);
}
