// Domain "time": what a child wants from Buddy about when — reminders, appointments, moving
// things, being left alone (issue #106). Written the way a 10- to 16-year-old types: lower case,
// typos, impatient, half a thought at a time.
//
// This is the domain where the first gap was found ("erinner mich in einer Stunde"): DaySpec is
// day-granular (date / in_days / weekday) and the clock time is a plain HH:MM string the model
// has to work out itself. Everything below asks whether that gap has siblings.
//
// The static check (findings-time.md) answers each case from decision.ts, tools.ts, context.ts
// and prompts.ts. `hunch` is a suspicion by the author, never evidence.

// requires live verification in Claude Code session
import { asks } from './types.js';

export const TIME = asks('time', [
  // ── relative: minutes, hours, "gleich", "nachher" ────────────────────────────────────────
  {
    id: 'time-001',
    says: 'erinner mich in einer stunde ans mathe üben',
    wants: 'a reminder exactly one hour from now, without naming a clock time',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'DaySpec has no in_hours/in_minutes: the model must read ## Now, add an hour and write HH:MM itself — the one thing CLAUDE.md rule 2 says it must never do.',
  },
  {
    id: 'time-002',
    says: 'guck in 20 min nochmal ob ich angefangen hab',
    wants: 'Buddy to come back in twenty minutes and nudge',
    expect: { kind: 'acts', tools: ['schedule_check'] },
    hunch:
      'schedule_check rejects anything under one hour ("a check must be between 1 hour and 21 days"), and there is no way to say "20 minutes" in the first place.',
  },
  {
    id: 'time-003',
    says: 'sag mir in ner halben stunde bescheid',
    wants: 'a reminder 30 minutes from now',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'Same arithmetic as time-001, and near midnight the model must also bump in_days — two computations it is told not to make.',
  },
  {
    id: 'time-004',
    says: 'gleich nochmal nachfragen bitte',
    wants: 'to be nudged soon, without saying how soon',
    expect: { kind: 'asks_back', why: '"gleich" has no length; guessing a clock time invents it' },
  },
  {
    id: 'time-005',
    says: 'erinner mich nachher nochmal',
    wants: 'a reminder later today, time unspecified',
    expect: { kind: 'asks_back', why: '"nachher" names no time; only a day or an HH:MM fit' },
  },
  {
    id: 'time-006',
    says: 'in 2 stunden bitte',
    wants: 'a reminder two hours from now',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch: 'Same as time-001; from 22:30 onwards it crosses midnight and needs in_days 1 too.',
  },
  {
    id: 'time-007',
    says: 'in 10 min bin ich mit essen fertig dann erinner mich',
    wants: 'a reminder in about ten minutes',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch: 'Ten minutes is below anything the tools can hold; plan_step only has a wall clock.',
  },
  {
    id: 'time-008',
    says: 'in ner viertelstunde',
    wants: 'a reminder in fifteen minutes',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch: 'Fifteen minutes; see time-007.',
  },
  {
    id: 'time-009',
    says: 'gib mir 5 minuten',
    wants: 'Buddy to wait and come back',
    expect: { kind: 'answers' },
    hunch:
      'Nothing can bring Buddy back in five minutes (schedule_check floor is an hour). Any "melde mich gleich wieder" would be a claim without a path — rule 5.',
  },
  {
    id: 'time-010',
    says: 'in 90 minuten erinner mich an die vokabeln',
    wants: 'a reminder in an hour and a half',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch: 'Minutes that are not a whole hour make the arithmetic worse, not better.',
  },
  {
    id: 'time-011',
    says: 'so um kurz nach 4 rum',
    wants: 'a reminder a little after four',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'LocalTimeSchema is exact HH:MM — "kurz nach 4" becomes an invented 16:05 or 16:10 with nothing to show it was approximate.',
  },
  {
    id: 'time-012',
    says: 'heute abend nochmal erinnern bitte',
    wants: 'a reminder in the evening',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'Quiet hours start at 20:00 by default, so most of what a child calls "abend" is refused by plan_step — and she cannot loosen it herself.',
  },
  {
    id: 'time-013',
    says: 'ich geh jetzt erst raus, erinner mich in 3 stunden',
    wants: 'a reminder in three hours, and Buddy to know she is out',
    expect: { kind: 'acts', tools: ['plan_step', 'remember'] },
    hunch: 'Relative hours again; the constraint part has a path.',
  },
  {
    id: 'time-014',
    says: 'wann erinnerst du mich jetzt genau? ich hatte in ner stunde gesagt',
    wants: 'to hear back the exact time that was set',
    expect: { kind: 'answers' },
  },

  // ── times of day without a clock ─────────────────────────────────────────────────────────
  {
    id: 'time-015',
    says: 'erinner mich nach dem abendessen an die vokabeln',
    wants: 'a reminder anchored to dinner, not to a clock',
    expect: {
      kind: 'asks_back',
      why: 'Buddy does not know when she eats; a clock time would be invented',
    },
    hunch:
      'There is no event anchor anywhere in the schema. Either Buddy asks for a clock time or he makes one up.',
  },
  {
    id: 'time-016',
    says: 'vorm schlafen gehen nochmal kurz wiederholen',
    wants: 'a reminder shortly before bedtime',
    expect: {
      kind: 'refuses',
      why: 'bedtime lies in the quiet hours; Buddy says so and offers an earlier time',
    },
    hunch:
      'Bedtime for a 13-year-old is past 20:00 — the default quiet_start. Structurally unreachable.',
  },
  {
    id: 'time-017',
    says: 'morgen früh vor der schule erinner mich an das arbeitsblatt',
    wants: 'a reminder before school, around 6:30–7:00',
    expect: { kind: 'refuses', why: 'before 07:00 is inside the quiet hours' },
    hunch:
      'quiet_end is 07:00 and set_contact has no quiet_end field — "before school" can never be reached, not even if she asks for it.',
  },
  {
    id: 'time-018',
    says: 'nach dem training erinner mich bitte',
    wants: 'a reminder once training is over',
    expect: { kind: 'asks_back', why: 'Buddy does not know when training ends' },
  },
  {
    id: 'time-019',
    says: 'wenn ich vom training komm sag mir bescheid wegen der arbeit',
    wants: 'an event-triggered reminder ("when I get back")',
    expect: {
      kind: 'asks_back',
      why: 'nothing in the tools reacts to an event; only a clock time',
    },
    hunch: 'No event trigger exists at all — every reminder is a wall clock instant.',
  },
  {
    id: 'time-020',
    says: 'in der großen pause nochmal fragen',
    wants: 'a reminder during the morning break at school',
    expect: { kind: 'asks_back', why: 'Buddy does not know her timetable' },
  },
  {
    id: 'time-021',
    says: 'immer nach dem mittagessen bitte',
    wants: 'a daily reminder anchored to lunch',
    expect: { kind: 'asks_back', why: 'neither the repetition nor the anchor can be expressed' },
    hunch: 'Two gaps at once: no recurrence and no event anchor.',
  },
  {
    id: 'time-022',
    says: 'erinner mich morgen nachmittag',
    wants: 'a reminder tomorrow afternoon',
    expect: { kind: 'acts', tools: ['plan_step'] },
  },
  {
    id: 'time-023',
    says: 'heute mittag nochmal',
    wants: 'a reminder around noon today',
    expect: {
      kind: 'asks_back',
      why: 'after noon it is already over; Buddy should say so and offer a time',
    },
    hunch:
      'Written at 14:00 this is a past instant; plan_step rejects it and the whole turn repairs.',
  },
  {
    id: 'time-024',
    says: 'morgen vormittag so gegen halb 10',
    wants: 'a reminder tomorrow at 09:30',
    expect: { kind: 'acts', tools: ['plan_step'] },
  },

  // ── recurring ────────────────────────────────────────────────────────────────────────────
  {
    id: 'time-025',
    says: 'erinner mich jeden tag um 5 ans üben',
    wants: 'a daily reminder at 17:00',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'plan_step plans exactly one date. There is no recurrence anywhere — at best six single days (the action cap), then silence.',
  },
  {
    id: 'time-026',
    says: 'immer montags hab ich handball, da geht nix',
    wants: 'Buddy to know Mondays are blocked and to stop asking then',
    expect: { kind: 'acts', tools: ['remember', 'set_contact'] },
    hunch:
      'remember holds the fact; only set_contact avoid_weekdays actually stops anything, and that silences the whole Monday, not the training hours.',
  },
  {
    id: 'time-027',
    says: 'jeden 2. tag reicht',
    wants: 'a reminder every other day',
    expect: { kind: 'refuses', why: 'Buddy can only plan single days, and says so' },
    hunch: 'No recurrence, and no interval either.',
  },
  {
    id: 'time-028',
    says: 'frag mich jede woche mittwochs wie es läuft',
    wants: 'a weekly check-in',
    expect: { kind: 'acts', tools: ['schedule_check'] },
    hunch:
      'schedule_check is one-shot, capped at 21 days ahead and at 3 pending — a weekly rhythm cannot be set up, only faked three times.',
  },
  {
    id: 'time-029',
    says: 'sonntags abends planen wir immer die woche ok?',
    wants: 'a standing Sunday-evening planning slot',
    expect: { kind: 'refuses', why: 'no recurrence, and Sunday evening is inside the quiet hours' },
    hunch: 'Both gaps at once.',
  },
  {
    id: 'time-030',
    says: 'jeden morgen um 7 bitte',
    wants: 'a daily 07:00 reminder',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      '07:00 itself is allowed (quiet_end is exclusive), but "jeden" is not expressible — one day at a time.',
  },
  {
    id: 'time-031',
    says: 'freitags is immer vokabeltest, erinner mich donnerstags',
    wants: 'a weekly Thursday reminder for a weekly Friday test',
    expect: { kind: 'acts', tools: ['remember', 'plan_step'] },
    hunch: 'The memory holds; the weekly reminder does not.',
  },
  {
    id: 'time-032',
    says: 'ab nächster woche will ich jeden tag 20 min lernen, hilfst du mir',
    wants: 'a daily habit starting next week',
    expect: { kind: 'acts', tools: ['remember'] },
    hunch:
      'The goal can be remembered, but nothing can carry the daily rhythm, and nothing can start in the future — plan_step plans a day, not a series with a start.',
  },
  {
    id: 'time-033',
    says: 'immer am 1. vom monat mein zeugnisziel checken',
    wants: 'a monthly recurring check',
    expect: { kind: 'refuses', why: 'Buddy has no monthly rhythm' },
    hunch: 'DaySpec has no month-day recurrence; UntilSpec has none either.',
  },
  {
    id: 'time-034',
    says: 'kannst du mich 2x erinnern, einmal um 3 und einmal um 6',
    wants: 'two reminders on the same day',
    expect: { kind: 'acts', tools: ['plan_step', 'plan_step'] },
  },
  {
    id: 'time-035',
    says: 'jeden tag außer mittwoch, da hab ich musikschule',
    wants: 'a daily reminder with one day left out',
    expect: { kind: 'acts', tools: ['remember'] },
    hunch: 'No recurrence to make an exception from.',
  },
  {
    id: 'time-036',
    says: 'erinner mich die nächsten 5 tage jeden tag um 4',
    wants: 'five reminders on five consecutive days',
    expect: { kind: 'acts', tools: ['plan_step'] },
    hunch:
      'Five plan_step calls fit under the six-action cap — the only recurrence Buddy has is copy-paste, and it stops at six.',
  },

  // ── appointments: tests, presentations, deadlines ────────────────────────────────────────
  {
    id: 'time-037',
    says: 'am freitag is mathearbeit',
    wants: 'the test in the plan, with preparation',
    expect: { kind: 'acts', tools: ['plan_exam'] },
  },
  {
    id: 'time-038',
    says: 'dienstag 3. stunde bio test',
    wants: 'the test in the plan, at the lesson she named',
    expect: { kind: 'acts', tools: ['plan_exam'] },
    hunch: 'plan_exam has a day but no time — "3. Stunde" is silently dropped.',
  },
  {
    id: 'time-039',
    says: 'referat am 14.10.',
    wants: 'the presentation date in the plan',
    expect: { kind: 'acts', tools: ['plan_exam'] },
  },
  {
    id: 'time-040',
    says: 'abgabe is sonntag um 23:59, erinner mich',
    wants: 'a reminder before a late-night deadline',
    expect: {
      kind: 'refuses',
      why: '23:59 is inside the quiet hours; Buddy offers an earlier reminder',
    },
    hunch:
      'The deadline itself has nowhere to live (plan_exam has no time), and the reminder time is refused by quiet hours.',
  },
  {
    id: 'time-041',
    says: 'nächste woche is die arbeit, wann genau weiß ich noch nich',
    wants: 'Buddy to hold the test loosely until the day is known',
    expect: {
      kind: 'asks_back',
      why: 'the prompt says: no plan_exam without a day, ask one useful question instead',
    },
    hunch: 'A goal without a day is possible in the DB, but no tool can create one.',
  },
  {
    id: 'time-042',
    says: 'übermorgen aber früh',
    wants: 'a reminder the day after tomorrow, early',
    expect: { kind: 'asks_back', why: '"früh" is not a time, and before 07:00 is quiet' },
  },
  {
    id: 'time-043',
    says: 'am wochenende irgendwann, is egal wann',
    wants: 'something planned for Saturday or Sunday, she does not mind which',
    expect: { kind: 'asks_back', why: 'DaySpec has no "weekend"; Buddy must pick a day' },
    hunch: 'No way to say "one of these days" — the model has to decide for her.',
  },
  {
    id: 'time-044',
    says: 'in 3 tagen, also freitag',
    wants: 'the day she means (and Friday is in two days, so she miscounted)',
    expect: {
      kind: 'asks_back',
      why: 'the two statements name different days; acting on a guess would be wrong',
    },
    hunch:
      'in_days 3 and weekday 5 are both valid to the schema; whichever the model writes is applied silently, with no signal that the learner contradicted herself.',
  },
  {
    id: 'time-045',
    says: 'mündliche prüfung nächsten monat irgendwann',
    wants: 'a far-away exam noted',
    expect: { kind: 'asks_back', why: 'a month is not a day; Buddy asks for the date' },
  },
  {
    id: 'time-046',
    says: 'die arbeit wurde verschoben auf nach den ferien',
    wants: 'the test moved to after the holidays',
    expect: { kind: 'asks_back', why: 'Buddy does not know when her holidays end' },
    hunch: 'No school calendar anywhere; "nach den Ferien" is not a DaySpec.',
  },
  {
    id: 'time-047',
    says: 'am 31. februar is der test haha',
    wants: 'to joke; there is no such date',
    expect: {
      kind: 'asks_back',
      why: 'an impossible date; Buddy asks instead of storing something',
    },
  },
  {
    id: 'time-048',
    says: 'die arbeit war gestern schon, lief ok',
    wants: 'the test closed with how it went',
    expect: { kind: 'acts', tools: ['close_goal'] },
  },

  // ── moving things ────────────────────────────────────────────────────────────────────────
  {
    id: 'time-049',
    says: 'doch lieber später',
    wants: 'the planned thing pushed back, amount unspecified',
    expect: { kind: 'asks_back', why: '"später" names no new time' },
  },
  {
    id: 'time-050',
    says: 'verschieb das auf morgen',
    wants: 'the step moved to tomorrow',
    expect: { kind: 'acts', tools: ['update_step'] },
  },
  {
    id: 'time-051',
    says: 'kann ich das auf nach dem wochenende schieben',
    wants: 'the step moved to Monday',
    expect: { kind: 'acts', tools: ['update_step'] },
  },
  {
    id: 'time-052',
    says: 'nich um 5, um 6',
    wants: 'only the time of a planned step changed',
    expect: { kind: 'acts', tools: ['update_step'] },
  },
  {
    id: 'time-053',
    says: 'mach die erinnerung ne stunde später',
    wants: 'the reminder shifted by one hour',
    expect: { kind: 'acts', tools: ['update_step'] },
    hunch:
      'update_step takes an absolute HH:MM. The model has to read planned_time out of STATE and add an hour itself — and if that crosses 20:00 the change is refused.',
  },
  {
    id: 'time-054',
    says: 'schieb bitte alles um ne woche, ich schaff das grad nich',
    wants: 'every planned step moved a week back',
    expect: { kind: 'acts', tools: ['update_step'] },
    hunch:
      'One update_step per step, six actions per turn; with more open steps than that, part of the plan silently stays where it was.',
  },
  {
    id: 'time-055',
    says: 'die mathearbeit is doch erst nächsten dienstag',
    wants: 'the test date corrected',
    expect: { kind: 'acts', tools: ['update_goal'] },
    hunch:
      '"nächsten Dienstag" is exactly the ambiguity weeks_ahead encodes; said on a Tuesday, weeks_ahead 0 already means +7, so the model has to decide what she meant.',
  },
  {
    id: 'time-056',
    says: 'kannst du das auf heute abend schieben',
    wants: 'the step moved to this evening',
    expect: { kind: 'refuses', why: 'evening times fall into the quiet hours' },
  },
  {
    id: 'time-057',
    says: 'schieb es auf gestern, da hatte ich zeit',
    wants: 'something impossible; she is confused',
    expect: { kind: 'asks_back', why: 'a past day cannot be planned; Buddy asks what she meant' },
  },
  {
    id: 'time-058',
    says: 'ne doch heute noch, egal wann',
    wants: 'the step back to today, at any time',
    expect: { kind: 'asks_back', why: 'the usual reminder time may already be over today' },
    hunch:
      'plan_step/update_step fall back to preferred_start (15:00); after that, an agreed reminder without a time is rejected outright instead of taking the next possible slot.',
  },

  // ── cancelling, unsubscribing, "stop bugging me" ─────────────────────────────────────────
  {
    id: 'time-059',
    says: 'nerv nicht',
    wants: 'to be left alone, length unsaid',
    expect: { kind: 'asks_back', why: 'how long is unclear; a permanent rule must not be guessed' },
    hunch: 'Every pause needs an UntilSpec; "nerv nicht" carries none.',
  },
  {
    id: 'time-060',
    says: 'hör auf mich zu erinnern',
    wants: 'the reminders to stop — unclear whether this one or all of them',
    expect: {
      kind: 'asks_back',
      why: 'which reminder she means decides between update_step and set_contact',
    },
  },
  {
    id: 'time-061',
    says: 'lass mich heute in ruhe',
    wants: 'no messages for the rest of today',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },
  {
    id: 'time-062',
    says: 'schreib mir nich mehr aufs handy, nie mehr',
    wants: 'phone contact off for good',
    expect: { kind: 'acts', tools: ['set_contact', 'open_area'] },
    hunch:
      'set_contact has no contact_enabled field: the strongest it can do is a 60-day pause. Turning it off is only possible in settings, which is why open_area has to carry it.',
  },
  {
    id: 'time-063',
    says: 'die erinnerung morgen brauch ich nich mehr',
    wants: 'one reminder cancelled',
    expect: { kind: 'acts', tools: ['update_step'] },
  },
  {
    id: 'time-064',
    says: 'ich mach das heut nich',
    wants: "today's step marked as not happening",
    expect: { kind: 'acts', tools: ['update_step'] },
  },
  {
    id: 'time-065',
    says: 'streich alles für diese woche',
    wants: 'the week emptied',
    expect: { kind: 'acts', tools: ['update_step', 'set_contact'] },
    hunch: 'No bulk operation; one update_step per step, capped at six.',
  },
  {
    id: 'time-066',
    says: 'am wochenende will ich nix von dir hören',
    wants: 'no messages on Saturday and Sunday',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },
  {
    id: 'time-067',
    says: 'samstags erst ab mittag bitte',
    wants: 'quiet on Saturday mornings only',
    expect: {
      kind: 'refuses',
      why: 'quiet hours are the same every day; only whole weekdays can be ruled out',
    },
    hunch: 'No per-weekday time window anywhere — avoid_weekdays is all-day.',
  },
  {
    id: 'time-068',
    says: 'schreib einfach nich so oft',
    wants: 'fewer messages, not none',
    expect: {
      kind: 'asks_back',
      why: 'nothing in the tools sets a frequency; Buddy offers what he can do',
    },
    hunch:
      '"Seltener schreiben" (phone_only_important) exists in the settings and as a notification button, but no tool can set it — the one thing she asked for is the one thing Buddy cannot reach.',
  },

  // ── quiet hours ──────────────────────────────────────────────────────────────────────────
  {
    id: 'time-069',
    says: 'nach 8 abends nix mehr',
    wants: 'silence after 20:00',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },
  {
    id: 'time-070',
    says: 'ab 7 will ich meine ruhe',
    wants: 'quiet from 19:00',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },
  {
    id: 'time-071',
    says: 'du darfst mir auch bis 10 abends schreiben, echt',
    wants: 'the quiet hours relaxed',
    expect: {
      kind: 'refuses',
      why: 'Buddy can only reduce contact; loosening happens in settings (under 16 with the adult)',
    },
  },
  {
    id: 'time-072',
    says: 'morgens erst ab 9, vorher schlaf ich',
    wants: 'quiet extended into the morning',
    expect: { kind: 'acts', tools: ['set_contact'] },
    hunch:
      'set_contact has preferred_start/end, quiet_start, avoid_weekdays and pause — but no quiet_end. A reduction she is entitled to cannot be expressed.',
  },
  {
    id: 'time-073',
    says: 'weck mich um 6:30 zum lernen',
    wants: 'an early wake-up nudge',
    expect: {
      kind: 'refuses',
      why: '06:30 lies inside the quiet hours and Buddy is not an alarm clock',
    },
  },
  {
    id: 'time-074',
    says: 'ich lern am besten nachts, erinner mich um 1',
    wants: 'a 01:00 reminder',
    expect: { kind: 'refuses', why: 'the night is quiet and she cannot loosen that herself' },
    hunch:
      'Structurally unreachable for a 16-year-old too: set_contact can only make quiet hours earlier, never later.',
  },
  {
    id: 'time-075',
    says: 'sonntag nie, da is familientag',
    wants: 'nothing on Sundays',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },
  {
    id: 'time-076',
    says: 'ach doch, sonntags kannst du wieder schreiben',
    wants: 'Sunday allowed again',
    expect: {
      kind: 'refuses',
      why: 'removing a quiet day is loosening; only settings (and for a minor the adult) can',
    },
  },
  {
    id: 'time-077',
    says: 'zwischen 2 und 4 bin ich zuhause, da kannst du',
    wants: 'messages concentrated in her free window',
    expect: { kind: 'acts', tools: ['set_contact'] },
  },

  // ── pauses ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'time-078',
    says: 'diese woche bitte nix, ich hab voll stress',
    wants: 'silence for the rest of the week',
    expect: { kind: 'acts', tools: ['set_contact', 'remember'] },
  },
  {
    id: 'time-079',
    says: 'wir sind 2 wochen im urlaub',
    wants: 'silence for two weeks, and Buddy to know why',
    expect: { kind: 'acts', tools: ['set_contact', 'remember'] },
  },
  {
    id: 'time-080',
    says: 'bin krank, lass mich bis freitag in ruhe',
    wants: 'a pause until Friday',
    expect: { kind: 'acts', tools: ['set_contact', 'remember'] },
    hunch:
      'Being ill is health data — the prompt forbids storing it, so only the pause should land, not a memory about the illness.',
  },
  {
    id: 'time-081',
    says: 'bis nach den ferien nix bitte',
    wants: 'a pause until the holidays are over',
    expect: { kind: 'asks_back', why: 'Buddy does not know when her holidays end' },
  },
  {
    id: 'time-082',
    says: 'pausier mal alles für 3 monate',
    wants: 'a three-month pause',
    expect: {
      kind: 'refuses',
      why: 'a pause is capped at 60 days; Buddy offers the longest he can',
    },
  },
  {
    id: 'time-083',
    says: 'ab jetzt für immer ruhe',
    wants: 'permanent silence',
    expect: { kind: 'acts', tools: ['set_contact', 'open_area'] },
    hunch:
      'There is no "off" in the tools and no unbounded pause. The honest answer is 60 days plus a pointer to settings.',
  },
  {
    id: 'time-084',
    says: 'nach der arbeit am freitag brauch ich ne woche pause',
    wants: 'a pause that starts on Friday and lasts a week',
    expect: { kind: 'asks_back', why: 'a pause can only start now, not on a future day' },
    hunch: 'UntilSpec has an end but no start; a future-starting pause has no path at all.',
  },
  {
    id: 'time-085',
    says: 'morgen hab ich keine zeit',
    wants: 'Buddy to know tomorrow is blocked',
    expect: { kind: 'acts', tools: ['remember'] },
  },

  // ── asking what is coming up ─────────────────────────────────────────────────────────────
  {
    id: 'time-086',
    says: 'was steht heut an?',
    wants: "today's plan read back",
    expect: { kind: 'answers' },
  },
  {
    id: 'time-087',
    says: 'hatten wir was ausgemacht?',
    wants: 'to be reminded of the agreement she forgot',
    expect: { kind: 'answers' },
  },
  {
    id: 'time-088',
    says: 'wann is die mathearbeit nochmal',
    wants: 'the test date read back',
    expect: { kind: 'answers' },
  },
  {
    id: 'time-089',
    says: 'wie viele tage sind es noch bis zur arbeit',
    wants: 'a number of days',
    expect: { kind: 'answers' },
    hunch:
      'The prompt forbids saying "in 4 Tagen" and requires the weekday word — exactly the number she asked for is the one thing Buddy is told not to say.',
  },
  {
    id: 'time-090',
    says: 'hab ich morgen was?',
    wants: 'tomorrow read back',
    expect: { kind: 'answers' },
  },
  {
    id: 'time-091',
    says: 'wann erinnerst du mich nochmal dran',
    wants: 'the time of the next reminder',
    expect: { kind: 'answers' },
  },
  {
    id: 'time-092',
    says: 'was is nächste woche alles los',
    wants: 'next week read back',
    expect: { kind: 'answers' },
    hunch:
      'STATE lists a bounded number of steps and prints the totals — Buddy must say "das ist nicht alles" rather than read the list as complete.',
  },
  {
    id: 'time-093',
    says: 'wie lang noch bis zu den sommerferien',
    wants: 'a countdown to the holidays',
    expect: { kind: 'refuses', why: 'Buddy has no school calendar and must not invent the date' },
  },

  // ── time zones, clock changes, and the edges ─────────────────────────────────────────────
  {
    id: 'time-094',
    says: 'wir fliegen morgen nach spanien, da is es ne stunde anders',
    wants: 'her reminders to follow her to the new time zone',
    expect: { kind: 'answers' },
    hunch:
      'The zone comes from the device header, so it changes by itself — but reminders already queued hold an absolute instant computed in the old zone and fire at the wrong wall time. Nothing in the tools can fix that and nothing tells her.',
  },
  {
    id: 'time-095',
    says: 'sonntag wird die uhr umgestellt, erinner mich um halb 3 nachts',
    wants: 'a reminder at a wall time that may not exist that night',
    expect: {
      kind: 'refuses',
      why: 'the time is quiet, and on the clock change it does not exist or exists twice',
    },
  },
  {
    id: 'time-096',
    says: 'ich bin grad bei oma in polen',
    wants: 'Buddy to use the local time where she is',
    expect: { kind: 'answers' },
    hunch:
      'No tool sets the zone; it follows the device silently, with no way for her to correct it.',
  },
  {
    id: 'time-097',
    says: 'erinner mich am 25. um 2 uhr nachts, dann bin ich eh wach',
    wants: 'a 02:00 reminder on a named date',
    expect: { kind: 'refuses', why: '02:00 is inside the quiet hours' },
  },
  {
    id: 'time-098',
    says: 'mein handy zeigt ne falsche uhrzeit glaub ich',
    wants: 'to understand why the times look wrong',
    expect: { kind: 'answers' },
  },
  {
    id: 'time-099',
    says: 'is die erinnerung durch die zeitumstellung jetzt ne stunde früher?',
    wants: 'a truthful answer about what her reminder will do',
    expect: { kind: 'answers' },
    hunch:
      'The instant is computed per target date, so a reminder planned across the switch is right — but Buddy has nothing in STATE that proves it, so any confident answer is a claim he cannot back (rule 5).',
  },
  {
    id: 'time-100',
    says: 'wie spät is es eigentlich',
    wants: 'the current local time',
    expect: { kind: 'answers' },
  },
]);
