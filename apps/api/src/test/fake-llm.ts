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
  AgentGatewayInput,
  AgentGatewayResult,
  ExplainInput,
  ExplainResult,
  LLMGateway,
  ReflectSessionInput,
  ReflectSessionResult,
  RegenerateInput,
  RegenerateResult,
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

  /** Fake gateway never caches — context caching is a Vertex feature.
   *  Returning null tells the route to use the legacy non-cached path. */
  async ensureAgentHeaderCache(_header: string, _model: string): Promise<string | null> {
    return null;
  }

  /** Agent v2 — deterministic JSON shape. Inspects the system instruction
   *  to extract the expected answer + hints_given, then reasons about
   *  the learner message to pick a verdict + intent. Enough realism so
   *  the route tests can exercise advance / hint / reveal paths. */
  async agentTurn(
    input: AgentGatewayInput,
    onToken?: (delta: string) => void,
  ): Promise<AgentGatewayResult> {
    const sys = input.systemInstruction;
    const expected =
      matchAfter(sys, /Expected answer:\s*(.+)/i)
        ?.trim()
        .toLowerCase() ?? '';
    const hintsLine = matchAfter(sys, /Hints already given:\s*(\d+)/i) ?? '0';
    const hintsGiven = Number.parseInt(hintsLine, 10);
    const said = input.learnerMessage.trim().toLowerCase();
    const gaveUp = said.length === 0 || isNonAnswer(input.learnerMessage);
    const correct =
      !gaveUp && (said === expected || said.includes(expected) || expected.includes(said));

    let verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null = null;
    let intent: AgentGatewayResult['json'] extends { intent: infer I } ? I : string = 'evaluate';
    let reply = '';
    let advance = false;
    let reveal = false;
    let hintGiven = false;

    if (gaveUp) {
      if (hintsGiven >= 2) {
        verdict = 'skipped';
        reveal = true;
        advance = true;
        intent = 'reveal';
        reply = `Kein Problem — die Antwort ist „${matchAfter(sys, /Expected answer:\s*(.+)/i)?.trim() ?? '…'}". Magst du das nochmal probieren oder weiter?`;
      } else {
        verdict = 'skipped';
        hintGiven = true;
        intent = 'give_up_scaffold';
        reply = 'Kein Stress — schau dir die Frage nochmal in Ruhe an. Welcher Teil ist unklar?';
      }
    } else if (correct) {
      verdict = 'correct';
      advance = true;
      intent = 'praise_and_advance';
      reply = "Genau richtig — stark gemacht! Weiter geht's.";
    } else if (hintsGiven >= 2) {
      verdict = 'incorrect';
      reveal = true;
      advance = true;
      intent = 'reveal';
      reply = `Fast — die Antwort ist „${matchAfter(sys, /Expected answer:\s*(.+)/i)?.trim() ?? '…'}". Lass uns weiterziehen.`;
    } else {
      verdict = 'incorrect';
      hintGiven = true;
      intent = 'hint';
      reply = 'Noch nicht ganz — schau dir die Aufgabe nochmal an. Was fällt dir auf?';
    }

    const json = {
      reply,
      verdict,
      advance,
      reveal,
      hint_given: hintGiven,
      intent,
    };
    if (onToken) onToken(reply);
    return { json, reply, usage: { ...FAKE_USAGE } };
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

function matchAfter(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m?.[1] ?? null;
}
