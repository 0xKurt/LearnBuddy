// Days the model resolves from the day list of `## Now` (CLAUDE.md rule 2, #687): far in the
// list, across a month and across New Year. The DaySpec eval for any change to that list; the
// measurement of 16.10.2026 is in docs/architecture.md (§Model calls, the day list of `## Now`).
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { must, type Case } from './caseChecks.js';

export const DAY_CASES: Case[] = [
  {
    id: 'de_exam_in_ten_days',
    message: 'In 10 Tagen schreibe ich eine Bio-Arbeit über Zellen.',
    check: (o) =>
      must(
        o.goals.some((g) => g.kind === 'exam' && g.due_date === '2026-10-08'),
        'exam in ten days, 2026-10-08',
      ),
  },
  {
    id: 'de_exam_in_three_weeks',
    message: 'In drei Wochen am Montag ist meine Deutsch-Schulaufgabe.',
    check: (o) =>
      must(
        o.goals.some((g) => g.kind === 'exam' && g.due_date === '2026-10-19'),
        'exam on Monday in three weeks, 2026-10-19',
      ),
  },
  {
    id: 'de_reminder_friday_next_week',
    message: 'Erinner mich am Freitag nächster Woche um 16 Uhr an mein Referat.',
    check: (o) =>
      must(
        o.steps.some(
          (s) => s.agreed && s.planned_date === '2026-10-09' && s.planned_time === '16:00',
        ),
        'agreed step on Friday next week, 2026-10-09 16:00',
      ),
  },
  {
    id: 'de_exam_weekday_over_new_year',
    // Wednesday 30 December, 10:00 in Berlin.
    at: '2026-12-30T09:00:00Z',
    message: 'Am Montag schreibe ich eine Physikarbeit.',
    check: (o) =>
      must(
        o.goals.some((g) => g.kind === 'exam' && g.due_date === '2027-01-04'),
        'exam on Monday 2027-01-04',
      ),
  },
  {
    id: 'de_exam_date_in_january',
    at: '2026-12-30T09:00:00Z',
    message: 'Am 8. Januar schreiben wir eine Englischarbeit.',
    check: (o) =>
      must(
        o.goals.some((g) => g.kind === 'exam' && g.due_date === '2027-01-08'),
        'exam on 2027-01-08',
      ),
  },
];
