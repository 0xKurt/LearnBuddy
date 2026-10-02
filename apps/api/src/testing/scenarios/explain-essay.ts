// Scripted model answers for the walkthrough of "Erklär mal" (issue #236) and the long text
// (issue #258) in tests/web/modes.spec.ts: an oral quiz with three key points answered by voice
// and one follow-up, and an essay of 1500 words that survives a restart as a draft.
//
// The judge below keys every claim on HER words in the request (never on the question, the key
// points or the context block): the server looks every quote up in what she said and would drop
// an invented one anyway, so a quote this script cannot find in her words is not written at all.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

/** The open question of the oral quiz, and what she says to it by voice. */
export const EXPLAIN_PROMPT = 'Erkläre, wie die Fotosynthese funktioniert.';
export const EXPLAIN_SAID =
  'Die Pflanze braucht Licht als Energie und macht aus CO2 und Wasser Zucker und Sauerstoff.';

/** Everything she said to this question: every user turn after the context block. */
function herWords(req: LlmRequest): string {
  return req.contents
    .slice(1)
    .filter((m) => m.role === 'user')
    .flatMap((m) => m.parts.flatMap((p) => ('text' in p ? [p.text] : [])))
    .join('\n');
}

/** The refs the tutor was asked about, with what each says (`r1 "Licht liefert die Energie" — …`). */
function askedRefs(req: LlmRequest): Array<{ ref: string; name: string }> {
  const first = req.contents[0]?.parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n');
  return [...(first ?? '').matchAll(/^(r\d+) "([^"]+)"/gm)].map((m) => ({
    ref: m[1]!,
    name: m[2]!,
  }));
}

/**
 * For each key point or element (by a word of what it says): the phrase in her words that carries
 * it. Only what this walkthrough asks; a phrase not in her words is no claim.
 */
const CARRIES: Array<{ name: RegExp; phrase: string }> = [
  { name: /Licht/, phrase: 'Licht als Energie' },
  { name: /CO₂|Zucker/, phrase: 'aus CO2 und Wasser Zucker' },
  { name: /Chloroplast/, phrase: 'Chloroplasten' },
  { name: /Gegenargument/, phrase: 'Andererseits' },
  { name: /Position/, phrase: 'Ich finde deshalb' },
];

/**
 * The tutor for a question with a rubric (REQUIRED ELEMENTS / KEY POINTS), or null for any
 * other: one entry per asked element, met only with a quote that stands in her words, and for an
 * essay three places to improve, each a quote of hers.
 */
export function judgeRubric(req: LlmRequest): unknown {
  const asked = askedRefs(req);
  if (asked.length === 0) return null;
  const words = herWords(req);
  const elements = asked.map(({ ref, name }) => {
    const phrase = CARRIES.find((c) => c.name.test(name))?.phrase;
    const met = phrase !== undefined && words.includes(phrase);
    return { element: ref, met, quote: met ? phrase : '', verbs: [] };
  });
  const first = req.contents[0]?.parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n');
  const spots = /^SPOTS:/m.test(first ?? '')
    ? [
        { quote: 'Viele sagen das', tip: 'Sag, wer das sagt, und belege es mit einem Beispiel.' },
        {
          quote: 'Das ist halt so',
          tip: 'Begründe hier, warum — so trägt das Argument die Erörterung.',
        },
        // Not in her text: the server drops it, and she never reads it.
        { quote: 'ein Satz, den sie nie geschrieben hat', tip: 'Wird verworfen.' },
      ]
    : [];
  return {
    intent: 'answer',
    verdict: 'partially_correct',
    reply: 'Schon gut!',
    gave_hint: false,
    revealed_answer: false,
    elements,
    spots,
  };
}

/** What the fake microphone "said" while she answers the oral quiz, or null for anything else. */
export function transcribeExplain(req: LlmRequest): unknown {
  const first = req.contents[0]?.parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n');
  if (!first?.includes('MODE: ANSWER') || !first.includes('Fotosynthese')) return null;
  return { heard_speech: true, text: EXPLAIN_SAID };
}

export function scriptExplainAndEssay(): void {
  scriptTurns(
    {
      // "Frag mich ab" starts in the chat (issue #236): an oral quiz, not a new screen.
      when: /frag mich .*fotosynthese ab/i,
      answer: says('Gern! Ich frag dich ab – erklär mir einfach in deinen Worten.', [
        { tool: 'offer_learning', args: { kind: 'oral', text: 'Fotosynthese', goal: null } },
      ]),
    },
    {
      when: /erörterung/i,
      answer: says('Gute Idee – schreib deine Erörterung, ich sag dir danach, was schon trägt.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Erörterung Handyverbot' } },
      ]),
    },
  );
  scriptGenerations(
    {
      when: /LEARNER'S TEXT:\n[^\n]*Fotosynthese/i,
      answer: () => ({
        usable: true,
        title: 'Fotosynthese',
        subject: { name: 'Biologie', kind: 'biology' },
        items: [
          {
            ...base,
            kind: 'long',
            prompt: EXPLAIN_PROMPT,
            answer:
              'Mit Licht als Energie baut die Pflanze im Chloroplasten aus CO₂ und Wasser Zucker.',
            topic: 'Fotosynthese',
            rubric: {
              kind: 'explain',
              form: 'Erklärung',
              elements: [
                {
                  name: 'Energiequelle',
                  point: 'Licht liefert die Energie',
                  missing: 'Sag noch, woher die Energie kommt.',
                  ask: 'Woher bekommt die Pflanze die Energie dafür?',
                  check: { by: 'judged', exact: [] },
                },
                {
                  name: 'Ausgangsstoffe',
                  point: 'Aus CO₂ und Wasser wird Zucker',
                  missing: 'Sag noch, woraus der Zucker entsteht.',
                  ask: 'Woraus baut die Pflanze den Zucker?',
                  check: { by: 'judged', exact: [['CO2', 'Kohlenstoffdioxid', 'Kohlendioxid']] },
                },
                {
                  name: 'Ort in der Zelle',
                  point: 'Findet im Chloroplasten statt',
                  missing: 'Sag noch, wo das passiert.',
                  ask: 'Und wo in der Zelle passiert das?',
                  check: { by: 'judged', exact: [] },
                },
              ],
            },
          },
        ],
      }),
    },
    {
      when: /LEARNER'S TEXT:\n[^\n]*Erörterung/i,
      answer: () => ({
        usable: true,
        title: 'Erörterung',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [
          {
            ...base,
            kind: 'long',
            prompt: 'Schreib eine Erörterung: Soll es an Schulen ein Handyverbot geben?',
            answer: 'Einleitung mit der Frage, Argumente dafür und dagegen, Schluss mit Position.',
            topic: 'Erörterung',
            rubric: {
              kind: 'text',
              form: 'Erörterung',
              elements: [
                {
                  name: 'Länge',
                  missing: 'Schreib noch etwas mehr.',
                  ask: null,
                  check: { by: 'word_count', min: 300, max: null },
                },
                {
                  name: 'Absätze',
                  missing: 'Teil den Text in Einleitung, Hauptteil und Schluss.',
                  ask: null,
                  check: { by: 'paragraphs', min: 3 },
                },
                {
                  name: 'Gegenargument',
                  missing: 'Nimm auch die andere Seite in den Blick.',
                  ask: null,
                  check: { by: 'judged', exact: [] },
                },
                {
                  name: 'Schluss mit eigener Position',
                  missing: 'Sag am Ende, was du selbst denkst.',
                  ask: null,
                  check: { by: 'judged', exact: [] },
                },
              ],
            },
          },
        ],
      }),
    },
  );
}
