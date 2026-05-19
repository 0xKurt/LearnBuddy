// Fake LLM gateway. Replaces the old apps/api/src/lib/placeholders.ts —
// same intent (deterministic 3-item output) but now behind the gateway
// seam, so the production route can call deps.llm.visionExtractAndGenerate
// without branching on env.
//
// Used by:
//   - vitest (createTestDeps())
//   - local dev when no GOOGLE_CLOUD_PROJECT is configured (the factory
//     falls back to this with a console.warn)

import type {
  ConverseTurnInput,
  ConverseTurnResult,
  EvaluateInput,
  EvaluateResult,
  ExplainInput,
  ExplainResult,
  LLMGateway,
  ReflectSessionInput,
  ReflectSessionResult,
  RegenerateInput,
  RegenerateResult,
  TranscribeInput,
  TranscribeResult,
  VisionInput,
  VisionResult,
} from '../lib/llm/gateway.js';
import { isNonAnswer } from '../lib/give-up.js';

const FAKE_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cost_usd_micros: 0,
  model: 'fake',
  prompt_version: 'fake',
} as const;

export class FakeLlmGateway implements LLMGateway {
  async visionExtractAndGenerate(input: VisionInput): Promise<VisionResult> {
    const lang = input.locale === 'en' ? 'en' : 'de';
    return {
      detected_language: lang as VisionResult['detected_language'],
      extracted_markdown: '# Material (fake)\n\nDieser Inhalt stammt vom FakeLlmGateway.',
      items: [
        {
          question: 'Wir bereiten dein Material vor.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
        {
          question: 'Echte Fragen erscheinen, sobald die Auswertung läuft.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
        {
          question: 'Bis dahin sieht dieser Platzhalter aus wie eine echte Aufgabe.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
      ],
      diagrams: [],
      problem_templates: [],
      error: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async regenerateFromText(input: RegenerateInput): Promise<RegenerateResult> {
    const lang = (input.locale === 'en' ? 'en' : 'de') as 'de' | 'en';
    return {
      items: Array.from({ length: 3 }, (_, i) => ({
        question: `Zusätzliche Frage ${i + 1} (fake).`,
        expected_answer: 'OK',
        acceptable_answers: [],
        answer_kind: 'short' as const,
        stimulus_kind: 'none' as const,
        stimulus_data: {},
        difficulty: 2,
        language: lang,
      })),
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async evaluateAnswer(input: EvaluateInput): Promise<EvaluateResult> {
    // Deterministic: exact match → correct, else incorrect with hint when allowed.
    const exact =
      input.kidAnswer.trim().toLowerCase() === input.expectedAnswer.trim().toLowerCase() ||
      input.acceptableAnswers.some(
        (a) => a.trim().toLowerCase() === input.kidAnswer.trim().toLowerCase(),
      );
    const correct = exact;
    return {
      verdict: correct ? 'correct' : 'incorrect',
      feedback: correct
        ? 'Genau richtig — sauber!'
        : 'Noch nicht ganz. Schau dir die Aufgabe nochmal in Ruhe an.',
      next_hint:
        !correct && input.priorHints.length < 2
          ? 'Versuch, die Frage Schritt für Schritt zu lesen.'
          : null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async explain(input: ExplainInput): Promise<ExplainResult> {
    return {
      text: `Erklärung zu "${input.topic}" (fake, ${input.style}). Echte Erklärungen folgen, sobald Vertex konfiguriert ist.`,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async converseTurn(
    input: ConverseTurnInput,
    onToken?: (delta: string) => void,
  ): Promise<ConverseTurnResult> {
    const said = input.learnerMessage.trim().toLowerCase();
    const item = input.item;
    let isCorrect =
      said === item.expectedAnswer.trim().toLowerCase() ||
      item.acceptableAnswers.some((a) => a.trim().toLowerCase() === said);
    if (!isCorrect && item.answerKind === 'multiple_choice' && item.mcCorrectIndex != null) {
      isCorrect = said === String(item.mcCorrectIndex);
    }

    const gaveUp = !isCorrect && isNonAnswer(input.learnerMessage);
    const canReveal = input.hintsGivenForItem >= 2;
    let reply: string;
    let verdict: ConverseTurnResult['verdict'];
    let gaveHint = false;
    if (isCorrect) {
      reply = 'Genau richtig — stark gemacht!';
      verdict = 'correct';
    } else if (input.testMode) {
      reply = 'Alles klar, notiert. Weiter geht es.';
      verdict = gaveUp ? 'skipped' : 'incorrect';
    } else if (canReveal) {
      reply = `Kein Problem. Die Lösung ist: ${item.expectedAnswer}. Das merkst du dir bestimmt.`;
      // A reveal is never the student's own answer.
      verdict = gaveUp ? 'skipped' : 'incorrect';
    } else if (gaveUp) {
      reply = 'Kein Stress — denk nochmal in Ruhe nach, ich helf dir Schritt für Schritt.';
      verdict = 'skipped';
      gaveHint = true;
    } else {
      reply = 'Noch nicht ganz — lies die Frage nochmal in Ruhe, du bist nah dran.';
      verdict = 'incorrect';
      gaveHint = true;
    }

    if (onToken) {
      // Emit in a couple of chunks so streaming consumers are exercised.
      const mid = Math.ceil(reply.length / 2);
      onToken(reply.slice(0, mid));
      onToken(reply.slice(mid));
    }

    // Phase D2: when probeContext is set, classify the probe response
    // deterministically. Keywords that mean "I don't know" → gave_up.
    // Short single-word or very short replies → rephrased (heuristic).
    // Otherwise → substantive.
    let probeAssessment: ConverseTurnResult['probeAssessment'] = null;
    if (input.probeContext) {
      const raw = input.learnerMessage.trim();
      const lower = raw.toLowerCase();
      const isGaveUp =
        raw.length === 0 ||
        /^(weiß nicht|weiss nicht|keine ahnung|idk|i don'?t know|kp|kA|nö|nein|ja)$/i.test(lower);
      if (isGaveUp) {
        probeAssessment = 'gave_up';
      } else if (raw.length < 20) {
        probeAssessment = 'rephrased';
      } else {
        probeAssessment = 'substantive';
      }
    }

    return { verdict, reply, gaveHint, probeAssessment, usage: { ...FAKE_USAGE } };
  }

  async transcribeAudio(_input: TranscribeInput): Promise<TranscribeResult> {
    return { text: 'gesprochene Antwort', usage: { ...FAKE_USAGE } };
  }

  async reflectSession(input: ReflectSessionInput): Promise<ReflectSessionResult> {
    const topics = Array.from(
      new Set(input.transcript.map((t) => t.item_topic).filter((x): x is string => !!x)),
    );
    const verdicts = input.transcript
      .filter((t) => t.role === 'tutor' && t.verdict)
      .map((t) => t.verdict);
    const corrects = verdicts.filter((v) => v === 'correct').length;
    const skips = verdicts.filter((v) => v === 'skipped').length;
    return {
      one_sentence_arc: `Fake session: ${input.transcript.length} turns over ${topics.length || 'no'} topics; ${corrects} correct, ${skips} skipped.`,
      concepts_touched: topics,
      high_points: corrects > 0 ? [`${corrects} items answered correctly`] : [],
      low_points: skips > 0 ? [`${skips} give-ups`] : [],
      hypothesized_misconceptions: [],
      open_questions: [],
      usage: { ...FAKE_USAGE },
    };
  }
}
