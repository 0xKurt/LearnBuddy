// Antworten mit mehreren Teilen, vollständig von Code entschieden (issues #228, #229, #230).
//
// Das Modell schreibt die Aufgabe (`PartsTask`, `contracts/parts.ts`). Es beurteilt sie nicht:
// eine Reihenfolge, eine Paarung, eine Gruppierung und der Inhalt einer Tabellenzelle sind
// mechanisch entscheidbar, also entscheidet Code — jedes Teil (CLAUDE.md Regel 1, issue #227).
// Kein Modellaufruf pro Antwort, auch nicht für „die Hälfte" einer Antwort: ein Urteil, das zur
// Hälfte gezählt und zur Hälfte geschätzt ist, kann niemandem mehr erklärt werden.
//
// ─────────────── Was eine TEILWEISE richtige Antwort heißt ───────────────
//
// Das ist die Entscheidung, an der dieses Feature hängt, und sie folgt den drei Issues, an denen
// das Projekt sich verbrannt hat (#197, #212, #227): **ein Urteil darf nie mehr behaupten, als
// gemessen wurde.**
//
//   1. **Sechs von acht Zellen richtig ist `partially_correct`, und die Frage bleibt offen.**
//      Genau wie ein Beinahe-Treffer (`NEAR_MISS` in `evaluate.ts`): „fast richtig, noch nicht
//      fertig". Nicht `correct`, weil zwei Zellen nicht stimmen; nicht `incorrect`, weil das
//      sechs richtige Zellen wegwerfen würde — und genau das tut eine Klassenarbeit NICHT
//      (dieselbe Begründung wie `step_broke`, issue #209). Erst wenn **kein** Teil hält, ist es
//      `incorrect`; dann gibt es nichts, was man ihr wegnehmen könnte.
//
//   2. **FSRS bekommt daraus keinen Bruchteil.** Es gibt kein „0,75 von Good": FSRS kennt hier
//      drei Noten (`fsrs.ts` RATING). Eine erfundene Zwischennote wäre die Behauptung, sie
//      beherrsche das Thema zu 75 % — eine Zahl, die niemand gemessen hat. Stattdessen passiert
//      das, was im Haus für schwächere Evidenz schon gilt: sie zählt weniger, statt anders zu
//      zählen. Eine teilweise richtige Antwort schließt die Frage nicht, also schreibt sie keine
//      Wiederholung; sie kostet aber den ersten Versuch, und die richtige Antwort danach ist
//      `with_help` → `Hard` statt `Good`. Nach dem dritten Versuch kommt die Lösung und es wird
//      `revealed` → `Again`, wie überall.
//
//   3. **Sie sieht, WIE VIEL hält — und EINE Stelle, auf die sie schauen kann.** Nicht die Liste
//      aller falschen Teile: `chemistry.ts` nennt bei mehreren unausgeglichenen Elementen genau
//      eines, „weil alle auf einmal zu nennen eine Liste zum Abarbeiten ist statt eines nächsten
//      Schritts". Dasselbe hier. Die Stelle folgt der Hinweisleiter — beim ersten Versuch steht
//      da, wie viel hält, ab dem zweiten auch welches Teil (issue #229 verlangt genau das).
//      Ausnahme ist `order`: dort IST die Menge, die hält, bereits eine Stelle („bis Schritt 3
//      stimmt alles"), genau wie `steps.ts` die erste gebrochene Zeile sofort nennt.
//
//   4. **Sie korrigiert nur die falschen Teile.** Die Frage bleibt offen und ihre Anordnung
//      bleibt stehen — der Server setzt nichts zurück und sperrt nichts fest. Ein Tipp auf ein
//      gesetztes Teil nimmt es zurück („rückgängig statt bestätigen", docs/UX-PRINCIPLES.md).
//      Richtige Teile festzusperren wäre bequem und wäre ein Verrat: bei fünf Paaren stünde das
//      fünfte damit da.
//
//   5. **Für `summary.ts` zählt sie wie jede andere Frage** — eine mehrteilige Antwort, die beim
//      ersten Mal ganz stimmt, ist mehr Evidenz als ein angetippter Vierer-Multiple-Choice, nicht
//      weniger. Was dort eine Ausnahme braucht, ist nur `answered_by = 'tapped'`: hier ist Tippen
//      die Form der Aufgabe und kein Ersatz fürs Produzieren (siehe `MULTI_PART_KINDS`).

import {
  hasSeveralParts,
  type AnswerPart,
  type ItemKind,
  type MatchGroupsTask,
  type MatchPairsTask,
  type OrderTask,
  type PartsBoard,
  type PartsForm,
  type PartsTask,
  type TableCell,
  type TableFillTask,
  GROUP_MEMBERS_MAX,
  GROUP_MEMBERS_MIN,
  PartsTask as PartsTaskSchema,
  TABLE_GAPS_MAX,
} from '@learnbuddy/shared-types/contracts';
import {
  compileExpression,
  normalizeShortAnswer,
  parseCanonicalKey,
  plainMath,
} from '@learnbuddy/shared-math';

import {
  partVerdict,
  typoShapeFor,
  type ItemForCheck,
  type RuleVerdict,
  type TypoShape,
} from './evaluate.js';
import { seedOf, shuffledAway, stableShuffle } from './shuffle.js';

/**
 * The stored task, read as a task — never trusted as it stands (the same care `taskOf` takes for
 * `items.bar_task`). A column that no longer parses yields null, and then the question has no
 * board: it can still be revealed or taken out, and nothing is guessed at.
 */
export function partsTaskOf(stored: unknown): PartsTask | null {
  if (stored === null || stored === undefined) return null;
  const r = PartsTaskSchema.safeParse(stored);
  return r.success ? r.data : null;
}

/** Which `ItemKind` a form belongs to — both match forms are one kind (issue #229). */
export function kindOfForm(form: PartsForm): ItemKind {
  if (form === 'order') return 'order';
  if (form === 'table_fill') return 'table_fill';
  return 'match';
}

// ─────────────── Erzeugung: was angelegt wird und was nicht ───────────────

/** Two texts count as the same element when only case, ß or punctuation separate them. */
function same(a: string, b: string): boolean {
  return normalizeShortAnswer(a) === normalizeShortAnswer(b);
}

function allDistinct(texts: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const t of texts) {
    const key = normalizeShortAnswer(t);
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * The values of a list of elements, when every single one of them is a number — else null.
 * Used for the one check issue #228 asks for by name (see `usableOrder`).
 */
function numbersOf(elements: readonly string[]): number[] | null {
  const values: number[] = [];
  for (const e of elements) {
    const v = parseCanonicalKey(plainMath(e)).value;
    if (v === null) return null;
    values.push(v);
  }
  return values;
}

/**
 * An order task, or null.
 *
 * Two rejections, both from issue #228, and both for the same reason: an order with more than
 * one right answer cannot be graded, and grading it anyway would reject a correct answer with
 * full authority (the mistake of issue #157).
 *
 *   · **Duplicates.** Two elements that read the same make two orders right at once. Compared
 *     folded (case, ß, punctuation), because "Wurzel" and "wurzel" are not two steps.
 *   · **Numbers that are not sorted.** If EVERY element is a number, the only order a school
 *     asks for is by size, so the list must be strictly monotonic — ascending or descending,
 *     both are real tasks. Ties are refused too: two equal numbers have no order between them.
 *     The price is that a numeric order by some other criterion cannot be written; that is the
 *     trade the issue asks for, and it buys a check that catches a wrong key before she ever
 *     sees the question.
 */
function usableOrder(task: OrderTask): OrderTask | null {
  if (!allDistinct(task.elements)) return null;
  const values = numbersOf(task.elements);
  if (values !== null) {
    const up = values.every((v, i) => i === 0 || v > (values[i - 1] as number));
    const down = values.every((v, i) => i === 0 || v < (values[i - 1] as number));
    if (!up && !down) return null;
  }
  return task;
}

/**
 * A pairing task, or null. Both columns must be free of duplicates: two identical right sides
 * make two assignments right, and two identical left sides are the same question twice. A pair
 * whose two sides read the same is no pairing either.
 */
function usablePairs(task: MatchPairsTask): MatchPairsTask | null {
  if (!allDistinct(task.pairs.map((p) => p.left))) return null;
  if (!allDistinct(task.pairs.map((p) => p.right))) return null;
  if (task.pairs.some((p) => same(p.left, p.right))) return null;
  return task;
}

/**
 * A grouping task, or null. Group names must differ (two groups with one name are one group),
 * every element must appear in exactly one group (an element in two groups has two right
 * answers), and the total number of elements must be the range issue #229 names — fewer than
 * four elements over two groups is not a sorting task, more than twelve does not fit the card.
 */
function usableGroups(task: MatchGroupsTask): MatchGroupsTask | null {
  if (!allDistinct(task.groups.map((g) => g.name))) return null;
  const members = task.groups.flatMap((g) => g.members);
  if (members.length < GROUP_MEMBERS_MIN || members.length > GROUP_MEMBERS_MAX) return null;
  if (!allDistinct(members)) return null;
  // An element that is also the name of a group would be two things on one board.
  if (members.some((m) => task.groups.some((g) => same(g.name, m)))) return null;
  return task;
}

/**
 * A table task, or null.
 *
 *   · every row as wide as the header (`usableFigure` holds a `table` figure to the same rule);
 *   · between one and `TABLE_GAPS_MAX` gaps — a table without a gap is a figure, not a question;
 *   · a `number` gap's key must really be a number, or `partVerdict` would compare a word with
 *     `numericVerdict` and come back "cannot tell" for an answer that is plainly right or wrong;
 *   · at least one cell printed in each row that holds a gap, so a gap has something to be
 *     read off. A row of nothing but gaps asks her to guess what the row is about.
 */
function usableTable(task: TableFillTask): TableFillTask | null {
  if (task.rows.some((r) => r.length !== task.header.length)) return null;
  const gaps = task.rows.flatMap((r) => r.filter((c) => c.cell === 'gap'));
  if (gaps.length < 1 || gaps.length > TABLE_GAPS_MAX) return null;
  for (const gap of gaps) {
    if (gap.cell !== 'gap') continue;
    if (gap.expect !== 'number') continue;
    for (const key of [gap.answer, ...gap.accepted]) {
      if (parseCanonicalKey(plainMath(key)).value === null) return null;
    }
  }
  const headed = task.header.some((h) => h.trim() !== '');
  for (const row of task.rows) {
    if (!row.some((c) => c.cell === 'gap')) continue;
    const printed = row.some((c) => c.cell === 'given' && c.text.trim() !== '');
    if (!printed && !headed) return null;
  }
  return computedTableHolds(task) ? task : null;
}

/** What a cell states as a number — whether it is printed or is a gap's key. */
function cellValue(cell: TableCell): number | null {
  const text = cell.cell === 'given' ? cell.text : cell.answer;
  return parseCanonicalKey(plainMath(text)).value;
}

/**
 * A table of values, recomputed (issue #230: "Jeder Wert wird aus der Funktion nachgerechnet").
 *
 * This is `keyCheck.ts` over a whole table (issue #157): where arithmetic makes the key decidable,
 * it is decided HERE — before the question is ever asked — rather than by rejecting her right
 * answer later with full authority. A single value that does not match means no question at all;
 * the model's arithmetic slip costs a question, never her trust in an answer she got right.
 *
 * Without `computed` the table is an ordinary table (a conjugation, a place-value table, a
 * comparison) whose key nothing can recompute, and this says nothing about it.
 */
function computedTableHolds(task: TableFillTask): boolean {
  const check = task.computed;
  if (check === null) return true;
  if (check.input_column === check.output_column) return false;
  if (check.input_column >= task.header.length || check.output_column >= task.header.length) {
    return false;
  }
  const fn = compileExpression(check.expr);
  if (fn === null) return false;
  // The declaration must be about the gaps: a "computed" table where the computed column holds
  // nothing to fill in is a claim about a column she never touches.
  if (!task.rows.some((r) => r[check.output_column]?.cell === 'gap')) return false;
  for (const row of task.rows) {
    const input = row[check.input_column];
    const output = row[check.output_column];
    if (input === undefined || output === undefined) return false;
    const x = cellValue(input);
    const y = cellValue(output);
    if (x === null || y === null) return false;
    const want = fn(x);
    if (!Number.isFinite(want)) return false;
    // Floating point, not tolerance for a wrong key — the same epsilon `keyCheck.ts` uses.
    if (Math.abs(want - y) > 1e-9 * Math.max(1, Math.abs(want))) return false;
  }
  return true;
}

/**
 * The task of a multi-part question, or null — and null means the question is not created at
 * all (`usableItems`), exactly as a fraction-bar question with impossible parameters yields no
 * question rather than a wrong one (issue #162).
 */
export function usablePartsTask(task: PartsTask): PartsTask | null {
  switch (task.form) {
    case 'order':
      return usableOrder(task);
    case 'match_pairs':
      return usablePairs(task);
    case 'match_groups':
      return usableGroups(task);
    case 'table_fill':
      return usableTable(task);
  }
}

// ─────────────── das Brett: was die App zeigt ───────────────

/**
 * The board of a task: the pieces with the refs the server issues from their position, in a
 * display order that is stable per question (`shuffle.ts`).
 *
 * Which parts are shuffled, and why exactly those:
 *   · `order` — the elements, and never into their own order: that order IS the solution
 *     (`shuffledAway`).
 *   · `match_pairs` — both columns, and the right column never into the left column's order:
 *     row 1 next to row 1 would be the answer laid out.
 *   · `match_groups` — the elements, and never into the key's order (which lists one group's
 *     members after another). The group names are labels; their order gives nothing away.
 *   · `table_fill` — nothing. A table has a fixed shape, and the gaps are numbered in reading
 *     order, which is also the order she tabs through them.
 */
export function boardOf(task: PartsTask, itemId: string): PartsBoard {
  const seed = seedOf(itemId);
  switch (task.form) {
    case 'order': {
      const pieces = task.elements.map((text, i) => ({ ref: `e${i + 1}`, text }));
      return { form: 'order', elements: shuffledAway(pieces, seed) };
    }
    case 'match_pairs': {
      const left = task.pairs.map((p, i) => ({ ref: `l${i + 1}`, text: p.left }));
      const right = task.pairs.map((p, i) => ({ ref: `r${i + 1}`, text: p.right }));
      const shownLeft = stableShuffle(left, seed);
      let shownRight = stableShuffle(right, seedOf(`${itemId}r`));
      // The two columns in the same order would put each pair in one row.
      if (shownRight.every((p, i) => p.ref.slice(1) === shownLeft[i]?.ref.slice(1))) {
        shownRight = [...shownRight.slice(1), shownRight[0] as (typeof shownRight)[number]];
      }
      return { form: 'match_pairs', left: shownLeft, right: shownRight };
    }
    case 'match_groups': {
      const groups = task.groups.map((g, i) => ({ ref: `g${i + 1}`, text: g.name }));
      const elements = task.groups.flatMap((g, gi) =>
        g.members.map((text, mi) => ({ ref: refOfMember(task, gi, mi), text })),
      );
      return { form: 'match_groups', groups, elements: shuffledAway(elements, seed) };
    }
    case 'table_fill': {
      let n = 0;
      return {
        form: 'table_fill',
        header: [...task.header],
        rows: task.rows.map((row) =>
          row.map((c) =>
            c.cell === 'given'
              ? ({ cell: 'given', text: c.text } as const)
              : ({ cell: 'gap', ref: `c${++n}`, expect: c.expect } as const),
          ),
        ),
      };
    }
  }
}

/** `e1`, `e2` … over all groups in the order the task writes them. */
function refOfMember(task: MatchGroupsTask, group: number, member: number): string {
  let n = 0;
  for (let g = 0; g < group; g++) n += task.groups[g]?.members.length ?? 0;
  return `e${n + member + 1}`;
}

// ─────────────── ihre Antwort lesen ───────────────

/** One gap of a table, with where it sits and what belongs in it. */
type Gap = {
  ref: string;
  row: number;
  col: number;
  expect: 'number' | 'word';
  answer: string;
  accepted: readonly string[];
};

function gapsOf(task: TableFillTask): Gap[] {
  const out: Gap[] = [];
  task.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.cell !== 'gap') return;
      out.push({
        ref: `c${out.length + 1}`,
        row: r,
        col: c,
        expect: cell.expect,
        answer: cell.answer,
        accepted: cell.accepted,
      });
    }),
  );
  return out;
}

/** What she put where: slot → value, with exactly the slots the task has. */
export type FilledParts = ReadonlyMap<string, string>;

/**
 * Her answer, read against the task — or null when it is not a shape this question offered.
 *
 * The server takes exactly the slots of this question, each once, with a value out of exactly
 * the vocabulary this question issued: a position may hold one of ITS elements and every element
 * exactly once, a left side one of ITS right sides and every right side exactly once, an element
 * one of ITS groups, a gap her own text. Nothing else gets in — not a slot from another
 * question, not an element twice, not an extra part. (CLAUDE.md rule 2: everything but a gap's
 * text is an alias the server itself issued, resolved here.)
 *
 * Every slot must be filled. A half-filled board is not a weaker answer, it is an answer that
 * was not given yet — and the app keeps "Prüfen" off until the board is complete, the same way
 * an empty answer field has never been submittable.
 */
export function readParts(task: PartsTask, parts: readonly AnswerPart[]): FilledParts | null {
  const filled = new Map<string, string>();
  for (const p of parts) {
    if (filled.has(p.slot)) return null;
    filled.set(p.slot, p.value);
  }
  const exactly = (slots: readonly string[]): boolean =>
    filled.size === slots.length && slots.every((s) => filled.has(s));
  const permutation = (slots: readonly string[], values: readonly string[]): boolean => {
    const used = new Set<string>();
    for (const s of slots) {
      const v = filled.get(s);
      if (v === undefined || !values.includes(v) || used.has(v)) return false;
      used.add(v);
    }
    return true;
  };
  switch (task.form) {
    case 'order': {
      const slots = task.elements.map((_, i) => `p${i + 1}`);
      const values = task.elements.map((_, i) => `e${i + 1}`);
      return exactly(slots) && permutation(slots, values) ? filled : null;
    }
    case 'match_pairs': {
      const slots = task.pairs.map((_, i) => `l${i + 1}`);
      const values = task.pairs.map((_, i) => `r${i + 1}`);
      return exactly(slots) && permutation(slots, values) ? filled : null;
    }
    case 'match_groups': {
      const slots = task.groups.flatMap((g, gi) =>
        g.members.map((_, mi) => refOfMember(task, gi, mi)),
      );
      const values = task.groups.map((_, i) => `g${i + 1}`);
      if (!exactly(slots)) return null;
      return slots.every((s) => values.includes(filled.get(s) ?? '')) ? filled : null;
    }
    case 'table_fill': {
      const gaps = gapsOf(task);
      if (!exactly(gaps.map((g) => g.ref))) return null;
      return gaps.every((g) => (filled.get(g.ref) ?? '').trim() !== '') ? filled : null;
    }
  }
}

// ─────────────── prüfen ───────────────

/** The one place she can look next. Never a list of them (see the head of this file). */
export type PartsPlace =
  /** `order`: the first step that no longer fits (1-based, the way she counts them). */
  | { at: 'step'; step: number }
  /** `match`: one piece, named by the text she sees on the board. */
  | { at: 'piece'; piece: string }
  /**
   * `table_fill`: one gap, named by its column heading and the row's own label where the table
   * has them, else by its coordinates. `rule` and `typo` carry what kind of miss it was, so a
   * slip in a cell gets exactly the sentence a slip in the answer field gets (issue #207) — a
   * cell is not a smaller question with vaguer feedback.
   */
  | {
      at: 'cell';
      column: string | null;
      columnNumber: number;
      row: string | null;
      rowNumber: number;
      rule: RuleVerdict;
      typo: TypoShape | null;
    };

export type PartsCheck = {
  form: PartsForm;
  /** How many parts hold. For `order` this is the length of the correct PREFIX (see below). */
  held: number;
  total: number;
  /** `partly` when at least one part holds and not all of them do. */
  verdict: 'correct' | 'partly' | 'wrong';
  place: PartsPlace | null;
};

/**
 * Her answer against the task, part by part. No model, in any branch.
 *
 * `order` is measured as a PREFIX, not as a count of matching positions: someone who has the
 * right sequence but starts one too late has every position "wrong" while knowing the order, and
 * "bis Schritt 3 stimmt alles" is the sentence a learner can act on. It is the same measure
 * `steps.ts` uses for a written calculation, for the same reason.
 *
 * A prefix also cannot leak the answer: with a permutation of n elements, a correct prefix of
 * n−1 forces the last one too, so `held` is never n−1 — the step it names always has at least
 * two candidates left. The same holds for the pair count: a bijection can never have exactly
 * n−1 pairs right.
 */
export function checkParts(
  task: PartsTask,
  filled: FilledParts,
  itemId: string,
  base: Pick<ItemForCheck, 'subject_kind'>,
): PartsCheck {
  const board = boardOf(task, itemId);
  switch (task.form) {
    case 'order': {
      const total = task.elements.length;
      let held = 0;
      while (held < total && filled.get(`p${held + 1}`) === `e${held + 1}`) held += 1;
      return {
        form: 'order',
        held,
        total,
        verdict: held === total ? 'correct' : held > 0 ? 'partly' : 'wrong',
        place: held === total ? null : { at: 'step', step: held + 1 },
      };
    }
    case 'match_pairs': {
      const total = task.pairs.length;
      const right = (i: number) => filled.get(`l${i + 1}`) === `r${i + 1}`;
      const held = task.pairs.filter((_, i) => right(i)).length;
      // Named in the order the board shows the left column, so "the first one" is the first one
      // she sees rather than the first one the model happened to write.
      const shown = board.form === 'match_pairs' ? board.left : [];
      const wrong = shown.find((p) => !right(Number(p.ref.slice(1)) - 1));
      return {
        form: 'match_pairs',
        held,
        total,
        verdict: held === total ? 'correct' : held > 0 ? 'partly' : 'wrong',
        place: wrong ? { at: 'piece', piece: wrong.text } : null,
      };
    }
    case 'match_groups': {
      const slots = task.groups.flatMap((g, gi) =>
        g.members.map((_, mi) => ({ ref: refOfMember(task, gi, mi), group: `g${gi + 1}` })),
      );
      const total = slots.length;
      const held = slots.filter((s) => filled.get(s.ref) === s.group).length;
      const shown = board.form === 'match_groups' ? board.elements : [];
      const wrong = shown.find((e) => {
        const want = slots.find((s) => s.ref === e.ref);
        return want !== undefined && filled.get(e.ref) !== want.group;
      });
      return {
        form: 'match_groups',
        held,
        total,
        verdict: held === total ? 'correct' : held > 0 ? 'partly' : 'wrong',
        place: wrong ? { at: 'piece', piece: wrong.text } : null,
      };
    }
    case 'table_fill': {
      const gaps = gapsOf(task);
      const verdicts = gaps.map((g) =>
        partVerdict(base, g.expect, g.answer, g.accepted, filled.get(g.ref) ?? ''),
      );
      const held = verdicts.filter((v) => v === 'correct').length;
      const firstWrong = verdicts.findIndex((v) => v !== 'correct');
      const gap = firstWrong >= 0 ? (gaps[firstWrong] as Gap) : null;
      const rule = firstWrong >= 0 ? (verdicts[firstWrong] as RuleVerdict) : 'unknown';
      return {
        form: 'table_fill',
        held,
        total: gaps.length,
        verdict: held === gaps.length ? 'correct' : held > 0 ? 'partly' : 'wrong',
        place: gap
          ? {
              at: 'cell',
              column: (task.header[gap.col] ?? '').trim() || null,
              columnNumber: gap.col + 1,
              row: rowLabelOf(task, gap.row),
              rowNumber: gap.row + 1,
              rule,
              typo:
                rule === 'typo'
                  ? typoShapeFor(
                      { answer: gap.answer, accepted_answers: [...gap.accepted] },
                      filled.get(gap.ref) ?? '',
                    )
                  : null,
            }
          : null,
      };
    }
  }
}

/** The row's own label: the first cell printed in it, where the table has one. */
function rowLabelOf(task: TableFillTask, row: number): string | null {
  for (const cell of task.rows[row] ?? []) {
    if (cell.cell === 'given' && cell.text.trim() !== '') return cell.text.trim();
  }
  return null;
}

// ─────────────── in Worten: Lösung und ihre Antwort ───────────────

/**
 * The solution as one line — what goes into `items.answer`.
 *
 * It is stored there rather than only in the task so that everything built around a key keeps
 * working untouched: "Lösung zeigen", the material list, the leak check that drops a hint
 * stating the answer, the dispute flow. The sizes in `contracts/parts.ts` are chosen so the
 * longest allowed task of every form still fits that column.
 */
export function solutionOfParts(task: PartsTask): string {
  switch (task.form) {
    case 'order':
      return task.elements.join(' → ');
    case 'match_pairs':
      return task.pairs.map((p) => `${p.left} – ${p.right}`).join('; ');
    case 'match_groups':
      return task.groups.map((g) => `${g.name}: ${g.members.join(', ')}`).join(' · ');
    case 'table_fill':
      return gapsOf(task)
        .map((g) => g.answer)
        .join('; ');
  }
}

/**
 * Her answer as one line — what goes into the learner's turn (`practice_turns.text`), so the
 * conversation stays readable, a later reader can see what she actually did, and
 * `disputeVerdict` has the same thing in front of it that she had.
 *
 * Written in the same shape as the solution, so the two lines above each other in the thread can
 * be compared by eye.
 */
export function writtenParts(task: PartsTask, filled: FilledParts): string {
  switch (task.form) {
    case 'order':
      return task.elements
        .map((_, i) => {
          const ref = filled.get(`p${i + 1}`) ?? '';
          return task.elements[Number(ref.slice(1)) - 1] ?? '?';
        })
        .join(' → ');
    case 'match_pairs':
      return task.pairs
        .map((p, i) => {
          const ref = filled.get(`l${i + 1}`) ?? '';
          return `${p.left} – ${task.pairs[Number(ref.slice(1)) - 1]?.right ?? '?'}`;
        })
        .join('; ');
    case 'match_groups':
      return task.groups
        .map((g, gi) => {
          const mine = task.groups.flatMap((other, oi) =>
            other.members.filter((_, mi) => filled.get(refOfMember(task, oi, mi)) === `g${gi + 1}`),
          );
          return `${g.name}: ${mine.join(', ')}`;
        })
        .join(' · ');
    case 'table_fill':
      return gapsOf(task)
        .map((g) => filled.get(g.ref) ?? '')
        .join('; ');
  }
}

/** Does this question's answer have several parts? Re-exported so callers need one import. */
export { hasSeveralParts };
