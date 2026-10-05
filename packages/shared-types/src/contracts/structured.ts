// Structured items: questions whose answer is a SHAPE, not a sentence (issues #228–#232).
// docs/architecture.md §Practice ("Structured items").
//
// Four kinds share one foundation:
//   order       — put 3–8 elements into the right order (#228)
//   match       — pair or group elements (#229)
//   table_fill  — fill the gaps of a table (#230)
//   cloze       — fill several gaps in one text (#232); its kind is allowed since migration 0079
//   select_all  — tick every right answer among several options (#240, migration 0085)
//   mark        — tap words, comma gaps or syllable breaks in a text (#234, migration 0087)
//   find_error  — tap the wrong line of a worked solution and write it right (#260)
//   column_calc — written arithmetic in columns, digit by digit, with its carries (#260)
//
// Three shapes per kind, and the difference between them is the whole design:
//
//   * `StructuredTask`     — the stored definition INCLUDING the key (`items.task`, migration
//                            0079). It never leaves the server.
//   * `StructuredTaskView` — what the app shows (`ItemView.task_view`): the same task WITHOUT
//                            the key. For `order` that is the elements in a shuffled order
//                            with ids that say nothing about the right one.
//   * `StructuredAnswer`   — what she sends (`AnswerRequest.parts`): the parts she arranged,
//                            by id. Code compares them with the key exactly
//                            (`apps/api/src/modules/practice/structured.ts`) — a verdict here
//                            is never a model's (#224, "Regel 0").
//
// The ids are the server's, never the model's (CLAUDE.md rule 2): the model writes the
// elements, code names them.
//
// Adding a kind: add its task, view and answer object below, append each to the matching
// union, and give it a checker in `practice/structured.ts`. The unions are discriminated by
// `type`, which is always the item's kind.

import { z } from 'zod';

/** The item kinds whose answer is structured. Each has a task, a view and an answer shape. */
export const STRUCTURED_KINDS = [
  'order',
  'match',
  'table_fill',
  'cloze',
  'select_all',
  'mark',
  'find_error',
  'column_calc',
] as const;
export const StructuredKind = z.enum(STRUCTURED_KINDS);
export type StructuredKind = z.infer<typeof StructuredKind>;

/** Is this item kind answered with `parts` instead of text? */
export function isStructuredKind(kind: string): kind is StructuredKind {
  return (STRUCTURED_KINDS as readonly string[]).includes(kind);
}

/**
 * A part's id: short, lower-case, given by the server. It names a part of the task (an
 * element, a cell, a gap), never its place in the solution.
 */
export const PartId = z.string().regex(/^[a-z0-9_]{1,12}$/);
export type PartId = z.infer<typeof PartId>;

// ─────────────── order (#228) ───────────────

/** Fewer than three is no order to find; more than eight no longer fits a phone (rule 16). */
export const ORDER_MIN = 3;
export const ORDER_MAX = 8;
/** One element is a step, an event or a number — a line, never a paragraph. */
export const ORDER_ELEMENT_MAX = 120;

export const OrderElement = z.object({
  id: PartId,
  /** Plain text, math between dollar signs ($\frac{1}{2}$) like everywhere else. */
  text: z.string().trim().min(1).max(ORDER_ELEMENT_MAX),
});
export type OrderElement = z.infer<typeof OrderElement>;

/**
 * Which way a sequence of numbers runs. Stated, never guessed: when every element is a
 * number, code checks that the key IS the numerically sorted order (#228, Regel 0).
 */
export const OrderNumeric = z.enum(['ascending', 'descending']);
export type OrderNumeric = z.infer<typeof OrderNumeric>;

export const OrderTask = z.object({
  type: z.literal('order'),
  /** In the order she sees them: shuffled once by the server and stored that way. */
  elements: z.array(OrderElement).min(ORDER_MIN).max(ORDER_MAX),
  /** The element ids in the right order: a permutation of `elements`. */
  key: z.array(PartId).min(ORDER_MIN).max(ORDER_MAX),
  /** Set for a sequence of numbers: the direction the key must be sorted in. */
  numeric: OrderNumeric.nullable(),
});
export type OrderTask = z.infer<typeof OrderTask>;

export const OrderTaskView = z.object({
  type: z.literal('order'),
  /** The elements in the order she first sees them. Never the key, never the direction. */
  elements: z.array(OrderElement).min(ORDER_MIN).max(ORDER_MAX),
});
export type OrderTaskView = z.infer<typeof OrderTaskView>;

export const OrderAnswer = z.object({
  type: z.literal('order'),
  /** Every element id once, in the order she put them. */
  order: z.array(PartId).min(ORDER_MIN).max(ORDER_MAX),
});
export type OrderAnswer = z.infer<typeof OrderAnswer>;

// ─────────────── table_fill (#230) ───────────────

/** As big as a shown table (`TableFigure`): six columns fit a 360-pt phone, ten rows a card. */
export const TABLE_COLS_MAX = 6;
export const TABLE_ROWS_MAX = 10;
/** One cell is a number, a word form or a short term — never a sentence. */
export const TABLE_CELL_MAX = 40;
/** Other spellings a teacher accepts for one gap. */
export const TABLE_ALSO_MAX = 4;
/** What she may type into one gap: more than a key, less than a paragraph. */
export const TABLE_ANSWER_MAX = 60;
/** A number wall (Zahlenmauer): three to six rows of bricks, the widest at the bottom. */
export const WALL_ROWS_MIN = 3;
export const WALL_ROWS_MAX = 6;

/**
 * How a gap is typed in: `math` (a number or a term — the math keys come up) or `text` (a
 * word — the keyboard). Set by code from the key, never by the model.
 */
export const TableInput = z.enum(['math', 'text']);
export type TableInput = z.infer<typeof TableInput>;

/**
 * What code recomputes before a table is stored (#230, Regel 0). Declared by the model, so a
 * table it calls a value table IS checked as one; null means only the structure is checked.
 *   values — every value is the function `fn` at its x (`x_in` says where the x stand);
 *   wall   — a number wall: every brick is the sum of the two under it;
 *   totals — the last column and the last row are the sums of their row and column.
 */
export const TableFamily = z.enum(['values', 'wall', 'totals']);
export type TableFamily = z.infer<typeof TableFamily>;

/** Where a value table's x stand: in the header (one row of values) or in the first column. */
export const TableXIn = z.enum(['header', 'first_column']);
export type TableXIn = z.infer<typeof TableXIn>;

/** A cell she reads. May be empty (the corner of a two-way table). */
export const TableShownCell = z.object({ text: z.string().trim().max(TABLE_CELL_MAX) });
export type TableShownCell = z.infer<typeof TableShownCell>;

/** A gap: its server-given id, its key and the other accepted spellings. Server only. */
export const TableGapCell = z.object({
  id: PartId,
  key: z.string().trim().min(1).max(TABLE_CELL_MAX),
  also: z.array(z.string().trim().min(1).max(TABLE_CELL_MAX)).max(TABLE_ALSO_MAX),
  input: TableInput,
});
export type TableGapCell = z.infer<typeof TableGapCell>;

/** The gap first: a shown cell never has an id, so the union tells them apart. */
export const TableTaskCell = z.union([TableGapCell, TableShownCell]);
export type TableTaskCell = z.infer<typeof TableTaskCell>;

export const TableFillTask = z.object({
  type: z.literal('table_fill'),
  /** Column headings; null only for a number wall, whose bricks have none. */
  header: z.array(z.string().trim().max(TABLE_CELL_MAX)).min(1).max(TABLE_COLS_MAX).nullable(),
  /** Top to bottom. A grid row has one cell per heading; a wall's row r has r + 1 bricks. */
  rows: z.array(z.array(TableTaskCell).min(1).max(TABLE_COLS_MAX)).min(1).max(TABLE_ROWS_MAX),
  family: TableFamily.nullable(),
  /** The function of a value table, plain (2x+1, x^2-3); null for every other table. */
  fn: z.string().trim().min(1).max(120).nullable(),
  x_in: TableXIn.nullable(),
});
export type TableFillTask = z.infer<typeof TableFillTask>;

/** A gap as the app shows it: where it is and how it is typed in — never its key. */
export const TableViewGap = z.object({
  id: PartId,
  input: TableInput,
  /**
   * Every form of the gap's key is a whole number (code decides it from the key and its other
   * spellings; one fact about the key and no more — not its size, not its sign). The phone's
   * digits then write it, and the app shows only the minus over the table (#286 finding 5, #239).
   */
  whole: z.boolean().default(false),
});
export type TableViewGap = z.infer<typeof TableViewGap>;

export const TableViewCell = z.union([TableViewGap, TableShownCell]);
export type TableViewCell = z.infer<typeof TableViewCell>;

export const TableFillTaskView = z.object({
  type: z.literal('table_fill'),
  header: z.array(z.string().max(TABLE_CELL_MAX)).min(1).max(TABLE_COLS_MAX).nullable(),
  rows: z.array(z.array(TableViewCell).min(1).max(TABLE_COLS_MAX)).min(1).max(TABLE_ROWS_MAX),
  /** `wall`: the rows stand centred, brick on brick; `grid`: an ordinary table. */
  layout: z.enum(['grid', 'wall']),
});
export type TableFillTaskView = z.infer<typeof TableFillTaskView>;

export const TableFillAnswer = z.object({
  type: z.literal('table_fill'),
  /** Every gap once, with what she typed into it. */
  cells: z
    .array(z.object({ id: PartId, text: z.string().max(TABLE_ANSWER_MAX) }))
    .min(1)
    .max(TABLE_COLS_MAX * TABLE_ROWS_MAX),
});
export type TableFillAnswer = z.infer<typeof TableFillAnswer>;

// ─────────────── cloze (#232) ───────────────

/** Fewer than two gaps is a short answer; more than eight no longer reads as one text. */
export const CLOZE_MIN_GAPS = 2;
export const CLOZE_MAX_GAPS = 8;
/**
 * The visible text without its gaps, and the instruction above it: what fits a 360×740
 * phone without scrolling (CLAUDE.md rule 16), measured with the longest case — 8 gaps,
 * filled, under an instruction of three lines. At 360×740 the text has 418 pt; 8 gaps
 * there took 380 pt at 256–262 characters, 407 pt at 279–301 and 434 pt (too tall) at 350.
 * 260 keeps one line of air for long typed words; the walkthrough shows that case
 * (`tests/web/modes.spec.ts`, shot 44-cloze-eight).
 */
export const CLOZE_TEXT_MAX = 260;
export const CLOZE_PROMPT_MAX = 80;
/** One gap holds a word or a short group of words — a small field in the line. */
export const CLOZE_GAP_MAX = 40;
/** What she may put into one gap before it is no longer an answer to a gap. */
export const CLOZE_ANSWER_MAX = 80;
/** Other spellings a teacher would accept for one gap. */
export const CLOZE_ACCEPTED_MAX = 4;
/** The word bank: every key once, plus a few distractors. */
export const CLOZE_BANK_MAX = 12;

export const ClozeGap = z.object({
  id: PartId,
  /** What belongs in the gap. Never in the visible text (Regel 0, `practice/structured.ts`). */
  key: z.string().trim().min(1).max(CLOZE_GAP_MAX),
  /** Other answers that count as right for THIS gap. */
  accepted: z.array(z.string().trim().min(1).max(CLOZE_GAP_MAX)).max(CLOZE_ACCEPTED_MAX),
});
export type ClozeGap = z.infer<typeof ClozeGap>;

/**
 * The text around the gaps: `segments[i]` stands before gap i, the last one after the last
 * gap — so there is always one segment more than there are gaps. Plain text, math between
 * dollar signs.
 */
const ClozeSegments = z
  .array(z.string().max(CLOZE_TEXT_MAX))
  .min(CLOZE_MIN_GAPS + 1)
  .max(CLOZE_MAX_GAPS + 1);

export const ClozeTask = z.object({
  type: z.literal('cloze'),
  segments: ClozeSegments,
  gaps: z.array(ClozeGap).min(CLOZE_MIN_GAPS).max(CLOZE_MAX_GAPS),
  /**
   * The words to tap, in the order she sees them (shuffled once by the server), or null:
   * then she types every gap. Holds every key exactly once.
   */
  bank: z.array(z.string().trim().min(1).max(CLOZE_GAP_MAX)).max(CLOZE_BANK_MAX).nullable(),
});
export type ClozeTask = z.infer<typeof ClozeTask>;

export const ClozeTaskView = z.object({
  type: z.literal('cloze'),
  segments: ClozeSegments,
  /** The gaps' ids in reading order. Nothing about what belongs in them. */
  gaps: z.array(PartId).min(CLOZE_MIN_GAPS).max(CLOZE_MAX_GAPS),
  /** The words to tap, or null when she types. Which word is a key is not said. */
  bank: z.array(z.string()).max(CLOZE_BANK_MAX).nullable(),
});
export type ClozeTaskView = z.infer<typeof ClozeTaskView>;

export const ClozeAnswer = z.object({
  type: z.literal('cloze'),
  /** Every gap once, with what she put in it (typed, or a word of the bank). */
  gaps: z
    .array(z.object({ id: PartId, text: z.string().trim().min(1).max(CLOZE_ANSWER_MAX) }))
    .min(CLOZE_MIN_GAPS)
    .max(CLOZE_MAX_GAPS),
});
export type ClozeAnswer = z.infer<typeof ClozeAnswer>;

// ─────────────── match (#229) ───────────────
//
// Two forms, one shape: she takes an element on the LEFT and puts it to one on the RIGHT.
//   pairs  — left 3–MATCH_PAIRS_MAX, right as many: every left has exactly one right, every
//            right one left.
//   groups — left MATCH_GROUPED_MIN–MATCH_GROUPED_MAX elements, right 2–MATCH_GROUPS_MAX groups:
//            every element belongs to exactly one group, every group gets at least one element.
//
// The maxima are not a guess at what a task needs but what a 360×740 phone holds without the
// parts scrolling (CLAUDE.md rule 16) — measured in the walkthrough with every text at its cap
// (tests/web/modes.spec.ts, "zuordnen at its largest"): the largest grouping before she has
// sorted anything, and the largest pairing after a check, with Buddy's reply above it. A task
// over them is rejected when it is written, never shrunk (`matchDraftProblem`).

export const MATCH_PAIRS_MIN = 3;
export const MATCH_PAIRS_MAX = 4;
export const MATCH_GROUPS_MIN = 2;
export const MATCH_GROUPS_MAX = 3;
export const MATCH_GROUPED_MIN = 4;
export const MATCH_GROUPED_MAX = 8;
/** A pair's side: a word or a short line (it wraps in its column, at word boundaries). */
export const MATCH_ELEMENT_MAX = 32;
/** A thing to sort or a group's name: two of them must share a row of a 360-pt phone. */
export const MATCH_GROUP_TEXT_MAX = 16;
/** The longest single word anywhere in a match: a word cannot wrap, so it must fit a column. */
export const MATCH_WORD_MAX = 16;
/** The instruction of a match: the question card above the parts may take at most two lines. */
export const MATCH_PROMPT_MAX = 44;

export const MatchForm = z.enum(['pairs', 'groups']);
export type MatchForm = z.infer<typeof MatchForm>;

export const MatchElement = z.object({
  id: PartId,
  /** Plain text, math between dollar signs like everywhere else. */
  text: z.string().trim().min(1).max(MATCH_ELEMENT_MAX),
});
export type MatchElement = z.infer<typeof MatchElement>;

/** One link: a left element and the right one (pair partner or group) it belongs to. */
export const MatchLink = z.object({ left: PartId, right: PartId });
export type MatchLink = z.infer<typeof MatchLink>;

export const MatchTask = z.object({
  type: z.literal('match'),
  form: MatchForm,
  /** What she takes first, in the order she sees it (shuffled once by the server). */
  left: z.array(MatchElement).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
  /** Where it goes: the pair partners (shuffled) or the groups (in the model's order). */
  right: z.array(MatchElement).min(MATCH_GROUPS_MIN).max(MATCH_PAIRS_MAX),
  /** One link per left element. */
  key: z.array(MatchLink).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
});
export type MatchTask = z.infer<typeof MatchTask>;

export const MatchTaskView = z.object({
  type: z.literal('match'),
  form: MatchForm,
  left: z.array(MatchElement).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
  right: z.array(MatchElement).min(MATCH_GROUPS_MIN).max(MATCH_PAIRS_MAX),
});
export type MatchTaskView = z.infer<typeof MatchTaskView>;

export const MatchAnswer = z.object({
  type: z.literal('match'),
  /** Every left element once, each with the right one she put it to. */
  links: z.array(MatchLink).min(MATCH_PAIRS_MIN).max(MATCH_GROUPED_MAX),
});
export type MatchAnswer = z.infer<typeof MatchAnswer>;

// ─────────────── select_all (#240) ───────────────
//
// Multiple choice with SEVERAL right answers ("Kreuze alle richtigen an"): the cycling test of
// year 4, Latin forms ("which cases are possible?"), true statements in any subject. The model
// writes the options and marks the right ones; code checks the set (at least two right and one
// wrong — one right is ordinary multiple choice, all right is no question), shuffles the
// options, names them and keeps the key. Her answer is the set she ticked, compared exactly.

// The maxima are what a 360×740 phone holds with the question above, the one line "Mehrere sind
// richtig" and Buddy's reply after a check (CLAUDE.md rule 16; shot in tests/web/modes.spec.ts,
// "mehrere richtige"). Short options stand two by two by the app's grid arithmetic (issue #203,
// `apps/mobile/components/practice/ChoiceList.tsx`, GRID_CHARS_MAX), so six fit in three rows; one
// longer option sends all of them full width, one per row, and then four is the most that fits.
// A draft over them is rejected when it is written, never shrunk.

/** Two right and one wrong at the least. */
export const SELECT_MIN = 3;
/** Six short options (three rows of two). */
export const SELECT_MAX = 6;
/** Four when any option is longer and they stand one under the other. */
export const SELECT_LONG_MAX = 4;
export const SELECT_RIGHT_MIN = 2;
/** One option is a word, a form or a short statement: one or two lines of a full-width tile. */
export const SELECT_OPTION_MAX = 28;
/**
 * A short option: ONE line of half a 360-pt phone — the app's `GRID_CHARS_MAX` (a unit test there
 * holds the two together). An option that is only math is set larger, so it has fewer.
 */
export const SELECT_SHORT_CHARS = 9;
export const SELECT_SHORT_MATH_CHARS = 7;
/** The question above the options: two lines of the question card at most. */
export const SELECT_PROMPT_MAX = 60;

export const SelectOption = z.object({
  id: PartId,
  /** Plain text, math between dollar signs like everywhere else. */
  text: z.string().trim().min(1).max(SELECT_OPTION_MAX),
});
export type SelectOption = z.infer<typeof SelectOption>;

export const SelectAllTask = z.object({
  type: z.literal('select_all'),
  /** In the order she sees them: shuffled once by the server and stored that way. */
  options: z.array(SelectOption).min(SELECT_MIN).max(SELECT_MAX),
  /** The ids of the right options, in display order: at least two, never all. */
  key: z
    .array(PartId)
    .min(SELECT_RIGHT_MIN)
    .max(SELECT_MAX - 1),
});
export type SelectAllTask = z.infer<typeof SelectAllTask>;

export const SelectAllTaskView = z.object({
  type: z.literal('select_all'),
  /** The options in display order. Never the key, never how many are right. */
  options: z.array(SelectOption).min(SELECT_MIN).max(SELECT_MAX),
});
export type SelectAllTaskView = z.infer<typeof SelectAllTaskView>;

export const SelectAllAnswer = z.object({
  type: z.literal('select_all'),
  /** The options she ticked, each once; at least one (an empty tick is no answer). */
  chosen: z.array(PartId).min(1).max(SELECT_MAX),
});
export type SelectAllAnswer = z.infer<typeof SelectAllAnswer>;

// ─────────────── mark (#234) ───────────────
//
// A sentence or a short text she marks by tapping. Three modes, one shape:
//   words     — she taps words (the nouns of an all-lower-case text, parts of speech, the wrong
//               words of an error text, signal words — or, with 2–3 categories she picks first,
//               Subjekt / Prädikat / Objekt);
//   gaps      — she taps the word after which a comma belongs: the gap behind it gets the comma;
//   syllables — she taps the letter after which a syllable ends.
//
// Code splits the text into words (`apps/api/src/modules/practice/mark.ts`), never the model: the
// model names the words, code finds where they stand, and a word that stands there twice needs
// its occurrence or the task is not stored (#234, Regel 0). The ids say WHERE a target stands
// (`w3` the third word, `g3` the gap after it, `w3_2` the cut after its second letter) — never
// whether it is one of the key's.
//
// The maxima are what a 360×740 phone holds with every target at 44 pt and nothing scrolling
// (CLAUDE.md rule 16), shot in tests/web/mark.spec.ts.

/** Words of one marking text (words and gaps): a sentence or two, never a page. */
export const MARK_WORDS_MIN = 3;
export const MARK_WORDS_MAX = 24;
/** One word as it stands in the text; a longer one would not fit a line as one target. */
export const MARK_WORD_MAX = 20;
/**
 * Syllables: a few words, one per row and NEVER wrapped — a word broken over two rows no longer
 * reads as a word (owner review of #234). Ten letters in 30-pt cells is the widest row a 360-pt
 * phone holds (`MarkAnswer.tsx`, LETTER_CELL); four such rows fit 360×740 with Buddy's reply
 * (tests/web/mark.spec.ts, 46g). A longer word is rejected when it is written, never wrapped.
 */
export const MARK_SYLLABLE_WORDS_MAX = 4;
export const MARK_SYLLABLE_LETTERS_MAX = 10;
/**
 * A text whose marks are sorted into categories: the category buttons take up to two rows of their
 * own, and the line saying what is marked runs longer ("Subjekt: …; Prädikat: …"). So the text may
 * take two rows of word tiles at most — counted in words AND in characters, because long words fill
 * a row sooner. Measured on 360×740 in the worst case — three long names on two rows, a three-line
 * instruction, every word marked, Buddy's reply above (tests/web/mark.spec.ts, 46h): a sentence of
 * 59 characters took three rows of tiles and was 62 pt too much.
 */
export const MARK_SORTED_WORDS_MAX = 7;
export const MARK_SORTED_CHARS_MAX = 45;

/** Does a text to sort into categories stay within its measured size? */
export function sortedTextFits(
  words: ReadonlyArray<{ lead: string; text: string; tail: string }>,
): boolean {
  const chars = [...words.map((w) => `${w.lead}${w.text}${w.tail}`).join(' ')].length;
  return words.length <= MARK_SORTED_WORDS_MAX && chars <= MARK_SORTED_CHARS_MAX;
}
export const MARK_CATEGORIES_MIN = 2;
export const MARK_CATEGORIES_MAX = 3;
/**
 * A category's name — the grammar term as school uses it: "Akkusativobjekt" (15),
 * "Präpositionalobjekt" (19). The content decides, never the layout (owner review of #234).
 */
export const MARK_CATEGORY_MAX = 20;
/**
 * Two category names stand side by side as buttons on a 360-pt phone when together they have at
 * most this many characters (a button is about 52 pt plus 7.4 pt a character, 328 pt of row).
 */
export const MARK_CATEGORY_PAIR_CHARS = 28;

/**
 * Do the category buttons wrap to at most two rows? They flow in order: two or fewer always do;
 * three do when the first two, or the last two, share a row.
 */
export function categoriesInTwoRows(names: readonly string[]): boolean {
  if (names.length < 3) return true;
  const len = names.map((n) => [...n].length);
  const pair = (i: number) => len[i]! + len[i + 1]! <= MARK_CATEGORY_PAIR_CHARS;
  return pair(0) || pair(1);
}
/** Punctuation that stands before or after a word ("„Hund,“"): shown, never tapped. */
export const MARK_AFFIX_MAX = 6;
/** The instruction above a marking text: two lines of the question card at most. */
export const MARK_PROMPT_MAX = 60;

export const MarkMode = z.enum(['words', 'gaps', 'syllables']);
export type MarkMode = z.infer<typeof MarkMode>;

/** A word of the text, as code split it: what she reads, and the marks around it. */
export const MarkWord = z.object({
  id: PartId,
  text: z.string().min(1).max(MARK_WORD_MAX),
  /** Opening marks before the word ("„", "("), shown with it. */
  lead: z.string().max(MARK_AFFIX_MAX),
  /** Punctuation after it (".", "“"): shown, never a target. Commas to set are left out. */
  tail: z.string().max(MARK_AFFIX_MAX),
});
export type MarkWord = z.infer<typeof MarkWord>;

export const MarkCategory = z.object({
  id: PartId,
  name: z.string().trim().min(1).max(MARK_CATEGORY_MAX),
});
export type MarkCategory = z.infer<typeof MarkCategory>;

/** One mark: a target (word, gap or cut) and, with categories, the one she gave it. */
export const MarkPick = z.object({ at: PartId, category: PartId.nullable() });
export type MarkPick = z.infer<typeof MarkPick>;

/** The most marks one answer may carry: every word, or every gap, of the longest text. */
export const MARK_PICKS_MAX = 60;

/** What the app shows: the words as code split them, and the categories. Never the key. */
export const MarkTaskView = z.object({
  type: z.literal('mark'),
  mode: MarkMode,
  words: z.array(MarkWord).min(1).max(MARK_WORDS_MAX),
  /** Empty: plain marking. Two or three: she picks a category, then the words. */
  categories: z.array(MarkCategory).max(MARK_CATEGORIES_MAX),
});
export type MarkTaskView = z.infer<typeof MarkTaskView>;

/** The stored task: the view plus the key (server only). */
export const MarkTask = MarkTaskView.extend({
  /** The targets that are to be marked (with their category). At least one. */
  key: z.array(MarkPick).min(1).max(MARK_PICKS_MAX),
  /**
   * An error text's corrected words, by the id of the word they correct (#234: the corrected
   * version differs from the text exactly at the key). Shown in the solution; empty otherwise.
   */
  corrections: z.array(z.object({ at: PartId, text: z.string().min(1).max(MARK_WORD_MAX) })),
});
export type MarkTask = z.infer<typeof MarkTask>;

export const MarkAnswer = z.object({
  type: z.literal('mark'),
  /** Every target she marked, once; at least one (nothing marked is no answer yet). */
  marks: z.array(MarkPick).min(1).max(MARK_PICKS_MAX),
});
export type MarkAnswer = z.infer<typeof MarkAnswer>;

/** The id of the gap after word `wordIndex` (0-based; gaps mode). */
export function gapId(wordIndex: number): PartId {
  return `g${wordIndex + 1}`;
}

/** The id of the cut after letter `letter` (1-based) of word `wordIndex` (syllables mode). */
export function cutId(wordIndex: number, letter: number): PartId {
  return `w${wordIndex + 1}_${letter}`;
}

/** Every place she can tap in this task, in reading order. */
export function markTargets(task: Pick<MarkTaskView, 'mode' | 'words'>): PartId[] {
  switch (task.mode) {
    case 'words':
      return task.words.map((w) => w.id);
    case 'gaps':
      return task.words.slice(0, -1).map((_, i) => gapId(i));
    case 'syllables':
      return task.words.flatMap((w, wi) =>
        [...w.text].slice(0, -1).map((_, li) => cutId(wi, li + 1)),
      );
  }
}

/** Words that stand next to each other read as one run ("der Hund"); runs apart with ", ". */
function markRuns(words: readonly MarkWord[], ids: ReadonlySet<string>): string {
  const runs: string[][] = [];
  let last = -2;
  words.forEach((w, i) => {
    if (!ids.has(w.id)) return;
    if (i === last + 1 && runs.length > 0) runs[runs.length - 1]!.push(w.text);
    else runs.push([w.text]);
    last = i;
  });
  return runs.map((r) => r.join(' ')).join(', ');
}

/**
 * Marks as she reads them — the line under the text in the app, her answer in the conversation
 * and the solution on the server, one implementation: "Subjekt: der Hund; Prädikat: bellt",
 * "Hund, Katze", the sentence with its commas set, the words with their syllables cut.
 */
export function markedText(view: Omit<MarkTaskView, 'type'>, marks: readonly MarkPick[]): string {
  const at = new Set(marks.map((m) => m.at));
  switch (view.mode) {
    case 'gaps':
      return view.words
        .map((w, i) => `${w.lead}${w.text}${at.has(gapId(i)) ? ',' : ''}${w.tail}`)
        .join(' ');
    case 'syllables':
      return view.words
        .map((w, wi) =>
          [...w.text].map((ch, li) => (at.has(cutId(wi, li + 1)) ? `${ch}-` : ch)).join(''),
        )
        .join(' ');
    case 'words':
      // Without categories every word stands alone: "montag fährt" would read as one phrase.
      if (view.categories.length === 0) {
        return view.words
          .filter((w) => at.has(w.id))
          .map((w) => w.text)
          .join(', ');
      }
      return view.categories
        .map((c) => {
          const ids = new Set(marks.filter((m) => m.category === c.id).map((m) => m.at));
          return ids.size === 0 ? null : `${c.name}: ${markRuns(view.words, ids)}`;
        })
        .filter((x): x is string => x !== null)
        .join('; ');
  }
}

// ─────────────── find_error (#260) ───────────────
//
// Fehlerdetektiv: a worked solution, line by line, with ONE wrong line in it. She taps the line
// where it goes wrong and writes it right. The model writes the solution CORRECTLY; code checks
// that every line follows from the one before (`steps.ts`, #209), then builds the error into one
// line itself — a sign, a number, a bracket dissolved the wrong way — and checks that exactly that
// line breaks (`apps/api/src/modules/practice/findError.ts`). The first line is the task; it is
// shown, never a target. Her correction is compared with the line before by the same equivalence
// (`sameStep`), never by a model.

/**
 * The task and at least two steps. Four lines is what fits a 360×740 phone as tiles under Buddy's
 * longest reply, with the bar she writes in (rule 16, tests/web/written.spec.ts 86c): six were
 * 106 pt too tall there.
 */
export const FIND_ERROR_LINES_MIN = 3;
export const FIND_ERROR_LINES_MAX = 4;
/** One line is one step of a calculation: it stands on one line of a tile. */
export const FIND_ERROR_LINE_MAX = 40;
/** Her corrected line: a step, never a paragraph. */
export const FIND_ERROR_FIX_MAX = 120;

export const FindErrorLine = z.object({
  /** `l1` … by position: the lines are shown in their order, so the id says nothing more. */
  id: PartId,
  /** Plain text, math between dollar signs like everywhere else. */
  text: z.string().trim().min(1).max(FIND_ERROR_LINE_MAX),
});
export type FindErrorLine = z.infer<typeof FindErrorLine>;

export const FindErrorTaskView = z.object({
  type: z.literal('find_error'),
  /** In order, the wrong one among them. The first is the task. Never which one is wrong. */
  lines: z.array(FindErrorLine).min(FIND_ERROR_LINES_MIN).max(FIND_ERROR_LINES_MAX),
});
export type FindErrorTaskView = z.infer<typeof FindErrorTaskView>;

/** The stored task: the view plus the key (server only). */
export const FindErrorTask = FindErrorTaskView.extend({
  /** The id of the line code made wrong — never the first. */
  key: PartId,
  /** That line as the model wrote it, before the error went in: the solution. */
  right: z.string().trim().min(1).max(FIND_ERROR_LINE_MAX),
});
export type FindErrorTask = z.infer<typeof FindErrorTask>;

export const FindErrorAnswer = z.object({
  type: z.literal('find_error'),
  /** The line she tapped as the wrong one. */
  line: PartId,
  /** That line as she wrote it right. */
  fix: z.string().trim().min(1).max(FIND_ERROR_FIX_MAX),
});
export type FindErrorAnswer = z.infer<typeof FindErrorAnswer>;

// ─────────────── column_calc (#260) ───────────────
//
// Schriftlich rechnen: the numbers stand in columns like on squared paper, and every digit she
// writes — of the result, of each carry, of every step — is a cell of its own. The model only
// names the operation and the numbers; code computes the whole procedure, column by column with
// its carries, lays it out and keeps every digit as the key
// (`apps/api/src/modules/practice/columnCalc.ts`). Nothing about the layout is the model's.
//
// The notation is the one German primary schools write: the carries in a small row above the
// line, under the last number (addition; subtraction by Ergänzen or Abziehen mit Erweitern — both
// write the same digits in the same places); the partial products from the first digit of the
// second factor on, each ending under its digit, and their sum with its carries; a division by a
// one-digit number as a staircase under the dividend — times, then the difference with the next
// digit brought down. Entbündeln (the minuend's digits crossed out) is not laid out: nothing in
// code knows which Bundesland teaches it (`curriculum/points.ts` has no such place).

export const ColumnOp = z.enum(['add', 'sub', 'mul', 'div']);
export type ColumnOp = z.infer<typeof ColumnOp>;

/** A number she reads is at most six digits (Hunderttausender, year 4). */
export const COLUMN_DIGITS_MAX = 6;
/** Two or three numbers added; one subtrahend; a factor of one or two digits; a divisor of one. */
export const COLUMN_ADDENDS_MAX = 3;
export const COLUMN_FACTOR_DIGITS_MAX = 2;
/** The most cells one task may hold: what a phone fits, never what a sheet could. */
export const COLUMN_GAPS_MAX = 40;
/**
 * The width a 360-pt phone gives the grid (360 minus the answer slot's 16 pt on each side), and
 * what a column needs there at least: a digit column is a cell she taps (as narrow as a letter
 * cell of syllable marking, 30 pt, with two to spare), a column of signs (+ − · : =) is narrow.
 * The app makes the columns wider when there is room, up to square cells.
 */
export const COLUMN_WIDTH_MAX = 328;
export const COLUMN_DIGIT_MIN = 32;
export const COLUMN_SIGN = 20;
/**
 * Rows of the grid, every one a touch high: three numbers, their carries and the sum; two partial
 * products, their carries and the sum; a division of two steps under its first row. Measured on
 * 360×740 with Buddy's reply above (tests/web/written.spec.ts, 86h, 86j): a division of three steps
 * (seven rows) was 78 pt too tall there, and a cell cannot be lower than a touch target.
 */
export const COLUMN_ROWS_MAX = 5;

/** What a cell to fill is part of: it names the cell to a screen reader and in Buddy's reply. */
export const ColumnPart = z.enum([
  /** A carry, written small above the line. */
  'carry',
  /** A digit of the result under the line. */
  'result',
  /** A partial product of a multiplication by a two-digit number. */
  'partial',
  /** A digit of a division's quotient. */
  'quotient',
  /** A division step: the divisor times the quotient digit, under the dividend. */
  'product',
  /** A division step: the difference, with the next digit brought down. */
  'difference',
]);
export type ColumnPart = z.infer<typeof ColumnPart>;

/** A cell she fills: where it is, never what belongs in it. */
export const ColumnGap = z.object({
  id: PartId,
  part: ColumnPart,
  /** 0 the ones, 1 the tens …: of the number this cell belongs to. */
  place: z
    .number()
    .int()
    .min(0)
    .max(COLUMN_DIGITS_MAX + 1),
  /** The partial product (1, 2) or the division step (1 …) it belongs to; 0 for none. */
  step: z.number().int().min(0).max(COLUMN_DIGITS_MAX),
});
export type ColumnGap = z.infer<typeof ColumnGap>;

/** A cell she reads: a digit, a sign (+ − · : =) or nothing. */
export const ColumnShown = z.object({ text: z.string().max(1) });
export type ColumnShown = z.infer<typeof ColumnShown>;

export const ColumnCell = z.union([ColumnGap, ColumnShown]);
export type ColumnCell = z.infer<typeof ColumnCell>;

export const ColumnRow = z.object({
  /** One cell per column, every row as wide as the grid. */
  cells: z.array(ColumnCell).min(1),
  /** A line is drawn above this row: the line under a sum, under a step. */
  rule: z.boolean(),
});
export type ColumnRow = z.infer<typeof ColumnRow>;

/** The stored task: only what the model named. Code computes the rest every time it is read. */
export const ColumnCalcTask = z.object({
  type: z.literal('column_calc'),
  op: ColumnOp,
  /** The numbers as written, digits only, no leading zero. */
  operands: z
    .array(z.string().regex(/^[1-9][0-9]*$/))
    .min(2)
    .max(COLUMN_ADDENDS_MAX),
});
export type ColumnCalcTask = z.infer<typeof ColumnCalcTask>;

export const ColumnCalcTaskView = z.object({
  type: z.literal('column_calc'),
  op: ColumnOp,
  rows: z.array(ColumnRow).min(2).max(COLUMN_ROWS_MAX),
  /** The cells in the order they are written — right to left, carry before digit, step by step. */
  order: z.array(PartId).min(1).max(COLUMN_GAPS_MAX),
});
export type ColumnCalcTaskView = z.infer<typeof ColumnCalcTaskView>;

export const ColumnCalcAnswer = z.object({
  type: z.literal('column_calc'),
  /** Every cell once: a digit, or empty (no carry; no leading zero). */
  cells: z
    .array(z.object({ id: PartId, digit: z.string().regex(/^[0-9]?$/) }))
    .min(1)
    .max(COLUMN_GAPS_MAX),
});
export type ColumnCalcAnswer = z.infer<typeof ColumnCalcAnswer>;

/** A column of signs: nothing in it to type, no digit in it to read. */
export function signColumn(rows: readonly ColumnRow[], col: number): boolean {
  return rows.every((r) => {
    const cell = r.cells[col];
    return cell === undefined || (!('id' in cell) && !/[0-9]/.test(cell.text));
  });
}

/** Does the grid fit a 360-pt phone with every digit column at its narrowest? */
export function columnsFit(rows: readonly ColumnRow[]): boolean {
  const cols = Math.max(...rows.map((r) => r.cells.length));
  let width = 0;
  for (let c = 0; c < cols; c++) width += signColumn(rows, c) ? COLUMN_SIGN : COLUMN_DIGIT_MIN;
  return width <= COLUMN_WIDTH_MAX;
}

/**
 * Her result as it stands in the conversation — the digits of the result (or the quotient) left
 * to right, an empty cell inside it as "_", "?" when there is none yet. One implementation for the
 * app (while the server checks) and the server (the thread it keeps).
 */
export function columnResultText(
  view: Pick<ColumnCalcTaskView, 'rows'>,
  digits: Readonly<Record<string, string>>,
): string {
  const cells = view.rows.flatMap((r) =>
    r.cells.filter(
      (c): c is ColumnGap => 'id' in c && (c.part === 'result' || c.part === 'quotient'),
    ),
  );
  const text = cells
    .map((c) => digits[c.id] || ' ')
    .join('')
    .trim()
    .replace(/ /g, '_');
  return text === '' ? '?' : text;
}

/** A line's number as she sees it beside the line: ① ② … */
export function lineMark(index: number): string {
  return String.fromCodePoint(0x2460 + index);
}

/** Her answer to a find-the-error task in the conversation: "② 3x + 6 = 21". */
export function findErrorText(view: Pick<FindErrorTaskView, 'lines'>, line: string, fix: string) {
  const at = view.lines.findIndex((l) => l.id === line);
  return at < 0 ? fix : `${lineMark(at)} ${fix}`;
}

// ─────────────── the unions (one member per kind that exists) ───────────────

/** The stored definition including the key (`items.task`). Server only. */
export const StructuredTask = z.discriminatedUnion('type', [
  OrderTask,
  TableFillTask,
  MatchTask,
  ClozeTask,
  SelectAllTask,
  MarkTask,
  FindErrorTask,
  ColumnCalcTask,
]);
export type StructuredTask = z.infer<typeof StructuredTask>;

/** What the app shows (`ItemView.task_view`): the task without its key. */
export const StructuredTaskView = z.discriminatedUnion('type', [
  OrderTaskView,
  TableFillTaskView,
  MatchTaskView,
  ClozeTaskView,
  SelectAllTaskView,
  MarkTaskView,
  FindErrorTaskView,
  ColumnCalcTaskView,
]);
export type StructuredTaskView = z.infer<typeof StructuredTaskView>;

/** What she sends (`AnswerRequest.parts`). */
export const StructuredAnswer = z.discriminatedUnion('type', [
  OrderAnswer,
  TableFillAnswer,
  MatchAnswer,
  ClozeAnswer,
  SelectAllAnswer,
  MarkAnswer,
  FindErrorAnswer,
  ColumnCalcAnswer,
]);
export type StructuredAnswer = z.infer<typeof StructuredAnswer>;
