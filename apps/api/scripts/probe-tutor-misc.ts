// Quick coverage check for subjects/items that DON'T fit our normal
// subject taxonomy. The point: prove the prompt works without any
// pre-baked subject strategy. None of these scenarios have a tuned
// "subject block" — the agent has to read the question and figure
// out the right pedagogy from scratch.
//
// Run: pnpm -F @learnbuddy/api exec tsx scripts/probe-tutor-misc.ts

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { Env } from '../src/lib/env.js';
import { createLlmGateway } from '../src/lib/llm/factory.js';
import { buildAgentSystemInstructionV3_1 } from '../src/lib/agent/index.js';
import { parseAgentJson } from '../src/lib/agent/parse.js';
import type { AgentItemContext, AgentThreadMessage } from '../src/lib/agent/types.js';

type Persona = { id: string; displayName: string; gradeLevel: number; description: string };

const PERSONAS: Persona[] = [
  { id: 'lena', displayName: 'Lena', gradeLevel: 8, description: 'Struggling, gives up fast.' },
  { id: 'tom', displayName: 'Tom', gradeLevel: 9, description: 'Average, slips on detail.' },
  { id: 'anna', displayName: 'Anna', gradeLevel: 10, description: 'Strong, wants the why.' },
];

// Scenarios on subjects WITHOUT a default subject block — proving the
// agent can tutor anything from question-reading alone.
type Scenario = {
  id: string;
  item: AgentItemContext;
  script: Record<string, string[]>;
};

const SCENARIOS: Scenario[] = [
  // Driving-theory item: a wholly unrelated domain to vocab/math/etc.
  {
    id: 'driving',
    item: {
      itemId: 'driving-stoptime',
      question:
        'Wie lange beträgt der Reaktionsweg in Metern bei 50 km/h und einer Reaktionszeit von 1 Sekunde?',
      expectedAnswer: '15 Meter',
      acceptableAnswers: ['15 m', '15 Meter'],
      answerKind: 'short',
      topic: 'Führerschein Theorie',
      difficulty: 2,
      subjectKind: 'general',
      mcOptions: null,
      mcCorrectIndex: null,
      units: 'Meter',
      sourceExcerpt: null,
    },
    script: {
      lena: ['weiß nicht', 'wie rechnet man das?', 'kannst du mir das sagen?'],
      tom: ['10', '15?'],
      anna: ['15 Meter', 'warum nimmt man 3?'],
    },
  },
  // Music theory: niche, ambiguous fit
  {
    id: 'music',
    item: {
      itemId: 'music-intervall',
      question: 'Wie heißt das Intervall zwischen den Tönen C und G?',
      expectedAnswer: 'Quinte',
      acceptableAnswers: ['Quinte', 'reine Quinte', 'perfect fifth'],
      answerKind: 'short',
      topic: 'Musiktheorie',
      difficulty: 3,
      subjectKind: 'art_music',
      mcOptions: null,
      mcCorrectIndex: null,
      units: null,
      sourceExcerpt: null,
    },
    script: {
      lena: ['weiß nicht', 'hilf mir bitte', 'ich kann das nicht'],
      tom: ['Quarte', 'Quinte'],
      anna: ['Quinte', 'warum heißt das Quinte?'],
    },
  },
  // Ethics / philosophical question
  {
    id: 'ethics',
    item: {
      itemId: 'ethics-kant',
      question: 'Was ist der kategorische Imperativ nach Kant in einem Satz erklärt?',
      expectedAnswer:
        'Handle nur nach derjenigen Maxime, durch die du zugleich wollen kannst, dass sie ein allgemeines Gesetz werde.',
      acceptableAnswers: ['Handle so, dass deine Maxime allgemeines Gesetz werden könnte'],
      answerKind: 'long',
      topic: 'Ethik – Kant',
      difficulty: 4,
      subjectKind: 'religion_ethics',
      mcOptions: null,
      mcCorrectIndex: null,
      units: null,
      sourceExcerpt: null,
    },
    script: {
      lena: ['weiß nicht', 'ist mir zu schwer', 'überspring das'],
      anna: [
        'Man soll so handeln, dass die eigene Regel für alle gelten könnte',
        'aber was wenn sich verschiedene Pflichten widersprechen?',
      ],
    },
  },
  // Geography fact-recall
  {
    id: 'geo',
    item: {
      itemId: 'geo-capital',
      question: 'Wie heißt die Hauptstadt von Australien?',
      expectedAnswer: 'Canberra',
      acceptableAnswers: ['Canberra'],
      answerKind: 'short',
      topic: 'Hauptstädte',
      difficulty: 2,
      subjectKind: 'geography',
      mcOptions: null,
      mcCorrectIndex: null,
      units: null,
      sourceExcerpt: null,
    },
    script: {
      lena: ['Sydney', 'weiß nicht'],
      tom: ['Sydney?', 'Canberra'],
      anna: ['Canberra', 'warum nicht Sydney?'],
    },
  },
];

async function main() {
  const env = Env.parse({ ...process.env, AGENT_PROMPT_VERSION: 'v3.1' });
  const llm = createLlmGateway(env);

  for (const persona of PERSONAS) {
    for (const sc of SCENARIOS) {
      const script = sc.script[persona.id];
      if (!script) continue;
      console.log('\n══════════════════════════════════════════════════════════════');
      console.log(`PERSONA: ${persona.id.toUpperCase()}  SCENARIO: ${sc.id.toUpperCase()}`);
      console.log('══════════════════════════════════════════════════════════════');
      console.log(`Q: ${sc.item.question}`);
      console.log(`A (expected): ${sc.item.expectedAnswer}`);

      const history: AgentThreadMessage[] = [];
      const openerText = `Hi ${persona.displayName}! Sollen wir loslegen?\n\n${sc.item.question}`;
      history.push({ role: 'tutor', content: openerText });

      let hintsGivenForItem = 0;
      let priorWrongAttemptsOnItem = 0;

      for (let i = 0; i < script.length; i++) {
        const learnerMsg = script[i]!;
        console.log(`\n  Learner: ${learnerMsg}`);

        const systemInstruction = buildAgentSystemInstructionV3_1({
          learner: {
            displayName: persona.displayName,
            gradeLevel: persona.gradeLevel,
            locale: 'de',
          },
          currentItem: sc.item,
          materialContext: null,
          hintsGivenForItem,
          priorWrongAttemptsOnItem,
          history,
          learnerMessage: learnerMsg,
          session: {
            itemsTotal: 5,
            itemsRemaining: 5 - i,
            minutesElapsed: i,
            testMode: false,
            correctRateSoFar: 0,
            itemsCompleted: 0,
            currentStreak: 0,
            hintsUsedTotal: 0,
          },
        });

        let raw;
        try {
          raw = await llm.agentTurn({ systemInstruction, history, learnerMessage: learnerMsg });
        } catch (err) {
          console.log(`  [ERROR] ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
        const parsed = parseAgentJson(raw.json);
        console.log(`  Tutor: ${parsed.reply}`);
        console.log(
          `    intent=${parsed.intent} verdict=${parsed.verdict} hint=${parsed.hint_given} reveal=${parsed.reveal} advance=${parsed.advance}`,
        );

        history.push({ role: 'learner', content: learnerMsg });
        history.push({ role: 'tutor', content: parsed.reply });
        if (parsed.hint_given) hintsGivenForItem++;
        if (
          parsed.verdict === 'incorrect' ||
          parsed.verdict === 'skipped' ||
          parsed.verdict === 'partially_correct'
        )
          priorWrongAttemptsOnItem++;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
