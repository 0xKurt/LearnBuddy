// Antworten mit MEHREREN TEILEN: ordnen, zuordnen, eine Tabelle füllen
// (issues #228, #229, #230, aus der Analyse #224).
//
// Bis hierher war jede Antwort EIN Wert gegen EINEN Schlüssel: short · long · numeric ·
// multiple_choice · formula · vocab · speak. Die drei häufigsten Aufgabenformen der
// Klassenarbeit sind aber mehrteilig — 95 Aufgabentypen aus 14 Fächern
// (`docs/lehrplan-und-uebungsformen.md`), und alle drei sind von Code **vollständig**
// entscheidbar: eine Reihenfolge, eine Paarung, eine Gruppierung und der Inhalt einer
// Tabellenzelle sind mechanisch prüfbar. Deshalb schreibt das Modell hier die Aufgabe und
// urteilt über sie **nichts** (CLAUDE.md Regel 1; issue #227 ist die Liste der Stellen, an
// denen genau das einmal nicht galt).
//
// Zwei Objekte, und die Trennung ist der Kern dieser Datei:
//
//   · `PartsTask` — was das Modell schreibt. Es enthält die Lösung und verlässt den Server
//     nie. Gespeichert in `items.parts_task` (Migration 0072), genau wie `items.bar_task`
//     die geprüfte Bruchbalken-Aufgabe hält (issue #162).
//   · `PartsBoard` — was die App zeigt. Daraus abgeleitet, ohne Lösung, mit server-eigenen
//     Kürzeln (`e1`, `l2`, `g3`, `c4`) und in einer Anzeige-Reihenfolge, die **stabil pro
//     Frage** ist (ein Hash der Item-Id, keine Uhr und keine Zufallsquelle — `tapChoices.ts`
//     begründet das für die Vokabelkarten, hier gilt es genauso: ein Neuladen darf die
//     Elemente nicht unter ihrem Finger neu mischen).
//
// Das Modell schreibt **keine** Kürzel (Regel 2): es schreibt Texte und Struktur, der Server
// vergibt die Kürzel aus der Position. Und es schreibt die Lösung nicht als eigenes Feld
// neben die Elemente, sondern **durch die Struktur**: die Elemente stehen in der richtigen
// Reihenfolge, ein Paar ist ein Objekt mit links und rechts, eine Gruppe trägt ihre
// Mitglieder. Ein Schlüssel, der den Elementen widerspricht, ist damit nicht sagbar — dasselbe
// Mittel wie in `bars.ts` ("was die Wertebereiche schon unsagbar machen, muss nicht
// wegvalidiert werden").

import { z } from 'zod';

// ─────────────── Größen ───────────────

/**
 * Wie lang ein Stück sein darf. Zwei Gründe, und beide binden:
 *
 *   1. Es muss auf einem 360 pt breiten Handy in eine Zeile der Fragekarte passen, neben seine
 *      Nummer — ein Element, das dreimal umbricht, ist kein Tippziel mehr.
 *   2. Die **gerenderte Lösung** aller Teile zusammen muss in `items.answer` passen, und das
 *      sind 600 Zeichen (`ItemDraft.answer`). Die Grenzen sind so gewählt, dass die größte
 *      erlaubte Aufgabe jeder Form darunter bleibt — gerechnet, nicht geschätzt: 8 × 48 + 7
 *      Trenner = 405 · 6 × (40 + 40) + Trenner = 508 · 4 Namen × 24 + 12 Mitglieder × 32 +
 *      Trenner = 513 · 12 × 40 + Trenner = 502.
 */
const OrderElement = z.string().trim().min(1).max(48);
const PairSide = z.string().trim().min(1).max(40);
const GroupName = z.string().trim().min(1).max(24);
const GroupMember = z.string().trim().min(1).max(32);

/** Eine Tabellenzelle — dieselbe Grenze wie `TableFigure` in `figure.ts`. */
const CellText = z.string().trim().max(40);
const CellAnswer = z.string().trim().min(1).max(40);

/** Die längste Antwort, die ein einzelnes Teil tragen kann (das längste Stück oben). */
export const MAX_PART_VALUE = 48;

/**
 * Wie viele Elemente eine Reihenfolge hat. Drei, weil zwei keine Reihenfolge sind, die man
 * ordnen müsste; acht, weil darüber die Liste auf einem 360×740-Handy nicht mehr ohne
 * Scrollen in die Fragekarte passt (CLAUDE.md Regel 16).
 */
export const ORDER_MIN = 3;
export const ORDER_MAX = 8;

/** Wie viele Paare eine Zuordnung hat (issue #229: 3–6 links, 3–6 rechts). */
export const PAIRS_MIN = 3;
export const PAIRS_MAX = 6;

/** Wie viele Gruppen, und wie viele Elemente über alle Gruppen (issue #229: 2–4 / 4–12). */
export const GROUPS_MIN = 2;
export const GROUPS_MAX = 4;
export const GROUP_MEMBERS_MIN = 4;
export const GROUP_MEMBERS_MAX = 12;

/** Wie groß eine Tabelle wird — wie `TableFigure`: höchstens 6 Spalten und 10 Zeilen. */
export const TABLE_COLS_MAX = 6;
export const TABLE_ROWS_MAX = 10;

/**
 * Wie viele Lücken eine Tabelle haben darf. Zwölf, weil jede Lücke ein eigenes Tippziel ist
 * und die gerenderte Lösung in `items.answer` passen muss; eine Konjugationstabelle (6 Formen)
 * und eine Vierfeldertafel (4 Felder) liegen klar darunter.
 */
export const TABLE_GAPS_MAX = 12;

/** Die meisten Teile, die eine Antwort haben kann — die größte Form ist die Tabelle. */
export const MAX_ANSWER_PARTS = TABLE_GAPS_MAX;

// ─────────────── was das Modell schreibt (mit Lösung) ───────────────

export const OrderTask = z
  .object({
    form: z.literal('order'),
    elements: z
      .array(OrderElement)
      .min(ORDER_MIN)
      .max(ORDER_MAX)
      .describe(
        'The elements IN THE CORRECT ORDER — this list IS the solution, there is no separate key. Every element must be different from every other one, and the order must be the only right one (if two orders would both be correct, do not write this task at all). The app shows them shuffled.',
      ),
  })
  .describe(
    'Put elements in the right order: steps of a process, events on a time line, numbers by size. The learner taps them one after another and they get the numbers 1, 2, 3 …',
  );
export type OrderTask = z.infer<typeof OrderTask>;

export const MatchPairsTask = z
  .object({
    form: z.literal('match_pairs'),
    pairs: z
      .array(z.object({ left: PairSide, right: PairSide }))
      .min(PAIRS_MIN)
      .max(PAIRS_MAX)
      .describe(
        'The pairs that belong together, one object each. Every left side and every right side must appear exactly once, and each left side must fit exactly ONE right side (if a left side would also fit another right side, do not write this task). The app shows the two columns shuffled.',
      ),
  })
  .describe(
    'Connect what belongs together: term and explanation, epoch and event, organ and task. The learner taps a left side, then a right side; the pair gets a number.',
  );
export type MatchPairsTask = z.infer<typeof MatchPairsTask>;

export const MatchGroupsTask = z
  .object({
    form: z.literal('match_groups'),
    groups: z
      .array(
        z.object({
          name: GroupName,
          members: z
            .array(GroupMember)
            .min(1)
            .max(GROUP_MEMBERS_MAX - GROUPS_MIN + 1),
        }),
      )
      .min(GROUPS_MIN)
      .max(GROUPS_MAX)
      .describe(
        'The groups, each with the elements that belong IN it. Every group needs at least one element, every element appears in exactly one group, and each element must belong to only one of the groups (if an element would fit two groups, do not write this task). The app shows the elements shuffled.',
      ),
  })
  .describe(
    'Sort elements into groups: words into parts of speech, animals into classes, sources into types. The learner taps an element, then the group.',
  );
export type MatchGroupsTask = z.infer<typeof MatchGroupsTask>;

/**
 * Eine Tabellenzelle: entweder sie steht da (`given`) oder sie ist eine Lücke (`gap`).
 *
 * `expect` ist keine Höflichkeit, sondern die Zusage, dass Code die Zelle entscheiden kann:
 * `number` heißt, der Schlüssel ist eine Zahl und wird mit `numericVerdict` geprüft; `word`
 * heißt, er ist ein kurzes Wort oder eine kurze Form und wird mit `writtenAgainst` geprüft
 * (inklusive Beinahe-Treffer). Ein Satz gehört in keine Lücke — eine Tabelle mit einer freien
 * Formulierung darin wäre eine Antwort, die Code nicht beurteilen kann, und würde die Hälfte
 * eines Urteils ans Modell geben (siehe den Kopf dieser Datei).
 */
export const TableCell = z.discriminatedUnion('cell', [
  z
    .object({ cell: z.literal('given'), text: CellText })
    .describe('A cell that is printed in the table; may be empty (a corner cell).'),
  z
    .object({
      cell: z.literal('gap'),
      expect: z
        .enum(['number', 'word'])
        .describe(
          'number: the answer is a number · word: the answer is one short word or form. Never a sentence.',
        ),
      answer: CellAnswer.describe('What belongs in this cell.'),
      accepted: z
        .array(CellAnswer)
        .max(4)
        .default([])
        .describe(
          'Other spellings or forms that are just as right here; empty when there are none.',
        ),
    })
    .describe('A cell the learner fills in.'),
]);
export type TableCell = z.infer<typeof TableCell>;

/**
 * Eine **Wertetabelle**: eine Spalte ist eine Funktion einer anderen (issue #230, „Jeder Wert wird
 * aus der Funktion nachgerechnet").
 *
 * Damit ist der Schlüssel einer solchen Tabelle nicht mehr nur behauptet, sondern geprüft: der
 * Server rechnet jeden Wert mit `compileExpression` nach und legt die Frage **nicht an**, wenn
 * einer nicht stimmt — dieselbe Entscheidung wie `keyCheck.ts` für eine Rechenaufgabe (issue #157),
 * nur über eine ganze Tabelle. Ein Modell, das sich beim Einsetzen verrechnet, kostet damit eine
 * Frage und nicht ihr Vertrauen in die eigene richtige Antwort.
 *
 * Freiwillig: ohne dieses Feld ist die Tabelle eine gewöhnliche Tabelle (Konjugation,
 * Stellenwerttafel, Vergleichstabelle), deren Schlüssel niemand nachrechnen kann.
 */
export const TableFunctionCheck = z
  .object({
    /** The small grammar of `compileExpression`: x, numbers, + - * / ^, sqrt, sin, … */
    expr: z.string().trim().min(1).max(80),
    /** Which column holds the input (0 = the first column). */
    input_column: z
      .number()
      .int()
      .min(0)
      .max(TABLE_COLS_MAX - 1),
    /** Which column holds the value computed from it. */
    output_column: z
      .number()
      .int()
      .min(0)
      .max(TABLE_COLS_MAX - 1),
  })
  .describe(
    'Only for a table of values, where one column really is a function of another: the expression in x, the column the input stands in, and the column the result stands in. The server recomputes every value and writes no question at all when one of them does not match, so do not set this for a table that is not computed that way.',
  );
export type TableFunctionCheck = z.infer<typeof TableFunctionCheck>;

export const TableFillTask = z
  .object({
    form: z.literal('table_fill'),
    header: z
      .array(CellText)
      .min(1)
      .max(TABLE_COLS_MAX)
      .describe('The column headings; a heading may be empty when the column needs none.'),
    rows: z
      .array(z.array(TableCell).min(1).max(TABLE_COLS_MAX))
      .min(1)
      .max(TABLE_ROWS_MAX)
      .describe(
        'The rows. Every row has exactly as many cells as there are headings. At least one cell is a gap, and the table must be solvable from what is printed in it.',
      ),
    computed: TableFunctionCheck.nullable().default(null),
  })
  .describe(
    'Fill in a table: a place-value table, a table of values, a conjugation or declension table, a truth table, a comparison table. Each gap is filled in on its own and checked on its own.',
  );
export type TableFillTask = z.infer<typeof TableFillTask>;

/**
 * Die geprüfte Aufgabe einer mehrteiligen Antwort, wie das Modell sie schreibt. Enthält die
 * Lösung und bleibt auf dem Server (`items.parts_task`); die App bekommt `PartsBoard`.
 */
export const PartsTask = z.discriminatedUnion('form', [
  OrderTask,
  MatchPairsTask,
  MatchGroupsTask,
  TableFillTask,
]);
export type PartsTask = z.infer<typeof PartsTask>;

/** Welche Aufgabenformen `ItemKind` 'match' annimmt. */
export type PartsForm = PartsTask['form'];

// ─────────────── was die App zeigt (ohne Lösung) ───────────────

/**
 * Ein Stück auf dem Brett: sein Kürzel und sein Text. Das Kürzel vergibt der Server aus der
 * Position in der Aufgabe, die Antwort der App nennt es (CLAUDE.md Regel 2) — nie eine Id,
 * nie einen Index, auf den sich App und Server getrennt verlassen müssten.
 */
export const BoardPiece = z.object({
  ref: z.string().regex(/^[a-z][1-9][0-9]?$/),
  text: z.string(),
});
export type BoardPiece = z.infer<typeof BoardPiece>;

export const OrderBoard = z.object({
  form: z.literal('order'),
  /** Die Elemente in der Reihenfolge, in der sie GEZEIGT werden (stabil gemischt). */
  elements: z.array(BoardPiece).min(ORDER_MIN).max(ORDER_MAX),
});

export const MatchPairsBoard = z.object({
  form: z.literal('match_pairs'),
  left: z.array(BoardPiece).min(PAIRS_MIN).max(PAIRS_MAX),
  right: z.array(BoardPiece).min(PAIRS_MIN).max(PAIRS_MAX),
});

export const MatchGroupsBoard = z.object({
  form: z.literal('match_groups'),
  groups: z.array(BoardPiece).min(GROUPS_MIN).max(GROUPS_MAX),
  elements: z.array(BoardPiece).min(GROUP_MEMBERS_MIN).max(GROUP_MEMBERS_MAX),
});

/** Eine Zelle, wie die App sie zeichnet: Text oder eine Lücke mit ihrem Kürzel. */
export const BoardCell = z.discriminatedUnion('cell', [
  z.object({ cell: z.literal('given'), text: z.string() }),
  z.object({
    cell: z.literal('gap'),
    ref: z.string().regex(/^c[1-9][0-9]?$/),
    /** Welche Tastatur die Lücke braucht: die Rechentasten oder die Schrifttastatur. */
    expect: z.enum(['number', 'word']),
  }),
]);
export type BoardCell = z.infer<typeof BoardCell>;

export const TableFillBoard = z.object({
  form: z.literal('table_fill'),
  header: z.array(z.string()).min(1).max(TABLE_COLS_MAX),
  rows: z.array(z.array(BoardCell).min(1).max(TABLE_COLS_MAX)).min(1).max(TABLE_ROWS_MAX),
});

/**
 * Was sie anordnet (`ItemView.board`): die Teile der Aufgabe, ohne Lösung.
 *
 * Eine **Figur** ist, was sie LIEST (`ItemView.figure`); eine **Fläche** ist, was sie
 * BERÜHRT, um einen einzelnen Wert zu schreiben (`ItemView.surface`, der Bruchbalken aus
 * #162); ein **Brett** ist, was sie ANORDNET — und seine Antwort hat mehrere Teile.
 */
export const PartsBoard = z.discriminatedUnion('form', [
  OrderBoard,
  MatchPairsBoard,
  MatchGroupsBoard,
  TableFillBoard,
]);
export type PartsBoard = z.infer<typeof PartsBoard>;

// ─────────────── was sie antwortet ───────────────

/**
 * Ein Teil ihrer Antwort: in welches Fach (`slot`) sie was (`value`) gelegt hat.
 *
 * Eine Form für alle drei, damit es nicht drei halbe Systeme werden:
 *
 * | Form           | slot                     | value                        |
 * | -------------- | ------------------------ | ---------------------------- |
 * | `order`        | die Position (`p1`…)     | das Element (`e3`)           |
 * | `match_pairs`  | die linke Seite (`l1`…)  | die rechte Seite (`r3`)      |
 * | `match_groups` | das Element (`e1`…)      | die Gruppe (`g2`)            |
 * | `table_fill`   | die Lücke (`c1`…)        | was sie hineingeschrieben hat |
 *
 * Nur bei `table_fill` ist `value` ihr eigener Text; sonst ist es ein Kürzel, das der Server
 * selbst ausgegeben hat. Der Server nimmt nur genau die Fächer an, die die Aufgabe hat — nicht
 * mehr, nicht weniger, keines zweimal (`modules/practice/parts.ts` `readParts`): antworten kann
 * sie nur mit den Teilen, die die Frage hergibt.
 */
export const AnswerPart = z.object({
  slot: z.string().regex(/^[a-z][1-9][0-9]?$/),
  value: z.string().trim().min(1).max(MAX_PART_VALUE),
});
export type AnswerPart = z.infer<typeof AnswerPart>;
