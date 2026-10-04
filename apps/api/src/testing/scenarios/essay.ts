// Scripted model answers for the long-text walkthrough (tests/web/essay.spec.ts, issue #258): she
// asks Buddy to practise a discussion on a school phone ban, Buddy offers it, the generator writes
// one task of the dialectic type, and the essay judgement names each key point and three places to
// improve. Every quote it returns is cut out of what she actually wrote, so the server's quote
// checks run for real; what she reads is built by code (`practice/essay.ts`).
// Test tooling only; answers are keyed by the request's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { scriptGenerations } from './generations.js';
import { tutorRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const ESSAY_TASK = 'Erörtere: Sollte es an Schulen ein Handyverbot geben?';

/** Her text, as the judgement request carries it (`essayContext` ends with it). */
function herText(req: LlmRequest): string {
  const all = req.contents
    .flatMap((c) => c.parts)
    .map((p) => ('text' in p ? p.text : ''))
    .join('\n');
  return all.split('HER TEXT:\n')[1] ?? '';
}

/** Her paragraphs and sentences, as she wrote them. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

/** A sentence of hers that carries `word`, or none. */
function carrying(sentences: readonly string[], word: RegExp): string | null {
  return sentences.find((s) => word.test(s)) ?? null;
}

export function scriptEssay(): void {
  scriptTurns({
    when: /erörterung .*handyverbot/i,
    answer: says('Gern – schreib deine Erörterung, ich sag dir danach, was schon trägt.', [
      { tool: 'offer_learning', args: { kind: 'essay', text: 'Handyverbot an Schulen' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nHandyverbot an Schulen/,
    answer: () => ({
      usable: true,
      title: 'Erörterung: Handyverbot',
      subject: { name: 'Deutsch', kind: 'german' },
      essay: [
        {
          prompt: ESSAY_TASK,
          type: 'argue_dialectic',
          topic: 'Handyverbot',
          difficulty: 3,
          passage: null,
        },
      ],
    }),
  });
  tutorRules.add({
    when: /Sollte es an Schulen ein Handyverbot geben/,
    answer: (req) => {
      const text = herText(req);
      const paragraphs = text.split(/\n+/).filter((p) => p.trim() !== '');
      const first = sentencesOf(paragraphs[0] ?? '');
      const last = sentencesOf(paragraphs[paragraphs.length - 1] ?? '');
      const all = sentencesOf(text);
      const claim = (element: string, quote: string | null) => ({
        element,
        met: quote !== null,
        quote: quote ?? '',
        verbs: [],
      });
      return {
        elements: [
          claim('r1', first[0] ?? null),
          claim('r2', carrying(all, /zum Beispiel/i)),
          claim('r3', carrying(all, /andererseits/i)),
          claim('r4', paragraphs.length > 1 ? (last[last.length - 1] ?? null) : null),
        ],
        places: [
          { quote: all[0] ?? '', better: 'Nenn gleich am Anfang, worum es geht.' },
          { quote: all[1] ?? '', better: 'Belege das mit einem Beispiel aus deinem Alltag.' },
          { quote: all[2] ?? '', better: 'Verbinde den Satz mit dem davor.' },
        ],
      };
    },
  });
}
