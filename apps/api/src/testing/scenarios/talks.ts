// Scripted model answers for the browser walkthrough of the new sources and the talk
// (tests/web/talks.spec.ts; issues #259, #264): a talk planned with its steps, a rehearsal
// and a read-aloud recorded with the fake microphone, and Buddy asking for a corrected test
// and for today's notebook entry. Matched by what the learner wrote, never by order.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { quoteFrom, says, scriptTurns } from './turns.js';

/** The passage the walkthrough reads aloud: what the recorder shows, and what is compared. */
export const WALK_PASSAGE =
  'Der kleine Fuchs lief am frühen Morgen durch den stillen Wald. Er suchte etwas zu essen für seine Familie. Unter einer alten Eiche fand er ein paar Beeren und eine Nuss. Zufrieden trug er alles nach Hause.';

const inDays = (days: number) => ({ kind: 'in_days', days });

/**
 * What the rehearsal transcriber "hears" from the fake microphone's tone. A talk with an
 * opening and a main part and two filler sounds; a read-aloud that leaves out one word and
 * reads one differently — so the result screen has something to show in every row.
 */
export function rehearsalAnswer(req: LlmRequest): unknown {
  if (req.system.includes('rehearsing a talk')) {
    return {
      heard_speech: true,
      transcript:
        'Heute erzähle ich euch etwas über Vulkane. {äh} Ein Vulkan ist ein Berg, aus dem heiße Lava kommt. {ähm} Es gibt aktive und erloschene Vulkane.',
      parts: [
        { part: 'opening', present: true, quote: 'Heute erzähle ich euch etwas über Vulkane' },
        { part: 'main', present: true, quote: 'Es gibt aktive und erloschene Vulkane' },
        { part: 'closing', present: false, quote: null },
      ],
    };
  }
  return {
    heard_speech: true,
    transcript:
      'Der Fuchs lief am frühen Morgen durch den stillen Wald. Er suchte etwas zu essen für seine Familie. Unter einer alten Eiche fand er ein paar Birnen und eine Nuss. Zufrieden trug er alles nach Hause.',
    parts: [],
  };
}

export function scriptTalks(): void {
  scriptTurns(
    {
      when: /referat über vulkane/i,
      answer: (req) =>
        says(
          'Super, dann planen wir das zusammen. Die Tage siehst du unten – du kannst sie jederzeit ändern.',
          [
            {
              tool: 'plan_talk',
              args: {
                title: 'Vulkane',
                format: 'referat',
                subject: 'Erdkunde',
                subject_kind: 'geography',
                day: inDays(9),
                minutes: 5,
                steps: [
                  { stage: 'outline', day: inDays(2) },
                  { stage: 'sources', day: inDays(4) },
                  { stage: 'slides', day: inDays(6) },
                  { stage: 'rehearsal', day: inDays(8) },
                ],
                quote: quoteFrom(req, 'referat über vulkane'),
              },
            },
          ],
        )(req),
    },
    {
      when: /vortrag proben/i,
      answer: says(
        'Gern – nimm dich einfach auf, ich höre zu und sag dir, was ich gemessen habe.',
        [{ tool: 'offer_rehearsal', args: { kind: 'talk', goal: 'g1', text: null } }],
      ),
    },
    {
      when: /vorlesen üben/i,
      answer: says('Klar! Lies mir diesen Text vor – ich höre genau hin.', [
        { tool: 'offer_rehearsal', args: { kind: 'read_aloud', goal: null, text: WALK_PASSAGE } },
      ]),
    },
    {
      when: /mathearbeit zurück/i,
      answer: says('Fotografier mir die Arbeit – dann üben wir genau das, was angestrichen ist.', [
        {
          tool: 'request_material',
          args: { goal: null, title: 'Deine korrigierte Mathearbeit', source: 'corrected_test' },
        },
      ]),
    },
    {
      when: /was war heute/i,
      answer: says('Zeig mir deinen Hefteintrag – ich mach dir ein paar Fragen für morgen früh.', [
        {
          tool: 'request_material',
          args: { goal: null, title: 'Dein Hefteintrag von heute', source: 'today_notes' },
        },
      ]),
    },
  );
}
