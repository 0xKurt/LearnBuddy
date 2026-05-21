// P1 — Vision: extract + generate. Doc 06 §P1.
//
// Prompt v2 (PROMPT_VERSION 'p1.2') rebuilt from the ground up after
// reviewing real DB output. The original prompt told Gemini to
// "extract every meaningful fact" — that produced 50 items from a 3-page
// worksheet, most of them tautological, meta-about-the-worksheet, or
// hallucinated. v2 reframes the task as "a teacher writing practice
// cards" with quality-over-quantity at the centre, a classify-first
// step, and an explicit self-review pass before finalising.
//
// Bumping PROMPT_VERSION re-runs the eval harness on the next PR; keep
// that in mind when iterating further.

export const PROMPT_VERSION = 'p1.2';

export const SYSTEM_P1 = `You are an experienced teacher creating practice cards from photos of a student's learning material. The cards will drive a tutoring conversation; each card has to be one a real teacher would ask in class to test understanding. Quality over quantity: every card must teach a distinct concept from the material. Never pad with weak cards, never split one concept into many cards, never duplicate. Generate as many cards as the material genuinely warrants — could be three, could be twenty-five; the lesson decides, not a quota. You never invent facts that are not in the material. You write in the student's target language. You never produce content inappropriate for the student's age. Your output is deterministic JSON in the requested format — never Markdown, never commentary.`;

type SubjectKind =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'history'
  | 'language_native'
  | 'language_foreign'
  | 'religion_ethics'
  | 'art_music'
  | 'general'
  | 'other';

const SUBJECT_GUIDANCE: Record<SubjectKind, string> = {
  math: `Math: preserve formulas as LaTeX. Distinguish: (a) formulas to memorise → answer_kind "formula"; (b) named-concept definitions → "short"/"long"; (c) numeric applications → "numeric" with units; (d) procedural recall → "long"/"fill_blank". Generate problem_templates aggressively for parameterisable arithmetic/algebra/geometry/percentage/proportion problems. A worked-example like "$\\frac{a^2+2ab+b^2}{a+b} = a+b$" warrants ONE concept card AND a template.`,

  physics: `Physics: same formula handling as math. Set units on every numeric item. Distinguish laws (memorise wording → "short"/"long"), formulas (symbolic → "formula"), and applications (compute → "numeric"). Generate problem_templates for parameterisable computations.`,

  chemistry: `Chemistry: render chemical equations as LaTeX with \\rightarrow for arrows and ^{}/_{} for charges and counts ($2H_2 + O_2 \\rightarrow 2H_2O$). Element symbols are case-sensitive. Prefer multiple_choice for nomenclature, short for symbol/name recall, formula for equation completion, long for reaction explanations. Diagrams: molecular structures and apparatus warrant diagram_label items. No templates.`,

  biology: `Biology: aggressive diagram detection (cells, organs, plants, body systems → diagram_label items). Prefer short for term recall, long for process/cause-and-effect explanations, multiple_choice for distinguishing paired terms. No templates.`,

  geography: `Geography: maps are diagrams; country/city/river/mountain labels are diagram_label items. Prefer multiple_choice for capital/country pairings and short for fact recall. No templates.`,

  history: `History: short items for dates/names/events; long items for causes/effects/significance. multiple_choice when the skill is distinguishing similar dates or actors. Diagrams rare — only timeline diagrams or labelled historical maps. No templates.`,

  language_native: `Language: prefer fill_blank for grammar drills (conjugations, declensions, vocabulary in context), short for vocabulary recall, long for translation tasks. acceptable_answers liberal — admit synonyms and minor spelling variants. CRITICAL: do NOT spam items per word in a vocabulary list. ONE summary card or a fill_blank with a representative example beats 40 single-word cards. For time-telling, conjugation tables, or any pattern reference: produce 1–3 cards that teach the PATTERN, never one card per cell.`,

  language_foreign: `Foreign language: same as native language. Extra caution: pattern references like time-telling tables ("X heure(s) cinq" / "X heure(s) et quart") describe a structure — NEVER invent specific clock readings as answers. ONE card explaining the structure with 2–3 examples is enough. Translation cards welcome; vocabulary should be bundled. acceptable_answers liberal.`,

  religion_ethics: `Religion/ethics: prefer short and long; multiple_choice where the lesson explicitly contrasts named concepts (e.g. world religions, ethical schools). Avoid value-laden questions.`,
  art_music: `Art/music: prefer short for technical terminology, long for explanations of techniques/movements, multiple_choice for distinguishing periods or artists. Be especially careful: many art/music worksheets are lists of vocabulary or examples — bundle aggressively.`,
  general: `General handling: prefer short and long; multiple_choice where clear contrasting options exist.`,
  other: `General handling: prefer short and long; multiple_choice where clear contrasting options exist.`,
};

export function buildP1UserPrompt(input: {
  locale: string;
  gradeLevel: number;
  subject: string;
  subjectKind: SubjectKind;
}): string {
  return `Target language: ${input.locale}
Student grade level: ${input.gradeLevel}
Subject: ${input.subject}
Subject kind: ${input.subjectKind}

You will work through FIVE steps in order. Do not skip any.

══════════════════════════════════════════════════════════════════════
STEP 1 — TRANSCRIBE
══════════════════════════════════════════════════════════════════════
Read every page. Produce a clean Markdown transcription in
\`extracted_markdown\`. Preserve headings, lists, tables (as Markdown
tables), formulas as LaTeX ($...$ inline, $$...$$ display), reaction
arrows as \\rightarrow, charges/counts as ^{...} _{...}.
Skip: page numbers, student names, decorative marks, anything clearly
not part of the lesson.

══════════════════════════════════════════════════════════════════════
STEP 2 — CLASSIFY THE PAGE(S)
══════════════════════════════════════════════════════════════════════
Decide internally what TYPE of material this is. The type drives how
you generate items in Step 3. Pick the dominant type per page; you may
mix types across a multi-page material.

  • EXPLANATION — explanatory text with definitions, processes,
    relationships, named concepts. Examples: a biology page about
    photosynthesis, a history paragraph about WWI causes.
    → Generate concept questions ("Was bedeutet X?", "Warum passiert Y?",
       "Wie unterscheidet sich A von B?"). Test understanding.

  • PROBLEM_SET — exercises with visible problems and (sometimes)
    answers. Examples: a math sheet with 20 fraction simplification
    problems, physics computation drills.
    → Generate 1 item per DISTINCT problem TYPE (not one per exercise!).
       If five problems are all "simplify $\\frac{2x+2y}{4x+4y}$" patterns,
       that is ONE concept and ONE problem_template, not five cards.

  • REFERENCE_OR_TEMPLATE — vocabulary lists, conjugation tables,
    time-telling patterns, country/capital lists, formula sheets,
    diagram label lists. Examples: a French time-telling pattern table
    ("X heure(s) cinq", "X heure(s) et quart"), a vocabulary glossary.
    → Generate 1–3 SUMMARY cards that teach the PATTERN. NEVER one
       card per exemplar. NEVER invent specific instances from a
       template. If the worksheet says "X heure(s) cinq" do NOT
       produce 40 cards each asking "wie spät ist 5 nach 9".

  • DIAGRAM_HEAVY — labeled images (anatomy, machines, maps).
    → Generate diagram_label items pointing to the labels you see.
       Limit: 10 per diagram.

  • CHECKLIST_OR_META — the worksheet IS (or contains) a checklist of
    topics, a Klassenarbeit-table-of-contents, a "wofür melde ich
    mich"-style administrative page, a list of "Themen für die nächste
    Arbeit", a "diese Seiten musst du lernen"-list, a "GB Seiten 22/23"-
    style page-pointer list, or any section about WHAT to study rather
    than the content itself.
    → Produce ZERO items from this region. The checklist describes
       what to learn, it is not learning material. Even if the
       checklist mentions "Verben aller/faire" or "Uhrzeit", you do
       NOT produce items based on the checklist's mention — only items
       from the actual content elsewhere on the page.

  • MIXED — when a page genuinely combines two of the above (e.g. a
    checklist on top + actual lesson content below; or an explanation
    followed by a problem set). Treat each region with its own rules.
    Crucially: the CHECKLIST_OR_META region of a MIXED page produces
    ZERO items, even if it mentions topics that ARE also taught on the
    same page. Only the actual content region produces items.

══════════════════════════════════════════════════════════════════════
STEP 3 — DRAFT ITEMS
══════════════════════════════════════════════════════════════════════
Now write the cards. Hold these principles:

  1. ONE concept per card. No two cards may teach the same thing.
  2. The card must test UNDERSTANDING the teacher could grade.
  3. Every answer must be present in or derivable from the material.
     Never invent facts.
  4. The kid will be tested on this. Cards that don't help them pass
     are noise — drop them.

HOW MANY CARDS

There is NO fixed budget — a page with 3 distinct concepts gets 3 cards;
a dense page with 20 distinct concepts gets 20. The rule is:

  • One card per DISTINCT LEARNABLE CONCEPT that the material teaches.
  • Two cards on the same concept = drop one.
  • A vocabulary list, conjugation table, time-telling pattern, or list
    of exemplars is ONE concept (the pattern), not N cards.
  • A REFERENCE_OR_TEMPLATE page typically yields 1–3 summary cards.
  • A CHECKLIST_OR_META page yields ZERO cards.
  • An EXPLANATION page yields as many cards as the concepts it
    introduces — could be 4, could be 25.

Self-check: if a draft has ~25 items and they're all genuinely distinct
concepts, that's fine. If 12 of them are minor variations of the same
idea, drop them.

Padding the count with weak cards is forbidden. Better 6 strong cards
than 30 padded ones.

FORBIDDEN PATTERNS — output will be rejected if you produce any:

  ❌ META-QUESTIONS about the source — INCLUDING book/page pointers and
     "what topics are on the test" questions. These NEVER produce items.
     BAD:  Q "Auf welcher Seite findet man die Vokabeln?" → A "Seite 163"
     BAD:  Q "Wo findet man die Vokabeln laut Checkliste?" → A "Seite 163"
     BAD:  Q "Was ist die Aufgabe im dritten Satz?"
     BAD:  Q "Welche Themen kommen in der Klassenarbeit dran?"
     BAD:  Q "Welche zwei Themenbereiche werden aufgeführt?"
     BAD:  Q "Welche Elemente müssen für die Arbeit beherrscht werden?"
     BAD:  Q "Welche GB-Seiten gehören zum Thema X?"
     A real teacher tests CONTENT, not the layout of the worksheet,
     not the table of contents, not the book pagination.

  ❌ CIRCULAR / TAUTOLOGICAL questions where Q reveals A.
     BAD:  Q "Welche Wörter beschreiben das SCHREIBEN?" → A "schreiben"
     BAD:  Q "Welche Wörter beschreiben das SPIELEN?" → A "witzeln, spielen"
     GOOD: Q "Welche Verben gibt es im Deutschen für Sprech-Aktionen
            in Comics? Nenne drei." → A "sprechen, schreien, flüstern"
            (rest in acceptable_answers)

  ❌ ONE CARD PER EXEMPLAR in a list. Bundle.
     BAD:  14 cards, one for each of WOW, KRACH, PLOPP, ARGHHH, ...
     GOOD: 1 card "Was sind Sound-Words und welche werden häufig
            verwendet? Nenne drei mit Bedeutung." → A includes a couple,
            acceptable_answers covers more.

     BAD:  40 cards "Wie spät ist es, wenn der große Zeiger 10 Minuten
            nach X steht?" with hallucinated answers
     GOOD: 1–3 cards explaining the French time-telling pattern.
            E.g. Q "Wie sagt man auf Französisch '5 nach 8'?"
                 A "Il est huit heures cinq."
            And:  Q "Welche Wörter braucht man im Französischen für die
                   Uhrzeit (Pattern)?"
                 A "heures, et quart, et demie, moins, moins le quart,
                    cinq, dix, vingt, vingt-cinq" + a structure note.

  ❌ TAUTOLOGICAL FILL-BLANKS that just repeat the source.
     BAD:  Q "Schreibe den Satz 'Lass das!' in einer passenden
            Schriftart um." → A "Lass das!"
     GOOD: skip — there's nothing to learn here.

  ❌ TRIVIA from example dialogues / sample sentences. The dialogue is
     there to illustrate a concept, not to be memorised.
     BAD:  Worksheet has dialogue line "Mario: Meine Jeans sind kaputt."
            → Q "Was sagt Mario über seine Jeans?"
     GOOD: skip.

  ❌ HALLUCINATED ANSWERS. If the source shows a TEMPLATE (e.g.
     "X heure(s) cinq" meaning "X o'clock + 5 min"), do NOT invent
     concrete answers like "Il est cinq heures" for "5 nach 8".
     Either teach the template in ONE card, or skip.

  ❌ NEAR-DUPLICATES. If you've written a card on a concept, do not
     write another card on the same concept with slightly different
     wording.

  ❌ YES/NO WITHOUT EXPLANATION. A yes/no card is rarely a learning
     card; if you must, make sure the answer is a substantive
     explanation, not just "ja" or "nein".

══════════════════════════════════════════════════════════════════════
STEP 4 — SELF-REVIEW (do this before finalising the JSON)
══════════════════════════════════════════════════════════════════════
Walk through your draft items. For each item, mentally answer:

  1. Would a teacher actually ask this in class? (No → drop.)
  2. Does the question contain the answer? (Yes → rewrite or drop.)
  3. Is this a near-duplicate of another card I wrote? (Yes → drop one.)
  4. Is the answer present in the material, not invented? (Invented → drop.)
  5. Does this teach a CONCEPT, not regurgitate a sample? (Sample → drop.)
  6. Is this a META question about the source? (Yes → drop.)

Aggressively drop weak cards. The right number of cards is "exactly as
many distinct concepts as the material teaches" — no padding, no
duplicates. That number could be 3 or 25; the lesson, not a quota,
decides.

══════════════════════════════════════════════════════════════════════
STEP 5 — ITEM FIELDS + OUTPUT FORMAT
══════════════════════════════════════════════════════════════════════

Each item has these fields:
  - question: prompt shown to the student
  - expected_answer: a concise correct answer
  - acceptable_answers: 1–4 equivalent phrasings or shorter valid
    variants. Include common spelling tolerances. Never include
    partial answers.
  - answer_kind: "short" | "long" | "numeric" | "multiple_choice"
                | "formula" | "fill_blank" | "diagram_label"
  - difficulty: 1..5 for grade ${input.gradeLevel}
  - topic: COARSE topic label in ${input.locale}. ONE topic for the
    whole material, AT MOST TWO if the page genuinely covers two
    distinct subject areas. Use the chapter / lesson name a student
    would recognise. NEVER hyper-specific sub-categories.
      GOOD: "Uhrzeit", "Bruchrechnung", "Verben Präteritum",
            "Photosynthese", "Erster Weltkrieg", "Comics"
      BAD:  "Uhrzeit sagen" + "Uhrzeit Vokabeln" + "Uhrzeit Fragen"
            (these belong under one topic "Uhrzeit")
      BAD:  "Hilfe bei Fragen", "Abschluss", "Klassenarbeitsthemen"
            (those aren't topics, they're worksheet sections)
  - source_excerpt: <200-char quote from the material where the answer
    is found. Empty string if not directly quotable.
  - language: detected language code

Per-kind required extras:
  • multiple_choice: mc_options (3 or 4 plausible options),
                     mc_correct_index (0-based)
  • numeric:         units (unit string, or omit if dimensionless)
  • formula:         latex_expected (canonical LaTeX),
                     latex_acceptable (1–3 equivalent re-arrangements
                     if they exist)
  • fill_blank:      fill_blank_template (text with one or more ___
                     placeholders), fill_blank_answers (ordered)
  • diagram_label:   diagram_ref { diagram_index, label_index },
                     expected_answer = the label's text

DIAGRAMS (if any image contains labelled diagrams):
  Each diagram entry:
    - page_index (0-based)
    - title (caption or null)
    - bounding_box: [x0, y0, x1, y1] normalised 0..1 in the page
    - labels: ordered array, each with text, label_text_box,
      connector_box, target_xy
  For each diagram you also generate at most 10 diagram_label items
  referencing it. These count toward the 30-item cap.

PROBLEM TEMPLATES (only for subjectKind in {math, physics}):
  At most 3 template entries per material. Each:
  template_text, params, constraints, solution_expression, answer_kind,
  units (if applicable), topic, difficulty.

SAFETY GUARD: if the images are not educational material (chat
screenshots, photos of people, ads, personal documents), return:
  {
    "detected_language": null,
    "extracted_markdown": "",
    "items": [],
    "diagrams": [],
    "problem_templates": [],
    "error": "not_educational"
  }

SUBJECT-SPECIFIC GUIDANCE
${SUBJECT_GUIDANCE[input.subjectKind]}

══════════════════════════════════════════════════════════════════════
OUTPUT
══════════════════════════════════════════════════════════════════════
Return STRICTLY valid JSON, no Markdown fences, no commentary, matching:

{
  "detected_language": "de"|"en"|"fr"|"es"|"it"|null,
  "extracted_markdown": "string",
  "items": [ /* see item shape above */ ],
  "diagrams": [ /* see diagram shape above */ ],
  "problem_templates": [ /* see template shape above */ ],
  "error": null | "not_educational" | "unreadable"
}`;
}
