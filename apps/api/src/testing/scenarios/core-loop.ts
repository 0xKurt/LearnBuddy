// Scripted model answers for walking through the core loop in the browser
// (dev-stack.ts). The answers are fixed like in the integration tests; the
// server still enforces everything (quotes must match what was typed).
// Test tooling only.

import type { LlmRequest } from '../../llm/gateway.js';
import type { ScriptedGateway } from '../fakes.js';

/** The learner's latest message as the model would see it. */
function latestLearnerText(req: LlmRequest): string {
  for (let i = req.contents.length - 1; i >= 0; i--) {
    const m = req.contents[i];
    if (m?.role !== 'user') continue;
    const texts = m.parts.flatMap((p) => ('text' in p ? [p.text] : []));
    const last = texts[texts.length - 1];
    if (last && !last.startsWith('STATE')) return last;
  }
  return '';
}

/** The quote if the learner really wrote it, else null (the server would reject it anyway). */
function quoteFrom(req: LlmRequest, phrase: string): string | null {
  return latestLearnerText(req).toLowerCase().includes(phrase.toLowerCase()) ? phrase : null;
}

export const DEMO_WORKSHEET = {
  is_learning_material: true,
  readable: true,
  title: 'Brüche kürzen und vergleichen',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text:
    '# Brüche\n1. Kürze 6/8.\n2. Welcher Bruch ist größer: 2/3 oder 3/5?\n3. Wie heißt die Zahl unter dem Bruchstrich?\n4. Warum bleibt der Wert beim Erweitern gleich?',
  items: [
    {
      kind: 'numeric',
      prompt: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.',
      answer: '0.75',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche kürzen',
      difficulty: 2,
      source_excerpt: 'Kürze 6/8.',
    },
    {
      kind: 'multiple_choice',
      prompt: 'Welcher Bruch ist größer?',
      answer: '2/3',
      accepted_answers: [],
      unit: null,
      choices: ['2/3', '3/5'],
      correct_choice: 0,
      topic: 'Brüche vergleichen',
      difficulty: 2,
      source_excerpt: null,
    },
    {
      kind: 'short',
      prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
      answer: 'Nenner',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Begriffe',
      difficulty: 1,
      source_excerpt: null,
    },
    {
      kind: 'long',
      prompt: 'Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?',
      answer: 'Damit der Wert des Bruchs gleich bleibt.',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Brüche erweitern',
      difficulty: 3,
      source_excerpt: null,
    },
  ],
};

export function scriptCoreLoop(llm: ScriptedGateway): void {
  // 1 · "Ich schreibe am Freitag eine Mathearbeit über Brüche."
  llm.script('buddy_turn', (req) => {
    const quote = quoteFrom(req, 'am Freitag eine Mathearbeit über Brüche');
    if (!quote)
      return { reply: 'Erzähl mir gern, was bei dir ansteht.', options: null, actions: [] };
    return {
      reply:
        'Super, dann bereiten wir uns bis Freitag zusammen vor. Hast du ein Arbeitsblatt dazu? Ein Foto reicht.',
      options: null,
      actions: [
        {
          tool: 'plan_exam',
          args: {
            title: 'Mathearbeit Brüche',
            subject: 'Mathe',
            subject_kind: 'math',
            day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
            topics: ['Brüche'],
            quote,
          },
        },
        { tool: 'request_material', args: { goal: 'new', title: 'Arbeitsblatt Brüche' } },
      ],
    };
  });
  // 2 · the photographed worksheet
  llm.script('extraction', { json: DEMO_WORKSHEET });
  // 3 · Buddy acts on the ready material
  llm.script('buddy_check', {
    json: {
      disposition: 'act',
      reason: 'Material is ready and the test is close: prepare a first practice.',
      actions: [
        {
          tool: 'prepare_practice',
          args: { goal: 'g1', subject: null, minutes: 10, focus_topics: [] },
        },
      ],
      outreach: {
        kind: 'result',
        topic_key: 'exam:g1:first-practice',
        title: 'Übung ist bereit',
        body: 'Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.',
        why: 'Das Blatt ist gelesen und die Arbeit ist bald.',
        relevance: 0.8,
        expires_in_hours: 24,
        goal: 'g1',
        step: null,
      },
    },
  });
  // 4 · the free-text question in practice
  llm.script('tutor', (req) => {
    const text = latestLearnerText(req).toLowerCase();
    const right = text.includes('wert') || text.includes('gleich');
    return right
      ? {
          intent: 'answer',
          verdict: 'correct',
          reply: 'Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.',
          gave_hint: false,
          revealed_answer: false,
        }
      : {
          intent: 'answer',
          verdict: 'incorrect',
          reply: 'Fast. Denk daran, was mit dem Wert des Bruchs passiert.',
          gave_hint: true,
          revealed_answer: false,
        };
  });
  // 5 · after practice: nothing to add right now
  llm.script('buddy_check', {
    json: {
      disposition: 'wait',
      reason: 'Just practised; nothing to add.',
      actions: [],
      outreach: null,
    },
  });
  // 6 · "Mach die Übungen bitte kürzer."
  llm.script('buddy_turn', (req) => {
    const quote = quoteFrom(req, 'bitte kürzer');
    return quote
      ? {
          reply: 'Mach ich – ab jetzt kurze Runden.',
          options: null,
          actions: [
            {
              tool: 'remember',
              args: { kind: 'preference', statement: 'Möchte kurze Übungen', quote, until: null },
            },
          ],
        }
      : { reply: 'Alles klar!', options: null, actions: [] };
  });
}
