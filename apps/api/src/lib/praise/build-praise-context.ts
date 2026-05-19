// Specific praise — Phase A1.
//
// Before: every correct answer got one of 5 stock praise lines via
// `pickPraise(locale)`. Same "Genau!" whether the learner got it on the
// first try or after 3 hints. Generic praise stops feeling like praise
// after about 5 turns.
//
// After: we classify the verdict into one of 5 PraiseKinds based on
// hints_used / difficulty / answer_kind / prior_attempts. Each kind has
// a different tone:
//
//   - first_try_easy        — light acknowledgement, NO inflation
//   - first_try_hard        — specific praise of WHAT (the topic)
//   - effort_after_hints    — praise EFFORT and STRATEGY, never ability
//   - self_corrected        — praise the CORRECTION move itself
//   - reasoned_not_recalled — praise the REASONING path
//
// Dweck / growth-mindset: ability praise ("smart!", "du bist schlau")
// creates fragility because the learner stops attempting things they
// fear they won't be praised for. Effort + strategy + content praise
// doesn't. That's the rubric.
//
// Two consumers:
//
//   1. Fast path (local-correct, no model) — we render the praise text
//      directly from `buildPraiseFastPath(...)`, which picks a variant
//      from a small per-locale, per-kind table.
//   2. Tutor path (model produces praise) — we inject a rubric fragment
//      from `buildPraiseRubricFragment(...)` into the system prompt so
//      the model's praise output respects the same shaping.
//
// L1 (the wall): the rubric never analyzes the learner. It instructs the
// model to praise effort / strategy / specific content — never ability.

export type Locale = 'de' | 'en' | 'fr' | 'es' | 'it';

export type PraiseKind =
  | 'first_try_easy'
  | 'first_try_hard'
  | 'effort_after_hints'
  | 'self_corrected'
  | 'reasoned_not_recalled';

export type Praise =
  | { kind: 'first_try_easy'; difficulty: 1 | 2 }
  | { kind: 'first_try_hard'; difficulty: 3 | 4 | 5; topic: string | null }
  | { kind: 'effort_after_hints'; hints: number; topic: string | null }
  | { kind: 'self_corrected'; priorAttempts: number }
  | { kind: 'reasoned_not_recalled'; topic: string | null };

export type PraiseInput = {
  hintsUsed: number;
  itemDifficulty: number; // 1..5
  itemAnswerKind: string; // 'short' | 'long' | 'numeric' | ...
  itemTopic: string | null;
  learnerTextWordCount: number;
  priorWrongAttemptsOnItem: number;
};

/** Classify what kind of praise this correct verdict deserves. Pure
 *  function — no I/O, no LLM call. */
export function classifyPraise(input: PraiseInput): Praise {
  const difficulty = clampDifficulty(input.itemDifficulty);
  const isConceptual = input.itemAnswerKind === 'short' || input.itemAnswerKind === 'long';

  // Most important signal: did the learner CORRECT their own prior
  // mistake on this same item? That's a metacognitive move and the
  // single most important thing to reinforce.
  if (input.priorWrongAttemptsOnItem >= 1 && input.hintsUsed === 0) {
    return { kind: 'self_corrected', priorAttempts: input.priorWrongAttemptsOnItem };
  }

  // Effort path: hints were used and they got there anyway. Praise the
  // work, not the destination.
  if (input.hintsUsed >= 1) {
    return { kind: 'effort_after_hints', hints: input.hintsUsed, topic: input.itemTopic };
  }

  // Reasoning path: short answer on a conceptual item. They didn't just
  // recall — they argued. (Length is a rough proxy: > 6 words on a
  // short/long item suggests they explained, not just stated.)
  if (isConceptual && input.learnerTextWordCount > 6) {
    return { kind: 'reasoned_not_recalled', topic: input.itemTopic };
  }

  // First try on hard material: specific content praise.
  if (difficulty === 3 || difficulty === 4 || difficulty === 5) {
    return { kind: 'first_try_hard', difficulty, topic: input.itemTopic };
  }

  // First try on easy material: brief acknowledgement, no inflation.
  return { kind: 'first_try_easy', difficulty };
}

function clampDifficulty(d: number): 1 | 2 | 3 | 4 | 5 {
  if (d <= 1) return 1;
  if (d >= 5) return 5;
  return Math.round(d) as 1 | 2 | 3 | 4 | 5;
}

// ── Fast-path text rendering ─────────────────────────────────────────

type PraiseTable = Record<PraiseKind, string[]>;

// Each PraiseKind gets 2–3 variants per locale. We rotate based on a
// stable hash so consecutive correct answers on the same session don't
// see the same variant. Variants intentionally avoid ability words
// (smart, klever, intelligent, Genie, Talent) — those are banned by lint
// and tested against.
const TABLES: Record<Locale, PraiseTable> = {
  de: {
    first_try_easy: ['Stimmt.', 'Genau.', 'Ja, passt.'],
    first_try_hard: [
      'Direkt richtig — sauber.',
      'Direkt erkannt — gute Antwort.',
      'Direkt richtig. Stark.',
    ],
    effort_after_hints: [
      'Du bist da selbst durchgegangen — gute Schritte.',
      'Du hast die Schritte sauber zusammengesetzt.',
      'Genau — du hast dich da Stück für Stück hingearbeitet.',
    ],
    self_corrected: [
      'Du hast deinen ersten Versuch selbst gefixt — das ist die wichtigste Bewegung.',
      'Du hast deinen Fehler selbst gesehen und korrigiert. Genau das übt sich.',
      'Genau — und du hast den Bogen selbst gekriegt.',
    ],
    reasoned_not_recalled: [
      'Sauber argumentiert — nicht nur die Antwort, sondern auch warum.',
      'Genau, und du hast den Weg dahin erklärt. Das ist das Eigentliche.',
      'Stimmt — und du hast die Begründung gleich mitgeliefert.',
    ],
  },
  en: {
    first_try_easy: ["That's right.", 'Yep, correct.', 'Right.'],
    first_try_hard: [
      'Got it on the first try — nicely done.',
      'Straight in. Solid.',
      "That's it, first attempt.",
    ],
    effort_after_hints: [
      'You worked through that yourself — good steps.',
      'You put the pieces together cleanly.',
      'There you go — you walked yourself in.',
    ],
    self_corrected: [
      'You spotted your first attempt and fixed it — that move matters more than the answer.',
      'You caught your own mistake and corrected it. That is the skill.',
      'You got there by fixing your own work.',
    ],
    reasoned_not_recalled: [
      'Solid reasoning — not just the answer but the why.',
      "Right, and you explained the path. That's the real thing.",
      'Yep — and you carried your reasoning with you.',
    ],
  },
  fr: {
    first_try_easy: ["C'est juste.", 'Exact.', 'Oui.'],
    first_try_hard: [
      'Du premier coup — propre.',
      'Direct, bonne réponse.',
      'Tu as eu dès la première.',
    ],
    effort_after_hints: [
      'Tu as cheminé toi-même — bonnes étapes.',
      'Tu as assemblé les étapes proprement.',
      'Voilà — tu y es arrivé pas à pas.',
    ],
    self_corrected: [
      'Tu as vu ta première tentative et corrigé — ce mouvement compte plus que la réponse.',
      "Tu as repéré ton erreur et l'as corrigée. C'est cette habitude qu'on s'entraîne.",
      'Tu y es arrivé en corrigeant ton propre raisonnement.',
    ],
    reasoned_not_recalled: [
      'Raisonnement propre — pas seulement la réponse mais le pourquoi.',
      "Exact, et tu as expliqué le chemin. C'est ça l'essentiel.",
      'Oui — et tu as gardé le fil du raisonnement.',
    ],
  },
  es: {
    first_try_easy: ['Correcto.', 'Sí.', 'Eso es.'],
    first_try_hard: [
      'A la primera — limpio.',
      'Directo, buena respuesta.',
      'Lo pillaste al primer intento.',
    ],
    effort_after_hints: [
      'Has avanzado tú mismo — buenos pasos.',
      'Has ido encajando los pasos.',
      'Ahí está — has llegado pasito a pasito.',
    ],
    self_corrected: [
      'Has visto tu primer intento y lo corregiste — ese movimiento importa más que la respuesta.',
      'Has detectado tu fallo y lo has arreglado. Eso es lo que se entrena.',
      'Has llegado corrigiendo tu propio razonamiento.',
    ],
    reasoned_not_recalled: [
      'Razonamiento limpio — no solo la respuesta, también el porqué.',
      'Sí, y explicaste el camino. Eso es lo importante.',
      'Eso es — y has llevado el razonamiento contigo.',
    ],
  },
  it: {
    first_try_easy: ['Esatto.', 'Sì.', 'Giusto.'],
    first_try_hard: [
      'Al primo colpo — pulito.',
      'Diretto, bella risposta.',
      'Lo hai preso subito.',
    ],
    effort_after_hints: [
      'Hai camminato da solo — buoni passi.',
      'Hai messo insieme i passi con cura.',
      'Ecco — ci sei arrivato passo dopo passo.',
    ],
    self_corrected: [
      "Hai visto il primo tentativo e l'hai sistemato — quel movimento conta più della risposta.",
      "Hai trovato il tuo errore e l'hai corretto. È questo che si allena.",
      'Ci sei arrivato correggendo il tuo ragionamento.',
    ],
    reasoned_not_recalled: [
      'Ragionamento pulito — non solo la risposta, ma anche il perché.',
      'Esatto, e hai spiegato il percorso. È questo che conta.',
      'Sì — e ti sei portato dietro il ragionamento.',
    ],
  },
};

/** Pick a praise variant. The variant index is a stable hash of the
 *  rotation seed so the same correct answer always produces the same
 *  variant on retry/replay, but two consecutive corrects in a session
 *  see different variants. */
export function buildPraiseFastPath(praise: Praise, locale: Locale, rotationSeed: string): string {
  const variants = TABLES[locale][praise.kind];
  const idx = stableHash(rotationSeed) % variants.length;
  let text = variants[idx]!;
  // Topic-aware variants for the kinds that have it. Suffix "auf
  // {topic} hast du den Bogen raus" style — but only when topic is
  // meaningful (not "—" or empty).
  const topic = topicFor(praise);
  if (topic && (praise.kind === 'first_try_hard' || praise.kind === 'reasoned_not_recalled')) {
    text = `${text}${topicSuffix(locale, topic)}`;
  }
  return text;
}

function topicFor(p: Praise): string | null {
  if (p.kind === 'first_try_hard' || p.kind === 'effort_after_hints') return p.topic;
  if (p.kind === 'reasoned_not_recalled') return p.topic;
  return null;
}

function topicSuffix(locale: Locale, topic: string): string {
  const t = topic.trim();
  // Defensive: don't append meaningless markers.
  if (!t || t === '—' || t === '-' || t.length > 60) return '';
  switch (locale) {
    case 'de':
      return ` Bei „${t}" hast du den Bogen raus.`;
    case 'en':
      return ` You've got the hang of "${t}".`;
    case 'fr':
      return ` Tu maîtrises bien « ${t} ».`;
    case 'es':
      return ` Tienes bien pillado "${t}".`;
    case 'it':
      return ` Hai preso bene "${t}".`;
  }
}

function stableHash(s: string): number {
  // Deterministic, ~uniform-enough hash for variant picking.
  // Not cryptographic; just consistent across server restarts.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// ── Tutor-path rubric injection ─────────────────────────────────────

/** Build the praise rubric fragment for SYSTEM_TUTOR. Tells the model
 *  what KIND of praise this turn calls for if its verdict is correct.
 *  Never mentions the learner in first person ("you seem to…"). The
 *  rubric is about HOW to praise, not WHO the learner is. */
export function buildPraiseRubricFragment(praise: Praise): string {
  switch (praise.kind) {
    case 'first_try_easy':
      return [
        '— Praise rubric (only if verdict is correct) —',
        '- Easy item, first attempt. Brief acknowledgement only.',
        '- One short word or phrase. Do not inflate. Do not call the student smart, clever, or talented.',
      ].join('\n');
    case 'first_try_hard':
      return [
        '— Praise rubric (only if verdict is correct) —',
        `- Item is difficulty ${praise.difficulty}/5${praise.topic ? `, topic "${praise.topic}"` : ''}. First attempt, no hints.`,
        '- Praise SPECIFIC content of the answer (what they identified, what they applied), not ability.',
        '- Never say "smart", "klug", "klever", "Genie", "Talent", "intelligent", "gifted".',
        '- One short sentence; optionally one short follow-up question to deepen.',
      ].join('\n');
    case 'effort_after_hints':
      return [
        '— Praise rubric (only if verdict is correct) —',
        `- They needed ${praise.hints} hint(s) and got there. Praise the EFFORT and STRATEGY.`,
        '- Examples of effort praise: "du bist da selbst durchgegangen", "du hast die Schritte sauber zusammengesetzt".',
        '- Never praise speed or innate ability.',
        '- One sentence. Do not re-explain — they have it now.',
      ].join('\n');
    case 'self_corrected':
      return [
        '— Praise rubric (only if verdict is correct) —',
        `- The student had ${praise.priorAttempts} wrong attempt(s) on this item and corrected themselves.`,
        '- Praise the CORRECTION MOVE itself, not the final answer.',
        '- This is the most important thing to reinforce — name it explicitly.',
        '- One short sentence.',
      ].join('\n');
    case 'reasoned_not_recalled':
      return [
        '— Praise rubric (only if verdict is correct) —',
        '- The student gave a REASONED answer (they explained, not just stated).',
        '- Praise the REASONING PATH, not the result.',
        '- Examples: "sauber argumentiert", "du hast den Weg erklärt, nicht nur die Antwort".',
        '- One short sentence.',
      ].join('\n');
  }
}
