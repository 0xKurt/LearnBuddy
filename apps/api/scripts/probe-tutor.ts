// Tutor-prompt probe — runs 4 student personas through scripted dialogs
// against the live Vertex Gemini tutor and prints the full transcript.
//
// Purpose: diagnose how a given system-prompt version behaves on real
// student inputs, and (with the auto-criteria checks below) decide
// whether a new prompt regresses on known failure patterns.
//
// Run:
//   pnpm -F @learnbuddy/api probe:tutor                     # all personas × all scenarios, v3
//   pnpm -F @learnbuddy/api probe:tutor lena math           # one persona + one scenario
//   pnpm -F @learnbuddy/api probe:tutor --version v2        # use the v2 prompt
//   pnpm -F @learnbuddy/api probe:tutor --version v2 lena math
//
// Output: transcripts to stdout + markdown copies in
// docs/tutor-research/_transcripts/<persona>-<scenario>-<version>.md.
// Auto-criteria summary appended to each transcript.
//
// The criteria come from docs/tutor-research/07-evaluation-plan.md.
// They're deterministic regex / string checks — no second LLM call.

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Env } from '../src/lib/env.js';
import { createLlmGateway } from '../src/lib/llm/factory.js';
import { buildAgentSystemInstructionForVersion } from '../src/lib/agent/index.js';
import { parseAgentJson } from '../src/lib/agent/parse.js';
import type { AgentItemContext, AgentThreadMessage, SubjectKind } from '../src/lib/agent/types.js';

type Persona = {
  id: string;
  displayName: string;
  gradeLevel: number;
  locale: 'de';
  description: string;
};

type Item = AgentItemContext & {
  scripts: Record<string, string[]>;
};

const PERSONAS: Persona[] = [
  {
    id: 'lena',
    displayName: 'Lena',
    gradeLevel: 8,
    locale: 'de',
    description:
      'Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.',
  },
  {
    id: 'tom',
    displayName: 'Tom',
    gradeLevel: 9,
    locale: 'de',
    description:
      'Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.',
  },
  {
    id: 'anna',
    displayName: 'Anna',
    gradeLevel: 9,
    locale: 'de',
    description:
      'Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.',
  },
  {
    id: 'max',
    displayName: 'Max',
    gradeLevel: 7,
    locale: 'de',
    description:
      'Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.',
  },
];

const SCENARIOS: Item[] = [
  {
    itemId: 'math-fractions-1',
    question: 'Wie viel ist 2/3 + 1/4?',
    expectedAnswer: '11/12',
    acceptableAnswers: ['11/12', '0,916...', '0,9166', '11 zwölftel'],
    answerKind: 'numeric',
    topic: 'Bruchrechnung',
    difficulty: 3,
    subjectKind: 'math' as SubjectKind,
    units: null,
    scripts: {
      lena: ['äh weiß nicht', 'verstehe das gar nicht', 'kannst du mir das erklären?'],
      tom: ['5/12?', 'oh stimmt — 11/12?'],
      anna: ['11/12', 'warum nimmt man den Hauptnenner?'],
      max: ['11/7', 'ich kann das nicht', 'das nervt'],
    },
  },
  {
    itemId: 'fr-vocab-uhr',
    question: 'Was heißt "die Uhr" auf Französisch?',
    expectedAnswer: "l'heure",
    acceptableAnswers: ["l'heure", 'une heure', 'la montre'],
    answerKind: 'short',
    topic: 'Uhrzeit',
    difficulty: 2,
    subjectKind: 'language_foreign' as SubjectKind,
    units: null,
    scripts: {
      lena: ['weiß ich nicht', 'hilf mir bitte', 'kannst du mir das sagen?'],
      tom: ['l heure?', "l'heure"],
      anna: ["l'heure", 'warum ist das weiblich?'],
      max: ['la temps', 'die uhrzeit ist scheisse', 'ich gebs auf'],
    },
  },
  {
    itemId: 'history-ww1-start',
    question: 'Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?',
    expectedAnswer:
      'Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand',
    acceptableAnswers: [
      'Attentat von Sarajevo',
      'Sarajevo-Attentat',
      'Attentat auf Franz Ferdinand',
      'Erschießung des Thronfolgers',
    ],
    answerKind: 'short',
    topic: 'Erster Weltkrieg',
    difficulty: 3,
    subjectKind: 'history' as SubjectKind,
    units: null,
    sourceExcerpt:
      'Am 28. Juni 1914 wurde der österreichisch-ungarische Thronfolger Erzherzog Franz Ferdinand in Sarajevo erschossen. Das Attentat gilt als unmittelbarer Auslöser des Ersten Weltkriegs.',
    scripts: {
      lena: ['hm', 'keine ahnung', 'kannst du mir helfen?'],
      tom: ['irgendwas mit einem Attentat in Bosnien', 'oh stimmt das war Sarajevo'],
      anna: ['Attentat von Sarajevo', 'warum führte das gerade zum Krieg?'],
      max: ['hitler', 'ich kann geschichte nicht', 'überspring das'],
    },
  },
  {
    itemId: 'fr-conj-aller-je',
    question: 'Wie heißt "aller" in der ersten Person Singular Präsens?',
    expectedAnswer: 'je vais',
    acceptableAnswers: ['je vais', 'vais'],
    answerKind: 'short',
    topic: 'Verben Präsens',
    difficulty: 3,
    subjectKind: 'language_foreign' as SubjectKind,
    units: null,
    scripts: {
      lena: ['weiß nicht', 'hilf mir', 'wie geht das nochmal?'],
      tom: ['je alle', 'oh — je vais'],
      anna: ['je vais', 'aller ist unregelmäßig oder?'],
      max: ['je aller', 'fränzosich ist dumm', 'ich kann das nicht'],
    },
  },
];

// ── Auto-criteria checks ─────────────────────────────────────────────
//
// Each check returns null on pass, or a string explaining the failure.
// Run against the FULL list of tutor replies in a transcript.

type Reply = {
  text: string;
  verdict: string | null;
  advance: boolean;
  reveal: boolean;
  intent: string;
};

type CriterionResult = { id: string; description: string; passed: boolean; detail: string };

const BANNED_SOURCE_REDIRECTS = [
  /schau\s+(noch\s+mal\s+)?(genau\s+)?(in|im|den)/i,
  /lies\s+(das\s+)?(nochmal|nochmals|noch\s+mal)/i,
  /steht\s+(das\s+)?(genau\s+)?im\s+(text|material)/i,
  /im\s+text\s+steht/i,
];

const BANNED_ABILITY_PRAISE = /\b(schlau|smart|cleverer?|genie|talentiert|talent|naturtalent)\b/i;

function runCriteria(replies: Reply[], persona: string, scenario: string): CriterionResult[] {
  const all = replies.map((r) => r.text).join('\n');
  const results: CriterionResult[] = [];

  // C1 — no "schau im Material / lies nochmal"
  const c1Hit = BANNED_SOURCE_REDIRECTS.find((re) => re.test(all));
  results.push({
    id: 'C1',
    description: 'No "schau im Material / lies nochmal" redirect',
    passed: !c1Hit,
    detail: c1Hit ? `Hit pattern: ${c1Hit}` : 'ok',
  });

  // C2 — economy of language: each reply ≤ 4 sentences and ≤ 350 chars
  const tooLong = replies.find((r) => {
    const sentences = r.text.split(/[.!?]\s/).filter((s) => s.trim().length > 0);
    return sentences.length > 4 || r.text.length > 380;
  });
  results.push({
    id: 'C2',
    description: 'Economy of language (≤ 4 sentences per reply)',
    passed: !tooLong,
    detail: tooLong ? `Long reply: "${tooLong.text.slice(0, 80)}…"` : 'ok',
  });

  // C3 — no ability praise
  const c3Hit = BANNED_ABILITY_PRAISE.exec(all);
  results.push({
    id: 'C3',
    description: 'No ability praise (schlau / smart / Talent etc)',
    passed: !c3Hit,
    detail: c3Hit ? `Used "${c3Hit[0]}"` : 'ok',
  });

  // C5 — every reveal includes a micro-check (question mark + not just "?")
  const reveals = replies.filter((r) => r.reveal);
  const badReveal = reveals.find((r) => {
    const hasQuestion = /\?/.test(r.text);
    const ending = r.text.trim().toLowerCase();
    const hasOnlyAdvanceCloser =
      /lass uns (weitermachen|gleich.*weiter|die nächste)/.test(ending) && !hasQuestion;
    return !hasQuestion || hasOnlyAdvanceCloser;
  });
  results.push({
    id: 'C5',
    description: 'Every reveal includes a micro-check question',
    passed: reveals.length === 0 || !badReveal,
    detail: badReveal
      ? `Reveal without micro-check: "${badReveal.text.slice(0, 80)}…"`
      : reveals.length === 0
        ? 'no reveal'
        : 'ok',
  });

  // C6 — no invented next-question text on advance. Heuristic: the
  // advance reply shouldn't end with a "?" except the micro-check after
  // reveal. We allow advance+reveal+question; we flag plain advance with
  // a fabricated next question (advance=true, reveal=false, ends with ?).
  const fabricatedNext = replies.find(
    (r) => r.advance && !r.reveal && /\?[\s"'»]*$/.test(r.text.trim()),
  );
  results.push({
    id: 'C6',
    description: 'No fabricated next-question on plain advance',
    passed: !fabricatedNext,
    detail: fabricatedNext ? `Fabricated next: "${fabricatedNext.text.slice(0, 80)}…"` : 'ok',
  });

  // Scenario-specific: max math needs affective_repair on "das nervt"
  if (persona === 'max' && scenario === 'math') {
    const repair = replies.find((r) => r.intent === 'affective_repair');
    results.push({
      id: 'SC-max-math-affect',
      description: 'Max math: affective_repair fires on "das nervt"',
      passed: !!repair,
      detail: repair ? 'fired' : 'never fired',
    });
  }

  // Scenario-specific: anna math needs stay_for_depth on "warum?"
  if (persona === 'anna' && scenario === 'math') {
    const depth = replies.find((r) => r.intent === 'stay_for_depth' || r.intent === 'explain');
    results.push({
      id: 'SC-anna-math-depth',
      description: 'Anna math: stays for depth on "warum?"',
      passed: !!depth,
      detail: depth ? `fired (intent=${depth.intent})` : 'never fired',
    });
  }

  // Scenario-specific: max math "11/7" shouldn't get "Fast" (wrong-and-far)
  if (persona === 'max' && scenario === 'math') {
    const firstReply = replies[0];
    const usedFast = firstReply && /\b(fast|fast,|fast!)\b/i.test(firstReply.text);
    results.push({
      id: 'SC-max-math-far',
      description: 'Max math: "11/7" not greeted with "Fast"',
      passed: !usedFast,
      detail: usedFast ? `First reply uses "Fast"` : 'ok',
    });
  }

  return results;
}

async function runScenario(
  persona: Persona,
  item: Item,
  version: 'v2' | 'v3' | 'v3.1',
): Promise<{
  transcript: string;
  pass: number;
  fail: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  turnCount: number;
}> {
  const env = Env.parse({
    ...process.env,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? 'placeholder',
    AGENT_PROMPT_VERSION_OVERRIDE: version,
  });
  const llm = createLlmGateway(env);

  const lines: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  const script = item.scripts[persona.id] ?? [];
  const tag = item.itemId.includes('fractions')
    ? 'math'
    : item.itemId.includes('vocab')
      ? 'vocab'
      : item.itemId.includes('history')
        ? 'history'
        : 'conj';

  log(`# ${persona.displayName} (${persona.id}) — ${item.topic} — prompt ${version}`);
  log('');
  log(`**Persona:** ${persona.description}`);
  log(`**Question:** ${item.question}`);
  log(`**Expected:** ${item.expectedAnswer}`);
  log('');
  log('---');
  log('');

  const history: AgentThreadMessage[] = [];
  const openerText = `Hi ${persona.displayName}! Sollen wir loslegen?\n\n${item.question}`;
  history.push({ role: 'tutor', content: openerText });
  log(`**Tutor (opener):** ${openerText}`);
  log('');

  let hintsGivenForItem = 0;
  let priorWrongAttemptsOnItem = 0;
  let correctSoFar = 0;
  let itemsCompleted = 0;
  let currentStreak = 0;
  let hintsUsedTotal = 0;
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let turnCount = 0;

  const replies: Reply[] = [];

  for (let i = 0; i < script.length; i++) {
    const learnerMsg = script[i]!;
    log(`**Learner:** ${learnerMsg}`);
    log('');

    const { instruction: systemInstruction } = buildAgentSystemInstructionForVersion(version, {
      learner: {
        displayName: persona.displayName,
        gradeLevel: persona.gradeLevel,
        locale: persona.locale,
      },
      currentItem: item,
      materialContext: item.sourceExcerpt ?? null,
      hintsGivenForItem,
      priorWrongAttemptsOnItem,
      history,
      learnerMessage: learnerMsg,
      session: {
        itemsTotal: 5,
        itemsRemaining: 5 - i,
        minutesElapsed: i * 1,
        testMode: false,
        correctRateSoFar: itemsCompleted > 0 ? correctSoFar / itemsCompleted : 0,
        itemsCompleted,
        currentStreak,
        hintsUsedTotal,
      },
    });

    let raw;
    try {
      raw = await llm.agentTurn({
        systemInstruction,
        history,
        learnerMessage: learnerMsg,
      });
    } catch (err) {
      log(`**[ERROR]** ${err instanceof Error ? err.message : String(err)}`);
      log('');
      break;
    }

    const parsed = parseAgentJson(raw.json);
    inputTokensTotal += raw.usage.input_tokens;
    outputTokensTotal += raw.usage.output_tokens;
    const cachedTokens = raw.usage.cached_input_tokens ?? 0;
    turnCount += 1;
    log(`**Tutor:** ${parsed.reply}`);
    const cacheNote = cachedTokens > 0 ? ` (cached=${cachedTokens})` : '';
    log(
      `  - verdict=${parsed.verdict}  advance=${parsed.advance}  reveal=${parsed.reveal}  hint_given=${parsed.hint_given}  intent=${parsed.intent}  tokens=${raw.usage.input_tokens}${cacheNote}/${raw.usage.output_tokens}  model=${raw.usage.model}`,
    );
    log('');

    replies.push({
      text: parsed.reply,
      verdict: parsed.verdict,
      advance: parsed.advance,
      reveal: parsed.reveal,
      intent: parsed.intent,
    });

    history.push({ role: 'learner', content: learnerMsg });
    history.push({ role: 'tutor', content: parsed.reply });

    if (parsed.hint_given) {
      hintsGivenForItem += 1;
      hintsUsedTotal += 1;
    }
    if (
      parsed.verdict === 'incorrect' ||
      parsed.verdict === 'skipped' ||
      parsed.verdict === 'partially_correct'
    ) {
      priorWrongAttemptsOnItem += 1;
    }
    if (parsed.advance) {
      if (parsed.verdict === 'correct') correctSoFar += 1;
      itemsCompleted += 1;
      currentStreak =
        parsed.verdict === 'correct'
          ? Math.max(1, currentStreak + 1)
          : Math.min(-1, currentStreak - 1);
      log('_(server would now pop the next item — scenario ends)_');
      break;
    }
    // affective_repair resets hint counter (matches the v3 prompt spec)
    if (parsed.intent === 'affective_repair') {
      hintsGivenForItem = 0;
    }
  }

  // Auto-criteria
  log('');
  log('---');
  log('## Auto-criteria');
  log('');
  const criteria = runCriteria(replies, persona.id, tag);
  let pass = 0;
  let fail = 0;
  for (const c of criteria) {
    const tick = c.passed ? '✓' : '✗';
    log(`- ${tick} **${c.id}** — ${c.description}: ${c.detail}`);
    if (c.passed) pass += 1;
    else fail += 1;
  }

  // Append a small token-usage summary.
  log('');
  log(
    `Tokens (turns ${turnCount}): in=${inputTokensTotal} (avg ${turnCount ? Math.round(inputTokensTotal / turnCount) : 0}) · out=${outputTokensTotal} (avg ${turnCount ? Math.round(outputTokensTotal / turnCount) : 0})`,
  );

  return {
    transcript: lines.join('\n'),
    pass,
    fail,
    inputTokensTotal,
    outputTokensTotal,
    turnCount,
  };
}

async function main() {
  // Parse args: optional --version v2 | v3 | v3.1 then optional persona + scenario
  const args = process.argv.slice(2);
  let version: 'v2' | 'v3' | 'v3.1' = 'v3.1';
  const versionFlagIdx = args.indexOf('--version');
  if (versionFlagIdx !== -1) {
    const v = args[versionFlagIdx + 1];
    if (v === 'v2' || v === 'v3' || v === 'v3.1') version = v;
    args.splice(versionFlagIdx, 2);
  }
  const personaFilter = args[0]?.toLowerCase();
  const scenarioFilter = args[1]?.toLowerCase();

  const outDir = '/Users/kurt/git/LearnBuddy/docs/tutor-research/_transcripts';
  mkdirSync(outDir, { recursive: true });

  let totalPass = 0;
  let totalFail = 0;
  let runs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTurns = 0;

  for (const persona of PERSONAS) {
    if (personaFilter && persona.id !== personaFilter) continue;
    for (const item of SCENARIOS) {
      const tag = item.itemId.includes('fractions')
        ? 'math'
        : item.itemId.includes('vocab')
          ? 'vocab'
          : item.itemId.includes('history')
            ? 'history'
            : 'conj';
      if (scenarioFilter && tag !== scenarioFilter) continue;

      console.log('\n\n══════════════════════════════════════════════════════════════');
      console.log(
        `PERSONA: ${persona.id.toUpperCase()}  SCENARIO: ${tag.toUpperCase()}  VERSION: ${version}`,
      );
      console.log('══════════════════════════════════════════════════════════════\n');

      const result = await runScenario(persona, item, version);
      totalPass += result.pass;
      totalFail += result.fail;
      runs += 1;
      totalInputTokens += result.inputTokensTotal;
      totalOutputTokens += result.outputTokensTotal;
      totalTurns += result.turnCount;
      const tagForFile = version.replace('.', '_'); // v3.1 → v3_1 for filenames
      const file = join(outDir, `${persona.id}-${tag}-${tagForFile}.md`);
      writeFileSync(file, result.transcript, 'utf8');
      console.log(`\n(saved to ${file})`);
    }
  }

  if (runs > 0) {
    console.log('\n\n══════════════════════════════════════════════════════════════');
    console.log(
      `OVERALL ${version}: ${totalPass} pass, ${totalFail} fail across ${runs} scenarios`,
    );
    console.log(
      `Tokens: in=${totalInputTokens} (avg/turn ${Math.round(totalInputTokens / Math.max(1, totalTurns))}) · out=${totalOutputTokens} (avg/turn ${Math.round(totalOutputTokens / Math.max(1, totalTurns))})`,
    );
    console.log('══════════════════════════════════════════════════════════════');
  }
}

main().catch((err) => {
  console.error('Unhandled probe error:', err);
  process.exit(1);
});
