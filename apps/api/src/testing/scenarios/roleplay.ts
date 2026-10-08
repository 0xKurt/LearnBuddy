// Scripted answers for the roleplay walkthrough (issue #244, tests/web/roleplay.spec.ts):
// asked for in the chat, one line in English, one in German (the app's own hint), one by
// voice in the conversation mode, then her tap on "end" and the checked feedback.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { ROLEPLAY_FEEDBACK_SYSTEM, ROLEPLAY_SYSTEM } from '../../modules/buddy/roleplay.js';
import { transcribeRules } from './rules.js';
import { quoteFrom, says, scriptTurns } from './turns.js';

const line =
  (reply: string, her = 'en') =>
  () => ({
    concern: false,
    also_asked: false,
    her_language: her,
    leave: false,
    reply,
  });

export function scriptRoleplay(): void {
  scriptTurns(
    {
      when: /rollenspiel auf englisch/i,
      answer: (req: LlmRequest) =>
        says(
          'Super, los geht’s! Du bist im Café in London, ich bin der Kellner. — Good afternoon! What can I get you?',
          [
            {
              tool: 'start_roleplay',
              args: {
                language: 'en',
                scene: 'Im Café in London',
                role: 'Kellner',
                points: ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'],
                quote: quoteFrom(req, 'Rollenspiel auf Englisch'),
              },
            },
          ],
        )(req),
    },
    {
      system: ROLEPLAY_SYSTEM,
      when: /hot chocolate/i,
      answer: line('Of course! One hot chocolate. Would you like a piece of cake with it?'),
    },
    {
      system: ROLEPLAY_SYSTEM,
      when: /was kostet/i,
      answer: line('It is three pounds fifty.', 'de'),
    },
    {
      // Her line by voice in the conversation mode (the transcript below).
      system: ROLEPLAY_SYSTEM,
      when: /how much/i,
      answer: line('That is three pounds fifty, please. Anything else?'),
    },
    {
      system: ROLEPLAY_FEEDBACK_SYSTEM,
      when: /ROLEPLAY/,
      answer: () => ({
        points: [
          { point: 'k1', met: true, quote: 'Hello' },
          { point: 'k2', met: true, quote: 'A hot chocolate, please' },
          // Words she never said: the app does not count this one (rule 0).
          { point: 'k3', met: true, quote: 'What is the price' },
        ],
        better: [
          {
            said: 'Hello! A hot chocolate, please.',
            better: 'Hello! Could I have a hot chocolate, please?',
          },
          { said: 'How much it costs?', better: 'How much does it cost?' },
        ],
      }),
    },
  );
  // The fake microphone's words: in the roleplay's language while one runs (the app asks for
  // it), otherwise the conversation-mode line learning-modes.ts answers.
  transcribeRules.otherwise((req: LlmRequest) => {
    const all = req.contents
      .flatMap((m) => m.parts.flatMap((p) => ('text' in p ? [p.text] : [])))
      .join('\n');
    return /EXPECTED LANGUAGE: en/.test(all)
      ? { heard_speech: true, text: 'How much it costs?' }
      : { heard_speech: true, text: 'Was steht diese Woche an?' };
  });
}
