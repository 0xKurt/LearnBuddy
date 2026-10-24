// Scripted model answers for the English promo recording (tests/web/promo.spec.ts with
// LB_PROMO_LANG=en, branch claude/promo-video): the same core loop as core-loop.ts, in the words
// an English-speaking learner types. Keyed by her own English sentences, by the English sheet's
// photo (820 × 1000 on a 2× screen, sent at 1312 × 1600 — no other scenario draws that size) and
// by this sheet's and this test's titles, so no German spec is answered with them (issue #350).
// The German rules in core-loop.ts stay as they are.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptChecks } from './checks.js';
import { DEMO_WORKSHEET } from './core-loop.js';
import { STUDY_READING, readingRules, tutorRules } from './rules.js';
import { latestLearnerText, quoteFrom, scriptTurns } from './turns.js';

const [numeric, choice, short, long] = DEMO_WORKSHEET.items;

/** The English worksheet as read: the German sheet's four forms in English words. */
export const DEMO_WORKSHEET_EN = {
  ...DEMO_WORKSHEET,
  title: 'Simplifying and comparing fractions',
  subject: { name: 'Maths', kind: 'math' },
  extracted_text:
    '# Fractions – Worksheet\n1. Simplify 6/8.\n2. Which fraction is larger: 2/3 or 3/5?\n3. What is the number below the fraction bar called?\n4. Why does the value stay the same when you make an equivalent fraction?',
  items: [
    {
      ...numeric,
      prompt: 'Simplify 6/8 and give the result as a decimal.',
      answer: '0.75',
      topic: 'Simplifying fractions',
      source_excerpt: 'Simplify 6/8.',
    },
    {
      ...choice,
      prompt: 'Which fraction is larger: $\\frac{2}{3}$ or $\\frac{3}{5}$?',
      answer: '$\\frac{2}{3}$',
      choices: ['$\\frac{2}{3}$', '$\\frac{3}{5}$'],
      correct_choice: 0,
      topic: 'Comparing fractions',
    },
    {
      ...short,
      prompt: 'What is the number below the fraction bar called?',
      answer: 'denominator',
      accepted_answers: ['the denominator'],
      topic: 'Key terms',
    },
    {
      ...long,
      prompt: 'Why do you multiply the numerator and the denominator by the same number?',
      answer: 'So the value of the fraction stays the same.',
      topic: 'Equivalent fractions',
      difficulty: 3,
    },
  ],
};

export function scriptPromoEn(): void {
  // 1 · "I have a maths test on Friday about fractions."
  scriptTurns({
    when: /maths test on friday about fractions/i,
    answer: (req) => {
      const quote = quoteFrom(req, 'a maths test on Friday about fractions') ?? '';
      return {
        reply:
          "Great, let's get ready for Friday together. Do you have a worksheet for it? A photo is enough.",
        options: null,
        actions: [
          {
            tool: 'plan_exam',
            args: {
              title: 'Fractions test',
              subject: 'Maths',
              subject_kind: 'math',
              day: { kind: 'weekday', weekday: 5, weeks_ahead: 0 },
              topics: ['Fractions'],
              quote,
            },
          },
          { tool: 'request_material', args: { goal: 'new', title: 'Fractions worksheet' } },
        ],
      };
    },
  });
  // 2 · the photographed English worksheet — by its size, like the German one in core-loop.ts.
  readingRules.add({
    when: /<image 1312x1600>/,
    system: STUDY_READING,
    answer: () => DEMO_WORKSHEET_EN,
  });
  // 3 · Buddy acts on the ready material, keyed by this sheet's title (checks.ts).
  scriptChecks({
    when: new RegExp(`new material is ready: "${DEMO_WORKSHEET_EN.title}"`),
    answer: () => ({
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
        title: 'Practice is ready',
        body: 'I made a short practice from your worksheet.',
        why: 'The sheet is read and the test is soon.',
        relevance: 0.8,
        expires_in_hours: 24,
        goal: 'g1',
        step: 'new',
      },
    }),
  });
  // 4 · the free-text question in practice, by its question: right once she names the value.
  tutorRules.add({
    when: /Why do you multiply the numerator and the denominator/,
    answer: (req) => {
      const text = latestLearnerText(req).toLowerCase();
      const right = text.includes('value') || text.includes('same');
      return right
        ? {
            intent: 'answer',
            verdict: 'correct',
            reply: 'Exactly – the value stays the same, only the way it looks changes.',
            gave_hint: false,
            revealed_answer: false,
          }
        : {
            intent: 'answer',
            verdict: 'incorrect',
            reply: 'Almost. Think about what happens to the value of the fraction.',
            gave_hint: true,
            revealed_answer: false,
          };
    },
  });
  // 5 · after practice: nothing to add — keyed by this learner's test and the finished practice.
  scriptChecks({
    when: /^(?=[\s\S]*"Fractions test")(?=[\s\S]*the learner just finished practice)/,
    answer: () => ({
      disposition: 'wait',
      reason: 'Just practised; nothing to add.',
      actions: [],
      outreach: null,
    }),
  });
  // 6 · "Remind me about fractions tomorrow at 4 pm."
  scriptTurns({
    when: /^Remind me about fractions tomorrow at 4 ?pm\.$/i,
    answer: (req) => ({
      reply: "Okay, I'll remind you about fractions tomorrow at 4 pm.",
      options: null,
      actions: [
        {
          tool: 'plan_step',
          args: {
            goal: null,
            kind: 'practice',
            title: 'Practise fractions',
            day: { kind: 'in_days', days: 1 },
            time: '16:00',
            in_minutes: null,
            agreed: true,
            repeat: null,
            repeat_until: null,
            quote: quoteFrom(req, 'Remind me about fractions tomorrow at 4 pm.'),
            subject: null,
            focus_topics: ['Fractions'],
          },
        },
      ],
    }),
  });
}
