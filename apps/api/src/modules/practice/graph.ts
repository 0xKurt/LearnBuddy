// Schemata und Bäume: Frage, Zeichnung, Schlüssel, Tipps und Lösungsweg, alles von Code
// (issues #247 und #256).
//
// Das Modell liefert den Graphen als Daten (`GraphTask`, `contracts/graph.ts`); alles, was eine
// Lernende sieht oder woran sie gemessen wird, steht hier — dieselbe Teilung wie bei Bruchbalken
// (`bars.ts`, #162) und Notenzeile (`staff.ts`, #226). Ein Schlüssel, der AUS dem gezeichneten
// Graphen gerechnet ist, kann dem Bild nicht widersprechen.
//
// Was Code prüft, bevor es eine Frage gibt (Regel 0, Erzeugung):
//   · Schema: eindeutige Kästchen, keine Kante ins Leere, alles hängt zusammen, ein Kreislauf
//     ist geschlossen, eine Kette ohne Zyklus, die Lückenantwort steht nirgends sonst sichtbar
//     (`diagramGraph`), und das Layout passt auf 360 pt ohne Überlappung (`diagramLayout`).
//   · Baumdiagramm: die Äste jedes Knotens summieren sich EXAKT zu 1 (Brüche, kein Gleitkomma);
//     Pfad- und Gesamtwahrscheinlichkeit rechnet Code (`probTree`).
//   · Stammbaum: Code zählt alle Genotyp-Belegungen für alle vier Erbgänge durch
//     (`genotypeSets`). Der Erbgang, den das Modell nennt, muss der EINZIGE verträgliche sein —
//     sonst ist die Aufgabe mehrdeutig oder falsch, und sie entsteht nicht. Ein Genotyp wird nur
//     gefragt, wenn genau einer möglich ist.
//   · Automat: deterministisch, erreichbar, und ob das Wort angenommen wird, rechnet Code. Sagt
//     das Modell etwas anderes, entsteht keine Frage.
//
// Wie geantwortet wird (Regel 0, Antwort) — immer über eine Form, die Code ganz entscheidet:
//   · Lücke im Schema → `table_fill` (je Lücke ein Feld, `partVerdict`);
//   · Reihenfolge → `order` (#228); Pfeil-Beschriftung → `match_pairs` (#229);
//   · Wahrscheinlichkeit → `numeric`, jede Schreibweise desselben Werts zählt (`form_free`);
//   · Erbgang, Genotyp, „angenommen?" → `multiple_choice`.
//
// Der Genotyp wird angetippt und nicht getippt, obwohl #256 „Text gegen eine Liste" vorschlägt:
// „aa" und „Aa" unterscheiden sich nur in der Großschreibung, und genau die behandeln die
// Textregeln als Beinahe-Treffer (`writtenAgainst`, 'spelling'/'folded'). Ein Genotyp, bei dem
// ein Großbuchstabe das ganze Urteil ist, darf nicht durch diese Tür.

import {
  DIAGRAM_NODES_MAX,
  GraphTask,
  automatonLayout,
  automatonOf,
  diagramGraph,
  diagramLayout,
  formatRatio,
  genotypeOptions,
  genotypeSets,
  genotypeText,
  MODES,
  modeFits,
  pathWords,
  pedigreeLayout,
  pedigreeOf,
  probTree,
  probTreeLayout,
  ratio,
  addR,
  runWord,
  walkOrder,
  type AutomatonFigure,
  type DiagramFigure,
  type DiagramTask,
  type DfaTask,
  type Figure,
  type InheritanceMode,
  type PartsTask,
  type PedigreeFigure,
  type PedigreeTask,
  type ProbTask,
  type ProbTreeFigure,
  type Ratio,
} from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';

/**
 * Wie viele Schema- und Baumfragen in einem Satz stehen dürfen. Vier: eine Figur dieser Art
 * braucht Zeit zum Lesen, und ein Übungssatz hat 6–10 Fragen — mehr wäre eine Sammlung von
 * Bildern statt einer Übung.
 */
export const MAX_GRAPH_ITEMS = 4;

/**
 * Was dem Generator über Schemata und Bäume gesagt wird. Wie `STAFF_RULES`: was das Modell
 * WÄHLEN darf, und dass es keinen Fragetext, Schlüssel und keine Figur schreibt. Kategorien und
 * Verbote, kein ausgeschriebenes Beispiel.
 */
export const GRAPH_RULES = `Diagrams and trees ("graphs"): boxes with arrows (a cycle, a food chain or web, a control loop, a process chain), a probability tree, a family pedigree, or a finite automaton — as data, with short ids like n1, n2 that you choose. The app lays it out, draws it, writes the question and computes the solution, so never write a question text, an answer or a figure for one, and never put one in "figure". Box texts are short (a few words); every arrow joins two boxes that exist. For a probability tree the branches of every node add up to exactly 1. For a pedigree name the one mode of inheritance it shows; the server checks all four and drops a pedigree that fits more than one. For an automaton say whether it accepts the word; the server runs it. At most ${MAX_GRAPH_ITEMS}, and an empty list wherever a diagram would only be decoration. The ordinary questions in "items" are unaffected.`;

/** An item whose every field was computed from `graph_task`; `insertItems` stores both. */
export type GraphItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
  graph_task: GraphTask;
};

// ─────────────── Worte ───────────────

type SuffixOf<T> = T extends `practice.graph.${infer S}` ? S : never;
type GraphMessage = SuffixOf<MessageKey>;

function text(locale: string, suffix: GraphMessage, vars: Record<string, string | number> = {}) {
  return t(locale, `practice.graph.${suffix}`, vars);
}

function modeWord(locale: string, mode: InheritanceMode): string {
  return text(locale, `mode.${mode}` as GraphMessage);
}

/** „„Wolke"" — quoted the way her language quotes. */
function quoted(locale: string, s: string): string {
  return text(locale, 'quote', { text: s });
}

const COMMON = {
  accepted_answers: [] as string[],
  unit: null,
  prompt_lang: null,
  lang: null,
  tolerance: null,
  spelling: null,
  source_excerpt: null,
  curriculum_point: null,
  rubric: null,
  listen_task: null,
} as const;

// ─────────────── Schema (#247) ───────────────

function diagramItem(task: DiagramTask, locale: string): GraphItem | null {
  const graph = diagramGraph(task);
  if (graph === null) return null;
  const n = graph.nodes.length;
  const common = { ...COMMON, graph_task: task as GraphTask, topic: task.title };
  if (task.ask === 'gap') {
    // The gaps are numbered in the order of the boxes, and the table asks for them in that order.
    const gaps = [...graph.gaps].sort((a, b) => a - b);
    const number = new Map(gaps.map((g, k) => [g, k + 1]));
    const labelled = graph.edges.filter((e) => e.label !== '');
    const figure: DiagramFigure = {
      type: 'diagram',
      shape: task.shape,
      boxes: graph.nodes.map((text, i) =>
        number.has(i) ? { text: String(number.get(i)), blank: true } : { text, blank: false },
      ),
      arrows: graph.edges.map((e) => ({
        from: e.from,
        to: e.to,
        tag: e.label === '' ? '' : String(labelled.indexOf(e) + 1),
      })),
      legend: labelled.map((e) => e.label),
    };
    if (!diagramLayout(figure).fits) return null;
    const parts: PartsTask = {
      form: 'table_fill',
      header: [text(locale, 'gap_box'), text(locale, 'gap_word')],
      rows: gaps.map((g, k) => [
        { cell: 'given', text: text(locale, 'gap_row', { n: k + 1 }) },
        { cell: 'gap', expect: 'word', answer: graph.nodes[g] as string, accepted: [] },
      ]),
      computed: null,
    };
    const answer = gaps.map((g) => graph.nodes[g] as string).join('; ');
    return {
      ...common,
      kind: 'table_fill',
      // The title is not repeated here: it stands right above as the question's topic.
      prompt: text(locale, gaps.length === 1 ? 'gap_prompt_one' : 'gap_prompt'),
      answer,
      choices: null,
      correct_choice: null,
      difficulty: gaps.length > 1 ? 3 : 2,
      figure,
      parts_task: parts,
      hints: [text(locale, 'hint_gap_arrows'), text(locale, 'hint_gap_neighbours')],
      worked_solution: text(locale, 'worked_gap', {
        list: gaps
          .map((g, k) =>
            text(locale, 'worked_gap_one', { n: k + 1, word: graph.nodes[g] as string }),
          )
          .join(' '),
      }),
    };
  }
  if (task.ask === 'order') {
    if (task.shape === 'web') return null;
    const walk = walkOrder(graph, task.shape);
    if (walk.length !== n) return null;
    // A cycle has no first box: its first box is drawn with its words and the rest are ordered
    // from there. A chain is ordered whole.
    const given = task.shape === 'cycle' ? 1 : 0;
    const place = new Map(walk.map((v, k) => [v, k]));
    const figure: DiagramFigure = {
      type: 'diagram',
      shape: task.shape,
      boxes: graph.nodes.map((_, i) => {
        const k = place.get(i) as number;
        return k < given
          ? { text: graph.nodes[i] as string, blank: false }
          : { text: String(k + 1 - given), blank: true };
      }),
      // Unlabelled on purpose: a label between two boxes would give the order away.
      arrows: graph.edges.map((e) => ({ from: e.from, to: e.to, tag: '' })),
      legend: [],
    };
    if (!diagramLayout(figure).fits) return null;
    // A chain is drawn as nothing but numbered empty boxes in a row — exactly what the board
    // below already shows, so it is left out instead of shown twice. A cycle keeps its drawing:
    // its shape and its one given box are what the board cannot say.
    const drawn = task.shape === 'cycle' ? figure : null;
    const elements = walk.slice(given).map((v) => graph.nodes[v] as string);
    if (elements.length < 3) return null;
    const first = graph.nodes[walk[0] as number] as string;
    return {
      ...common,
      kind: 'order',
      prompt:
        task.shape === 'cycle'
          ? text(locale, 'order_cycle_prompt', { first: quoted(locale, first) })
          : text(locale, 'order_chain_prompt'),
      answer: elements.join(' → '),
      choices: null,
      correct_choice: null,
      difficulty: elements.length > 5 ? 3 : 2,
      figure: drawn,
      parts_task: { form: 'order', elements },
      hints: [text(locale, 'hint_order_start'), text(locale, 'hint_order_next')],
      worked_solution: text(locale, 'worked_order', {
        list: walk.map((v) => graph.nodes[v] as string).join(' → '),
      }),
    };
  }
  // label: the arrows carry numbers, and the labels are matched to them.
  const labelled = graph.edges.filter((e) => e.label !== '');
  const figure: DiagramFigure = {
    type: 'diagram',
    shape: task.shape,
    boxes: graph.nodes.map((text) => ({ text, blank: false })),
    arrows: graph.edges.map((e) => ({
      from: e.from,
      to: e.to,
      tag: e.label === '' ? '' : String(labelled.indexOf(e) + 1),
    })),
    legend: [],
  };
  if (!diagramLayout(figure).fits) return null;
  const pairs = labelled.map((e, k) => ({
    left: text(locale, 'arrow_n', { n: k + 1 }),
    right: e.label,
  }));
  return {
    ...common,
    kind: 'match',
    prompt: text(locale, 'label_prompt'),
    answer: pairs.map((p) => `${p.left} – ${p.right}`).join('; '),
    choices: null,
    correct_choice: null,
    difficulty: 3,
    figure,
    parts_task: { form: 'match_pairs', pairs },
    hints: [text(locale, 'hint_label_from_to'), text(locale, 'hint_label_sure_first')],
    worked_solution: text(locale, 'worked_label', {
      list: labelled
        .map((e, k) =>
          text(locale, 'worked_label_one', {
            n: k + 1,
            from: graph.nodes[e.from] as string,
            to: graph.nodes[e.to] as string,
            label: e.label,
          }),
        )
        .join(' '),
    }),
  };
}

// ─────────────── Baumdiagramm (#256) ───────────────

/** Ein Bruch, wie er in Worten erscheint: „1/6" oder „0,25" in ihrer Schreibweise. */
function shown(locale: string, r: Ratio, decimal: boolean): string {
  const s = formatRatio(r, decimal);
  return locale === 'en' ? s : s.replace('.', ',');
}

function probItem(task: ProbTask, locale: string): GraphItem | null {
  const tree = probTree(task);
  if (tree === null) return null;
  const index = new Map(tree.nodes.map((n, k) => [n.id, k]));
  const targets = task.targets.map((id) => index.get(id));
  if (targets.some((k) => k === undefined)) return null;
  const ks = targets as number[];
  if (new Set(ks).size !== ks.length) return null;
  const isLeaf = (k: number) => !tree.nodes.some((n) => n.parent === k);
  const allDecimal = tree.nodes.every((n) => n.decimal);
  const common = { ...COMMON, graph_task: task as GraphTask, topic: task.title };
  if (task.ask === 'path') {
    if (!ks.every(isLeaf)) return null;
    // Two leaves with the same words along the way would be two paths she cannot tell apart.
    const leaves = tree.nodes.map((_, k) => k).filter(isLeaf);
    const named = leaves.map((k) => pathWords(tree, k).join(' – '));
    if (new Set(named).size !== named.length) return null;
    const figure: ProbTreeFigure = {
      type: 'prob_tree',
      nodes: tree.nodes.map((n) => ({
        text: n.text,
        parent: n.parent,
        p: formatRatio(n.p, n.decimal),
      })),
    };
    if (!probTreeLayout(figure).fits) return null;
    let sum: Ratio = ratio(0n, 1n);
    for (const k of ks) sum = addR(sum, tree.path[k] as Ratio);
    const answer = formatRatio(sum, allDecimal);
    const paths = ks.map((k) => quoted(locale, pathWords(tree, k).join(' – ')));
    const products = ks.map((k) => {
      const factors: string[] = [];
      let at = k;
      while (at >= 0) {
        const node = tree.nodes[at] as ProbTree['nodes'][number];
        factors.unshift(shown(locale, node.p, node.decimal));
        at = node.parent;
      }
      return `${factors.join(' · ')} = ${shown(locale, tree.path[k] as Ratio, allDecimal)}`;
    });
    return {
      ...common,
      kind: 'numeric',
      prompt: text(locale, ks.length === 1 ? 'path_prompt_one' : 'path_prompt', {
        paths: paths.join(text(locale, 'or')),
      }),
      answer,
      choices: null,
      correct_choice: null,
      difficulty: ks.length > 1 ? 4 : 3,
      figure,
      parts_task: null,
      hints:
        ks.length > 1
          ? [text(locale, 'hint_path_multiply'), text(locale, 'hint_path_add')]
          : [text(locale, 'hint_path_follow'), text(locale, 'hint_path_multiply')],
      worked_solution: text(locale, ks.length > 1 ? 'worked_paths' : 'worked_path', {
        products: products.join('; '),
        answer: shown(locale, sum, allDecimal),
      }),
    };
  }
  // gap: the branch into one node shows "?", and its probability is the answer.
  if (ks.length !== 1) return null;
  const k = ks[0] as number;
  const node = tree.nodes[k] as ProbTree['nodes'][number];
  const figure: ProbTreeFigure = {
    type: 'prob_tree',
    nodes: tree.nodes.map((n, i) => ({
      text: n.text,
      parent: n.parent,
      p: i === k ? '?' : formatRatio(n.p, n.decimal),
    })),
  };
  if (!probTreeLayout(figure).fits) return null;
  const siblings = tree.nodes.filter((n, i) => n.parent === node.parent && i !== k);
  return {
    ...common,
    kind: 'numeric',
    prompt: text(locale, 'branch_prompt'),
    answer: formatRatio(node.p, node.decimal),
    choices: null,
    correct_choice: null,
    difficulty: 2,
    figure,
    parts_task: null,
    hints: [text(locale, 'hint_branch_sum'), text(locale, 'hint_branch_subtract')],
    worked_solution: text(locale, 'worked_branch', {
      others: siblings.map((s) => shown(locale, s.p, s.decimal)).join(' − '),
      answer: shown(locale, node.p, node.decimal),
    }),
  };
}

type ProbTree = NonNullable<ReturnType<typeof probTree>>;

// ─────────────── Stammbaum (#256) ───────────────

/** Die Optionen einer Auswahl mit dem Index der richtigen. */
function multi(words: readonly string[], right: number) {
  if (new Set(words).size !== words.length) return null;
  return { choices: [...words], correct_choice: right, answer: words[right] as string };
}

/**
 * Eine Familie (Paar und Kinder), die für sich allein schon nicht zu diesem Erbgang passt — der
 * Grund, den die Lösung nennt. Null, wenn erst der ganze Baum ihn ausschließt.
 */
function breakingFamily(
  ped: NonNullable<ReturnType<typeof pedigreeOf>>,
  mode: InheritanceMode,
): { a: number; b: number; kids: number[] } | null {
  for (const [i, p] of ped.people.entries()) {
    if (p.spouse <= i) continue;
    const kids = ped.people.map((_, k) => k).filter((k) => ped.people[k]?.parents.includes(i));
    if (kids.length === 0) continue;
    const members = [i, p.spouse, ...kids];
    const remap = new Map(members.map((m, k) => [m, k]));
    const small = {
      people: members.map((m) => {
        const q = ped.people[m] as (typeof ped.people)[number];
        return {
          ...q,
          parents: kids.includes(m) ? q.parents.map((x) => remap.get(x) as number) : [],
          spouse: -1,
        };
      }),
      generation: members.map((m) => (kids.includes(m) ? 1 : 0)),
    };
    if (!modeFits(small, mode)) return { a: i, b: p.spouse, kids };
  }
  return null;
}

function pedigreeItem(task: PedigreeTask, locale: string): GraphItem | null {
  const ped = pedigreeOf(task);
  if (ped === null) return null;
  const fitting = MODES.filter((m) => modeFits(ped, m));
  // The model's key must be the ONLY mode the drawing allows (#256): none is a contradiction,
  // two or more an ambiguous task — and either way no question.
  if (fitting.length !== 1 || fitting[0] !== task.mode) return null;
  const figure: PedigreeFigure = {
    type: 'pedigree',
    people: ped.people.map((p) => ({
      sex: p.sex,
      ill: p.ill,
      parents: p.parents,
      spouse: p.spouse,
    })),
  };
  if (!pedigreeLayout(figure).fits) return null;
  const common = {
    ...COMMON,
    graph_task: task as GraphTask,
    topic: text(locale, 'topic_pedigree'),
    figure,
    parts_task: null,
  };
  if (task.ask === 'mode') {
    if (task.targets.length !== 0) return null;
    const words = MODES.map((m) => modeWord(locale, m));
    const picked = multi(words, MODES.indexOf(task.mode));
    if (picked === null) return null;
    const reasons = MODES.filter((m) => m !== task.mode).map((m) => {
      const fam = breakingFamily(ped, m);
      return fam === null
        ? text(locale, 'worked_mode_whole', { mode: modeWord(locale, m) })
        : text(locale, 'worked_mode_family', {
            mode: modeWord(locale, m),
            a: fam.a + 1,
            b: fam.b + 1,
            kids: fam.kids.map((k) => k + 1).join(', '),
          });
    });
    return {
      ...common,
      kind: 'multiple_choice',
      prompt: text(locale, 'mode_prompt'),
      ...picked,
      difficulty: 4,
      hints: [text(locale, 'hint_mode_parents'), text(locale, 'hint_mode_sons')],
      worked_solution: `${reasons.join(' ')} ${text(locale, 'worked_mode_left', { mode: picked.answer })}`,
    };
  }
  if (task.targets.length !== 1) return null;
  const who = ped.people.findIndex((p) => p.id === task.targets[0]);
  if (who < 0) return null;
  const person = ped.people[who] as (typeof ped.people)[number];
  const possible = genotypeSets(ped, task.mode)[who] as Set<number>;
  // Asked only when the drawing leaves exactly one genotype; "AA or Aa" is not a key.
  if (possible.size !== 1) return null;
  const d = [...possible][0] as number;
  const words = genotypeOptions(task.mode, person.sex);
  const right = words.indexOf(genotypeText(task.mode, person.sex, d));
  const picked = multi(words, right);
  if (picked === null || right < 0) return null;
  return {
    ...common,
    kind: 'multiple_choice',
    prompt: text(locale, 'genotype_prompt', { n: who + 1, mode: modeWord(locale, task.mode) }),
    ...picked,
    difficulty: 4,
    hints: [
      text(locale, person.ill ? 'hint_genotype_ill' : 'hint_genotype_well'),
      text(locale, 'hint_genotype_family'),
    ],
    worked_solution: text(locale, 'worked_genotype', {
      n: who + 1,
      mode: modeWord(locale, task.mode),
      answer: picked.answer,
    }),
  };
}

// ─────────────── Automat (#256) ───────────────

function dfaItem(task: DfaTask, locale: string): GraphItem | null {
  const a = automatonOf(task);
  if (a === null) return null;
  const trail = runWord(a, task.word);
  // A move the word needs is missing: whether that means "rejected" is a convention, not a fact.
  if (trail === null) return null;
  const accepted = a.accept[trail[trail.length - 1] as number] === true;
  // The model's claim, checked: a different answer means it misread its own automaton.
  if (accepted !== task.accepts) return null;
  const figure: AutomatonFigure = {
    type: 'automaton',
    states: a.accept.map((accept) => ({ accept })),
    moves: a.moves,
  };
  if (!automatonLayout(figure).fits) return null;
  const words = [text(locale, 'accept_yes'), text(locale, 'accept_no')];
  const picked = multi(words, accepted ? 0 : 1);
  if (picked === null) return null;
  const steps = trail
    .slice(1)
    .map((s, k) => `–${task.word[k] as string}→ q${s}`)
    .join(' ');
  const end = trail[trail.length - 1] as number;
  return {
    ...COMMON,
    graph_task: task,
    topic: text(locale, 'topic_dfa'),
    kind: 'multiple_choice',
    prompt: text(locale, 'dfa_prompt', { word: task.word }),
    ...picked,
    difficulty: task.word.length > 4 ? 3 : 2,
    figure,
    parts_task: null,
    hints: [text(locale, 'hint_dfa_start'), text(locale, 'hint_dfa_end')],
    worked_solution: text(locale, accepted ? 'worked_dfa_yes' : 'worked_dfa_no', {
      trail: `q0 ${steps}`,
      end: `q${end}`,
    }),
  };
}

// ─────────────── zusammen ───────────────

/**
 * Die Frage, die eine geprüfte Aufgabe wird, oder null. Null ist das Schlimmste, was passieren
 * kann: eine Frage, die das Modell verliert, nie ein Urteil, das ein Kind verliert.
 */
export function graphItem(raw: GraphTask, locale: string): GraphItem | null {
  switch (raw.g) {
    case 'diagram':
      return raw.nodes.length > DIAGRAM_NODES_MAX ? null : diagramItem(raw, locale);
    case 'prob':
      return probItem(raw, locale);
    case 'pedigree':
      return pedigreeItem(raw, locale);
    case 'dfa':
      return dfaItem(raw, locale);
  }
}

export function graphItems(tasks: readonly GraphTask[], locale: string): GraphItem[] {
  return tasks.slice(0, MAX_GRAPH_ITEMS).flatMap((task) => {
    const item = graphItem(task, locale);
    return item ? [item] : [];
  });
}

/** The task a stored row carries, or null (an unreadable column is no task, never a guess). */
export function graphTaskOf(stored: unknown): GraphTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = GraphTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * Die feste, freundliche Zeile nach einer falschen Antwort — ohne Modell, aus demselben Grund
 * wie `staffAgain`: der Tutor SIEHT die Zeichnung nicht, und ein Modell, das über ein Bild
 * schreibt, das es nicht hat, erzeugt die sicher klingende Falschaussage, die Regel 5 verbietet.
 * Code weiß, wo sie hinschauen muss.
 */
export function graphAgain(locale: string, task: GraphTask): string {
  switch (task.g) {
    case 'diagram':
      return text(
        locale,
        task.ask === 'gap' ? 'again_gap' : task.ask === 'order' ? 'again_order' : 'again_label',
      );
    case 'prob':
      return text(locale, task.ask === 'path' ? 'again_path' : 'again_branch');
    case 'pedigree':
      return text(locale, task.ask === 'mode' ? 'again_mode' : 'again_genotype');
    case 'dfa':
      return text(locale, 'again_dfa');
  }
}
