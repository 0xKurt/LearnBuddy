// Words for Buddy's data: action summaries, days, delivery states.
// Everything shown comes from the API's stored data — nothing is inferred.

import type { ActionSummary, OutreachView } from '@learnbuddy/shared-types/contracts';

import { i18n } from '../../lib/i18n/index.js';
import {
  daysUntil,
  formatDay,
  formatDayShort,
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
      return t('action.forget', { statement: a.statement });
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
      return t('action.request_material', { title: a.title });
    case 'set_contact':
      return a.paused_until
        ? t('action.set_contact_pause', { date: formatLastDay(a.paused_until, locale) })
        : t('action.set_contact', {
            from: a.preferred_start,
            to: a.preferred_end,
            count: a.max_per_week,
          });
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
