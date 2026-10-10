// A talk as a goal with steps and its rehearsal (issue #264): the plan Buddy makes from her words,
// the card that records a Probevortrag or her reading aloud, and what the transcription hears.
// Shared by the integration test (`__tests__/talks.int.test.ts`) and the browser walkthrough of
// the gallery (tests/web/gallery.spec.ts, issue #387). Her own sentences („Referat über
// Vulkane", „Probevortrag", „vorlesen üben"), which no other spec types (#350).
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { transcribeRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const day = (days: number) => ({ kind: 'in_days', days });

/** A Referat in two weeks, five minutes, with its four steps before the day. */
export const TALK_PLAN = {
  tool: 'plan_talk',
  args: {
    title: 'Vulkane',
    format: 'referat',
    subject: 'Erdkunde',
    subject_kind: 'geography',
    day: day(14),
    minutes: 5,
    steps: [
      { stage: 'outline', day: day(3) },
      { stage: 'sources', day: day(6) },
      { stage: 'slides', day: day(10) },
      { stage: 'rehearsal', day: day(12) },
    ],
    quote: 'in zwei Wochen ein Referat über Vulkane',
  },
};

/** A passage to read aloud: 16 words, well inside two minutes. */
export const READ_PASSAGE =
  'Der kleine Fuchs lief am Morgen durch den Wald. Er suchte etwas zu essen für seine Familie.';

export function scriptTalks(): void {
  scriptTurns(
    {
      when: /in zwei Wochen ein Referat über Vulkane/i,
      answer: says('Ich habe dir den Plan bis zum Referat gemacht.', [TALK_PLAN]),
    },
    {
      when: /probevortrag/i,
      answer: says('Gern – halte ihn einmal, als ob die Klasse zuhört.', [
        { tool: 'offer_rehearsal', args: { kind: 'talk', goal: 'g1', text: null } },
      ]),
    },
    {
      when: /vorlesen üben/i,
      answer: says('Lies mir diesen Text einmal laut vor.', [
        { tool: 'offer_rehearsal', args: { kind: 'read_aloud', goal: null, text: READ_PASSAGE } },
      ]),
    },
  );
  // What the transcription hears: the walkthrough's microphone is a tone, so the words are these.
  transcribeRules.add(
    {
      when: /EXPECTED LANGUAGE/,
      system: /rehearsing a talk/,
      answer: () => ({
        heard_speech: true,
        transcript:
          'Heute {äh} erzähle ich euch etwas über Vulkane. Ein Vulkan ist ein Berg, aus dem Lava kommt. {ähm} Danke fürs Zuhören.',
        parts: [
          { part: 'opening', present: true, quote: 'Heute erzähle ich euch etwas über Vulkane' },
          { part: 'main', present: true, quote: 'Ein Vulkan ist ein Berg, aus dem Lava kommt' },
          { part: 'closing', present: true, quote: 'Danke fürs Zuhören' },
        ],
      }),
    },
    {
      when: /EXPECTED LANGUAGE/,
      system: /reading a text aloud/,
      answer: () => ({
        heard_speech: true,
        transcript:
          'Der Fuchs lief am Morgen durch den Feld. Er suchte etwas zu essen für eine Familie.',
        parts: [],
      }),
    },
  );
}
