// Schemata und Bäume: Kästchen mit Pfeilen, Baumdiagramm, Stammbaum, Automat
// (issues #247 und #256, Bausteine FIG_SCHEMA und FIG_BAUM der Analyse #224).
//
// Dieselbe Bauweise wie Bruchbalken (`bars.ts`, #162) und Notenzeile (`staff.ts`, #226):
// **das Modell liefert den Graphen als Daten, Code prüft, zeichnet und rechnet.** Ein
// `GraphTask` hat Knoten mit Kürzeln (`n1`, `p3`, `q2` — Regel 2: das Modell schreibt nie eine
// Id, nur ein Kürzel, das Code auflöst), Kanten zwischen diesen Kürzeln und die Frage, die
// gestellt werden soll. Es hat **kein** Feld für einen Fragetext, einen Schlüssel, Optionen
// oder eine Zeichnung: die schreibt `apps/api/src/modules/practice/graph.ts` aus genau diesem
// Objekt, und das Layout rechnet `graphLayout.ts` — deterministisch, in App und Server gleich.
//
// Wo das Modell doch einen Schlüssel nennt (der Erbgang eines Stammbaums, ob ein Automat ein
// Wort annimmt), ist das eine BEHAUPTUNG, die Code nachrechnet: stimmt sie nicht, entsteht keine
// Frage (Regel 0, in beide Richtungen: verwerfen, nie reparieren).
//
// Kompakt mit Absicht (#281): jeder Zweig einer Union kostet im Modell-Schema native Token,
// und nullable Hüllen kosten am meisten. Deshalb vier Zweige, kurze Feldnamen, Listen statt
// nullable Felder, wo eine leere Liste dasselbe sagt.

import { z } from 'zod';

// ─────────────── Größen ───────────────

/** Ein Kürzel, wie das Modell es schreibt: ein Buchstabe und eine Zahl (`n1`, `p12`). */
const Ref = z.string().regex(/^[a-z][0-9]{1,2}$/);
/** Ein Kästchentext — höchstens 40 Zeichen, wie issue #247 es festlegt. */
const BoxText = z.string().trim().min(1).max(40);
/** Eine Pfeilbeschriftung; leer heißt: der Pfeil trägt keine. */
const ArrowLabel = z.string().trim().max(24);
/** Was an einem Ast eines Baumdiagramms steht („rot", „Kopf", „krank"). */
const TreeText = z.string().trim().min(1).max(12);
/** Eine Überschrift, die sagt, WAS das Schema zeigt („Wasserkreislauf"). */
const Title = z.string().trim().min(1).max(40);

export const DIAGRAM_NODES_MIN = 3;
export const DIAGRAM_NODES_MAX = 8;
export const DIAGRAM_EDGES_MAX = 10;
/** Höchstens so viele Lücken in einem Schema — darüber ist es kein Schema mehr, sondern leer. */
export const DIAGRAM_GAPS_MAX = 3;
/** Wie viele Stufen ein Baumdiagramm hat (zweistufig ist die Schule, dreistufig das Maximum). */
export const PROB_STAGES_MAX = 3;
/** Wie viele Äste ein Knoten hat. */
export const PROB_BRANCHES_MAX = 3;
/** Wie viele Blätter — darüber passt der Baum nicht ohne Scrollen auf 360×740. */
export const PROB_LEAVES_MAX = 9;
export const PEDIGREE_PEOPLE_MIN = 3;
export const PEDIGREE_PEOPLE_MAX = 12;
export const PEDIGREE_GENERATIONS_MAX = 4;
export const DFA_STATES_MIN = 2;
export const DFA_STATES_MAX = 5;
export const DFA_MOVES_MAX = 12;
export const DFA_WORD_MAX = 8;

// ─────────────── was das Modell schreibt ───────────────

export const DiagramTask = z
  .object({
    g: z.literal('diagram'),
    title: Title,
    shape: z
      .enum(['chain', 'cycle', 'web'])
      .describe(
        'chain: one path, no loop · cycle: one closed loop through all boxes · web: any connected arrows',
      ),
    ask: z
      .enum(['gap', 'order', 'label'])
      .describe(
        'gap: fill the boxes in "gaps" · order: order the boxes (chain/cycle) · label: match 3–6 arrow labels',
      ),
    nodes: z
      .array(z.object({ id: Ref, text: BoxText }))
      .min(DIAGRAM_NODES_MIN)
      .max(DIAGRAM_NODES_MAX),
    edges: z
      .array(z.object({ from: Ref, to: Ref, label: ArrowLabel }))
      .min(2)
      .max(DIAGRAM_EDGES_MAX)
      .describe('label "" = none'),
    gaps: z.array(Ref).max(DIAGRAM_GAPS_MAX).describe('ask gap: 1–3 box ids; else []'),
  })
  .describe('Boxes and arrows');
export type DiagramTask = z.infer<typeof DiagramTask>;

export const ProbTask = z
  .object({
    g: z.literal('prob'),
    title: Title,
    nodes: z
      .array(
        z.object({
          id: Ref,
          text: TreeText,
          parent: Ref.nullable().describe('null: first stage'),
          p: z.string().trim().max(8).describe('"1/3" or "0.25"'),
        }),
      )
      .min(2)
      .max(PROB_LEAVES_MAX + PROB_LEAVES_MAX / PROB_BRANCHES_MAX + PROB_BRANCHES_MAX),
    ask: z
      .enum(['path', 'gap'])
      .describe(
        'path: P of the leaves in targets (summed) · gap: the branch into the one target is hidden',
      ),
    targets: z.array(Ref).min(1).max(4),
  })
  .describe('Probability tree');
export type ProbTask = z.infer<typeof ProbTask>;

/** Die vier Erbgänge, die die Sek I unterscheidet. */
export const MODES = ['ad', 'ar', 'xd', 'xr'] as const;
export const InheritanceMode = z.enum(MODES);
export type InheritanceMode = z.infer<typeof InheritanceMode>;

export const PedigreeTask = z
  .object({
    g: z.literal('pedigree'),
    people: z
      .array(
        z.object({
          id: Ref,
          sex: z.enum(['m', 'f']),
          ill: z.boolean().describe('shows the trait'),
          parents: z.array(Ref).max(2).describe('[] if married in'),
        }),
      )
      .min(PEDIGREE_PEOPLE_MIN)
      .max(PEDIGREE_PEOPLE_MAX),
    mode: InheritanceMode.describe(
      'a=autosomal, x=X-linked, d=dominant, r=recessive; the only mode that fits',
    ),
    ask: z.enum(['mode', 'genotype']),
    targets: z.array(Ref).max(1).describe('genotype: the one person; mode: []'),
  })
  .describe('Pedigree: one founding couple, descendants, partners married in');
export type PedigreeTask = z.infer<typeof PedigreeTask>;

export const DfaTask = z
  .object({
    g: z.literal('dfa'),
    states: z
      .array(z.object({ id: Ref, accept: z.boolean() }))
      .min(DFA_STATES_MIN)
      .max(DFA_STATES_MAX)
      .describe('first = start'),
    moves: z
      .array(z.object({ from: Ref, to: Ref, sym: z.string().regex(/^[a-z0-9]$/) }))
      .min(1)
      .max(DFA_MOVES_MAX),
    word: z.string().regex(/^[a-z0-9]{1,8}$/),
    accepts: z.boolean(),
  })
  .describe('DFA: is the word accepted?');
export type DfaTask = z.infer<typeof DfaTask>;

/**
 * Eine geprüfte Schema- oder Baumaufgabe. Gespeichert in `items.graph_task` (Migration 0093);
 * alles, was die Lernende sieht, ist daraus gerechnet.
 */
export const GraphTask = z.discriminatedUnion('g', [DiagramTask, ProbTask, PedigreeTask, DfaTask]);
export type GraphTask = z.infer<typeof GraphTask>;

// ─────────────── was die App zeichnet ───────────────
//
// Code-geschrieben, nie vom Modell — deshalb dürfen hier Indizes stehen. Die Positionen stehen
// NICHT darin: die rechnet `graphLayout.ts` aus diesen Daten, in der App genauso wie auf dem
// Server, der vorher geprüft hat, dass es auf 360 pt passt.

export const DiagramFigure = z.object({
  type: z.literal('diagram'),
  shape: z.enum(['chain', 'cycle', 'web']),
  /** `blank`: ein leeres, gestricheltes Kästchen; `text` ist dann seine Nummer. */
  boxes: z
    .array(z.object({ text: z.string(), blank: z.boolean() }))
    .min(1)
    .max(DIAGRAM_NODES_MAX),
  /** `tag`: die Nummer im Kreis auf dem Pfeil, oder "" für keinen. */
  arrows: z
    .array(
      z.object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
        tag: z.string().max(2),
      }),
    )
    .max(DIAGRAM_EDGES_MAX),
  /** Die Pfeilbeschriftungen, in der Reihenfolge ihrer Nummern. */
  legend: z.array(z.string()).max(DIAGRAM_EDGES_MAX),
});
export type DiagramFigure = z.infer<typeof DiagramFigure>;

export const ProbTreeFigure = z.object({
  type: z.literal('prob_tree'),
  /** In Tiefensuche-Reihenfolge; `parent: -1` hängt an der Wurzel. `p: "?"` ist die Lücke. */
  nodes: z
    .array(z.object({ text: z.string(), parent: z.number().int().min(-1), p: z.string() }))
    .min(1)
    .max(PROB_LEAVES_MAX * 2 + PROB_BRANCHES_MAX),
});
export type ProbTreeFigure = z.infer<typeof ProbTreeFigure>;

export const PedigreeFigure = z.object({
  type: z.literal('pedigree'),
  /**
   * In Leserichtung (Generation für Generation, links nach rechts): Person k trägt die Nummer
   * k + 1. `parents` sind Indizes, `[]` für eingeheiratete und das Gründerpaar.
   */
  people: z
    .array(
      z.object({
        sex: z.enum(['m', 'f']),
        ill: z.boolean(),
        parents: z.array(z.number().int().min(0)).max(2),
        spouse: z.number().int().min(-1),
      }),
    )
    .min(PEDIGREE_PEOPLE_MIN)
    .max(PEDIGREE_PEOPLE_MAX),
});
export type PedigreeFigure = z.infer<typeof PedigreeFigure>;

export const AutomatonFigure = z.object({
  type: z.literal('automaton'),
  /** Zustand k heißt `q{k}`; Zustand 0 ist der Start. */
  states: z
    .array(z.object({ accept: z.boolean() }))
    .min(DFA_STATES_MIN)
    .max(DFA_STATES_MAX),
  moves: z
    .array(
      z.object({ from: z.number().int().min(0), to: z.number().int().min(0), syms: z.string() }),
    )
    .max(DFA_MOVES_MAX),
});
export type AutomatonFigure = z.infer<typeof AutomatonFigure>;

// ─────────────── exakte Brüche ───────────────
//
// Eine Wahrscheinlichkeit ist ein Bruch, und „summieren sich zu 1" ist eine Gleichheit, kein
// Vergleich mit Toleranz: 0.1 + 0.2 ist in Gleitkomma nicht 0.3, und ein Urteil über einen Baum
// darf nicht an einer Rundung hängen (dieselbe Begründung wie `TICKS` in `staff.ts`).

export type Ratio = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function ratio(n: bigint, d: bigint): Ratio {
  const g = gcd(n, d) || 1n;
  return d < 0n ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
}
export const addR = (a: Ratio, b: Ratio): Ratio => ratio(a.n * b.d + b.n * a.d, a.d * b.d);
export const mulR = (a: Ratio, b: Ratio): Ratio => ratio(a.n * b.n, a.d * b.d);
export const sameR = (a: Ratio, b: Ratio): boolean => a.n === b.n && a.d === b.d;

/**
 * „1/3", „0.25", „0,25", „1" → ein Bruch, oder null. Höchstens drei Nachkommastellen und ein
 * Nenner bis 100: mehr steht an keinem Ast eines Schulbaums, und eine längere Zahl passt nicht
 * an den Ast.
 */
export function parseProb(text: string): { value: Ratio; decimal: boolean } | null {
  const s = text.trim();
  const frac = /^(\d{1,3})\/(\d{1,3})$/.exec(s);
  if (frac) {
    const n = BigInt(frac[1] as string);
    const d = BigInt(frac[2] as string);
    if (d === 0n || d > 100n || n === 0n || n > d) return null;
    return { value: ratio(n, d), decimal: false };
  }
  const dec = /^(0|1)(?:[.,](\d{1,3}))?$/.exec(s);
  if (dec) {
    const digits = dec[2] ?? '';
    const n = BigInt((dec[1] as string) + digits);
    const d = 10n ** BigInt(digits.length);
    if (n === 0n || n > d) return null;
    return { value: ratio(n, d), decimal: true };
  }
  return null;
}

/** Ein Bruch als Text: „1/6", oder „0.25", wenn er abbricht und so gewünscht ist. */
export function formatRatio(r: Ratio, decimal: boolean): string {
  if (r.d === 1n) return String(r.n);
  if (decimal) {
    let d = r.d;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) {
      d /= 2n;
      twos++;
    }
    while (d % 5n === 0n) {
      d /= 5n;
      fives++;
    }
    if (d === 1n) {
      const places = Math.max(twos, fives);
      const scaled = (r.n * 10n ** BigInt(places)) / r.d;
      const whole = scaled / 10n ** BigInt(places);
      const frac = String(scaled % 10n ** BigInt(places)).padStart(places, '0');
      return `${whole}.${frac}`;
    }
  }
  return `${r.n}/${r.d}`;
}

// ─────────────── gemeinsame Graphprüfung ───────────────

/** Die Kürzel einer Liste: eindeutig, sonst null. */
function indexOfIds(ids: readonly string[]): Map<string, number> | null {
  const map = new Map<string, number>();
  ids.forEach((id, i) => map.set(id, i));
  return map.size === ids.length ? map : null;
}

/** Hängt alles zusammen (die Richtung der Pfeile außer Acht gelassen)? */
function connected(n: number, edges: readonly (readonly [number, number])[]): boolean {
  if (n === 0) return false;
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const at = stack.pop() as number;
    for (const [a, b] of edges) {
      const other = a === at ? b : b === at ? a : -1;
      if (other >= 0 && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen.size === n;
}

/** Gleiche Wörter, gleich geschrieben? Groß/klein und Leerraum zählen hier nicht. */
export function sameWords(a: string, b: string): boolean {
  return norm(a) === norm(b);
}
function norm(s: string): string {
  return s.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
}

// ─────────────── Schema (#247) ───────────────

/** Ein Schema, aufgelöst: Indizes statt Kürzel, oder null, wenn es kein gültiges ist. */
export type DiagramGraph = {
  nodes: string[];
  edges: { from: number; to: number; label: string }[];
  gaps: number[];
};

/**
 * Das Schema als Graph, oder null — und null heißt, es entsteht keine Frage. Geprüft wird, was
 * issue #247 unter „Erzeugung" verlangt: eindeutige Knoten, keine Kante ins Leere, alles hängt
 * zusammen, ein Kreislauf ist geschlossen, eine Kette hat keinen Zyklus, und eine Lückenantwort
 * steht nirgends sonst sichtbar.
 */
export function diagramGraph(task: DiagramTask): DiagramGraph | null {
  const at = indexOfIds(task.nodes.map((n) => n.id));
  if (at === null) return null;
  const nodes = task.nodes.map((n) => n.text);
  // Two boxes with the same words are one box for her — and in an order task two equal
  // elements would make two orders right.
  if (new Set(nodes.map(norm)).size !== nodes.length) return null;
  const edges: DiagramGraph['edges'] = [];
  for (const e of task.edges) {
    const from = at.get(e.from);
    const to = at.get(e.to);
    if (from === undefined || to === undefined || from === to) return null;
    if (edges.some((x) => x.from === from && x.to === to)) return null;
    edges.push({ from, to, label: e.label });
  }
  const n = nodes.length;
  if (
    !connected(
      n,
      edges.map((e) => [e.from, e.to] as const),
    )
  )
    return null;
  const outs = (i: number) => edges.filter((e) => e.from === i).length;
  const ins = (i: number) => edges.filter((e) => e.to === i).length;
  if (task.shape === 'chain') {
    // A path: n−1 arrows, every box at most one in and one out, one start — connected and
    // n−1 edges with in/out ≤ 1 cannot close a loop.
    if (edges.length !== n - 1) return null;
    for (let i = 0; i < n; i++) if (outs(i) > 1 || ins(i) > 1) return null;
  }
  if (task.shape === 'cycle') {
    // One closed loop through every box: n arrows, each box exactly one in and one out, and
    // connected (two separate loops would be connected only if they were one).
    if (edges.length !== n) return null;
    for (let i = 0; i < n; i++) if (outs(i) !== 1 || ins(i) !== 1) return null;
  }
  const gaps: number[] = [];
  for (const g of task.gaps) {
    const i = at.get(g);
    if (i === undefined || gaps.includes(i)) return null;
    gaps.push(i);
  }
  if (task.ask === 'gap') {
    if (gaps.length === 0) return null;
    // The answer may not stand anywhere else she can see: in another box, on an arrow, in the
    // title. Then the gap would be copying, not knowing.
    const visible = [
      task.title,
      ...nodes.filter((_, i) => !gaps.includes(i)),
      ...edges.map((e) => e.label),
    ].map(norm);
    for (const g of gaps) {
      const answer = norm(nodes[g] as string);
      if (visible.some((v) => v.includes(answer))) return null;
    }
    // Something must be left to read: an all-empty diagram is no diagram.
    if (gaps.length > n - 2) return null;
  } else if (gaps.length > 0) {
    return null;
  }
  if (task.ask === 'order' && task.shape === 'web') return null;
  // A cycle has no first box; the first one is given, so at least three are left to order.
  if (task.ask === 'order' && task.shape === 'cycle' && n < 4) return null;
  if (task.ask === 'label') {
    const labelled = edges.filter((e) => e.label !== '');
    if (labelled.length < 3 || labelled.length > 6) return null;
    if (new Set(labelled.map((e) => norm(e.label))).size !== labelled.length) return null;
  }
  return { nodes, edges, gaps };
}

/**
 * Die Kästchen einer Kette oder eines Kreislaufs in Pfeilrichtung, beginnend beim ersten (bei
 * einer Kette dem ohne eingehenden Pfeil, bei einem Kreislauf dem ersten Kästchen der Liste).
 */
export function walkOrder(graph: DiagramGraph, shape: 'chain' | 'cycle' | 'web'): number[] {
  const n = graph.nodes.length;
  let start = 0;
  if (shape === 'chain') {
    start = graph.nodes.findIndex((_, i) => !graph.edges.some((e) => e.to === i));
  }
  const order = [start];
  while (order.length < n) {
    const last = order[order.length - 1] as number;
    const next = graph.edges.find((e) => e.from === last);
    if (!next || order.includes(next.to)) break;
    order.push(next.to);
  }
  return order;
}

// ─────────────── Baumdiagramm (#256) ───────────────

export type ProbTree = {
  /** In Tiefensuche-Reihenfolge, Kinder in der Reihenfolge des Modells. */
  nodes: { text: string; parent: number; p: Ratio; decimal: boolean; id: string }[];
  /** Die Pfadwahrscheinlichkeit jedes Knotens (Produkt entlang des Pfades). */
  path: Ratio[];
};

/**
 * Der Baum, geprüft: jedes Kürzel eindeutig, jeder Elternteil vorhanden, kein Zyklus, höchstens
 * drei Stufen und drei Äste, und die Äste JEDES Knotens summieren sich exakt zu 1. Sonst null.
 */
export function probTree(task: ProbTask): ProbTree | null {
  const at = indexOfIds(task.nodes.map((n) => n.id));
  if (at === null) return null;
  const parsed: { p: Ratio; decimal: boolean }[] = [];
  for (const n of task.nodes) {
    const p = parseProb(n.p);
    if (p === null) return null;
    parsed.push({ p: p.value, decimal: p.decimal });
  }
  const parentOf = task.nodes.map((n) => (n.parent === null ? -1 : (at.get(n.parent) ?? -2)));
  if (parentOf.includes(-2)) return null;
  const childrenOf = (k: number) => task.nodes.map((_, i) => i).filter((i) => parentOf[i] === k);
  const out: ProbTree['nodes'] = [];
  const path: Ratio[] = [];
  const visit = (k: number, depth: number, pathP: Ratio, outParent: number): boolean => {
    const kids = childrenOf(k);
    if (kids.length === 0) return true;
    if (kids.length < 2 || kids.length > PROB_BRANCHES_MAX) return false;
    if (depth >= PROB_STAGES_MAX) return false;
    let sum = ratio(0n, 1n);
    for (const c of kids) sum = addR(sum, (parsed[c] as { p: Ratio }).p);
    if (!sameR(sum, ratio(1n, 1n))) return false;
    // Two branches of one node with the same words are the same outcome twice.
    if (new Set(kids.map((c) => norm(task.nodes[c]?.text as string))).size !== kids.length)
      return false;
    for (const c of kids) {
      const node = task.nodes[c] as ProbTask['nodes'][number];
      const own = parsed[c] as { p: Ratio; decimal: boolean };
      const p = mulR(pathP, own.p);
      out.push({ text: node.text, parent: outParent, p: own.p, decimal: own.decimal, id: node.id });
      path.push(p);
      if (!visit(c, depth + 1, p, out.length - 1)) return false;
    }
    return true;
  };
  if (!visit(-1, 0, ratio(1n, 1n), -1)) return null;
  // Every node reached exactly once: nothing hangs in a loop or off a missing branch.
  if (out.length !== task.nodes.length) return null;
  const leaves = out.filter((_, i) => !out.some((o) => o.parent === i)).length;
  if (leaves > PROB_LEAVES_MAX) return null;
  return { nodes: out, path };
}

/** Die Texte entlang des Pfades zu Knoten k („rot – blau"). */
export function pathWords(tree: Pick<ProbTree, 'nodes'>, k: number): string[] {
  const words: string[] = [];
  let at = k;
  while (at >= 0) {
    const node = tree.nodes[at];
    if (!node) break;
    words.unshift(node.text);
    at = node.parent;
  }
  return words;
}

// ─────────────── Stammbaum (#256) ───────────────

export type Pedigree = {
  /** In Leserichtung; die Nummer einer Person ist ihr Index + 1. */
  people: { id: string; sex: 'm' | 'f'; ill: boolean; parents: number[]; spouse: number }[];
  /** Die Generation jeder Person (0 = das Gründerpaar). */
  generation: number[];
};

/**
 * Der Stammbaum, aufgelöst und in Leserichtung sortiert, oder null.
 *
 * Die Form ist bewusst eng: EIN Gründerpaar, jede andere Person hat entweder beide Eltern im
 * Baum (ein Paar aus Mann und Frau) oder ist eingeheiratet (ohne Eltern, mit genau einem
 * Partner, der Eltern hat). Jede Person hat höchstens einen Partner. Das ist die Form jedes
 * Schulstammbaums, und sie hat ein Layout ohne Kreuzungen (`graphLayout.ts`). Was nicht so
 * aussieht — zwei Familien, die zusammenheiraten, eine zweite Ehe —, entsteht nicht.
 */
export function pedigreeOf(task: PedigreeTask): Pedigree | null {
  const at = indexOfIds(task.people.map((p) => p.id));
  if (at === null) return null;
  const n = task.people.length;
  const parents: number[][] = [];
  for (const p of task.people) {
    if (p.parents.length === 1) return null;
    const ps = p.parents.map((r) => at.get(r));
    if (ps.some((x) => x === undefined)) return null;
    const idx = ps as number[];
    if (idx.length === 2) {
      const [a, b] = idx as [number, number];
      if (a === b) return null;
      const sa = task.people[a]?.sex;
      const sb = task.people[b]?.sex;
      if (sa === sb) return null;
    }
    parents.push(idx);
  }
  // Couples: two people who are parents together.
  const spouse = new Array<number>(n).fill(-1);
  for (const ps of parents) {
    if (ps.length !== 2) continue;
    const [a, b] = ps as [number, number];
    if ((spouse[a] !== -1 && spouse[a] !== b) || (spouse[b] !== -1 && spouse[b] !== a)) return null;
    spouse[a] = b;
    spouse[b] = a;
  }
  const founders = task.people
    .map((_, i) => i)
    .filter((i) => (parents[i] as number[]).length === 0);
  // Exactly one founding couple: two founders married to each other.
  const rootCouples = founders.filter((f) => {
    const s = spouse[f] as number;
    return s !== -1 && (parents[s] as number[]).length === 0;
  });
  if (rootCouples.length !== 2) return null;
  for (const f of founders) {
    if (rootCouples.includes(f)) continue;
    // Married in: exactly one partner, and that partner belongs to the family.
    const s = spouse[f] as number;
    if (s === -1) return null;
  }
  for (let i = 0; i < n; i++) {
    const s = spouse[i] as number;
    // Two people who both have parents in the tree marrying each other: not this form.
    if (s !== -1 && (parents[i] as number[]).length === 2 && (parents[s] as number[]).length === 2)
      return null;
  }
  // Generations, from the founders down; a loop in the parent relation leaves someone unset.
  const generation = new Array<number>(n).fill(-1);
  for (const f of rootCouples) generation[f] = 0;
  for (let round = 0; round < n; round++) {
    for (let i = 0; i < n; i++) {
      const ps = parents[i] as number[];
      if (ps.length === 2 && generation[i] === -1) {
        const g = ps.map((p) => generation[p] as number);
        if (g.every((x) => x >= 0)) generation[i] = Math.max(...g) + 1;
      }
    }
    for (const f of founders) {
      const s = spouse[f] as number;
      if (generation[f] === -1 && s !== -1 && (generation[s] as number) >= 0)
        generation[f] = generation[s] as number;
    }
  }
  if (generation.some((g) => g < 0)) return null;
  if (Math.max(...generation) + 1 > PEDIGREE_GENERATIONS_MAX) return null;
  // The two parents of a child are one generation (a couple is drawn on one row).
  for (const ps of parents) {
    if (ps.length === 2 && generation[ps[0] as number] !== generation[ps[1] as number]) return null;
  }
  // Reading order comes from the layout: row by row, left to right.
  const [r0, r1] = rootCouples as [number, number];
  const man = task.people[r0]?.sex === 'm' ? r0 : r1;
  const order = pedigreeOrder(n, parents, spouse, [man, man === r0 ? r1 : r0]);
  const newIndex = new Map(order.map((old, i) => [old, i]));
  return {
    people: order.map((old) => {
      const p = task.people[old] as PedigreeTask['people'][number];
      const s = spouse[old] as number;
      return {
        id: p.id,
        sex: p.sex,
        ill: p.ill,
        // Father first, so a figure always reads the same.
        parents: [...(parents[old] as number[])]
          .sort(
            (x, y) => (task.people[x]?.sex === 'm' ? 0 : 1) - (task.people[y]?.sex === 'm' ? 0 : 1),
          )
          .map((x) => newIndex.get(x) as number),
        spouse: s === -1 ? -1 : (newIndex.get(s) as number),
      };
    }),
    generation: order.map((old) => generation[old] as number),
  };
}

/**
 * Die Leserichtung: die Reihenfolge, in der `graphLayout.ts` die Personen Zeile für Zeile von
 * links nach rechts setzt. Hier gerechnet, damit die Nummer einer Person feststeht, bevor
 * gezeichnet wird. Eine Familie liegt unter ihren Eltern, ein eingeheirateter Partner rechts
 * neben seinem Partner, Geschwister in der Reihenfolge des Modells.
 */
function pedigreeOrder(
  n: number,
  parents: readonly number[][],
  spouse: readonly number[],
  root: readonly [number, number],
): number[] {
  const childrenOf = (a: number, b: number) =>
    Array.from({ length: n }, (_, i) => i).filter((i) => {
      const ps = parents[i] as number[];
      return ps.length === 2 && ps.includes(a) && ps.includes(b);
    });
  // Rows of units: each unit is a blood relative and (to the right) the partner.
  const rows: number[][] = [];
  const place = (unit: number[], depth: number) => {
    (rows[depth] ??= []).push(...unit);
  };
  const walk = (person: number, depth: number) => {
    const s = spouse[person] as number;
    place(s === -1 ? [person] : [person, s], depth);
    if (s === -1) return;
    for (const c of childrenOf(person, s)) walk(c, depth + 1);
  };
  // The founding couple: the man on the left, as pedigrees are drawn.
  walk(root[0], 0);
  return rows.flat();
}

/** Wie ein Elternteil ein Allel weitergibt: 0, 1 oder 2 Krankheitsallele → was kann kommen. */
const PASS: Record<number, readonly number[]> = { 0: [0], 1: [0, 1], 2: [1] };

/** Zeigt jemand mit d Krankheitsallelen das Merkmal, in diesem Erbgang? */
function shows(mode: InheritanceMode, sex: 'm' | 'f', d: number): boolean {
  if (mode === 'ad' || mode === 'xd') return d >= 1;
  if (mode === 'ar') return d === 2;
  return sex === 'm' ? d === 1 : d === 2;
}

/**
 * Jede Belegung mit Genotypen, die zu den gezeichneten Merkmalen UND zu den Mendelschen Regeln
 * passt — gezählt als die Menge möglicher Allelzahlen je Person. Leer heißt: dieser Erbgang ist
 * mit dem Stammbaum nicht verträglich.
 *
 * Vollständig aufgezählt, nicht mit Faustregeln: höchstens zwölf Personen mit je höchstens zwei
 * möglichen Allelzahlen nach dem Merkmal, also höchstens 4096 Fälle. Eine Faustregel
 * („gesunde Eltern, krankes Kind → rezessiv") wäre eine zweite Wahrheit neben dieser.
 */
export function genotypeSets(ped: Pedigree, mode: InheritanceMode): Set<number>[] {
  const n = ped.people.length;
  const xLinked = mode === 'xd' || mode === 'xr';
  const domain = (i: number): number[] => {
    const p = ped.people[i] as Pedigree['people'][number];
    const all = xLinked && p.sex === 'm' ? [0, 1] : [0, 1, 2];
    return all.filter((d) => shows(mode, p.sex, d) === p.ill);
  };
  // Parents before children: by generation, then reading order.
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (ped.generation[a] as number) - (ped.generation[b] as number) || a - b,
  );
  const seen = Array.from({ length: n }, () => new Set<number>());
  const d = new Array<number>(n).fill(-1);
  const fits = (i: number, v: number): boolean => {
    const p = ped.people[i] as Pedigree['people'][number];
    if (p.parents.length === 0) return true;
    const [fa, mo] = p.parents as [number, number];
    const fatherIsMale = ped.people[fa]?.sex === 'm';
    const father = fatherIsMale ? fa : mo;
    const mother = fatherIsMale ? mo : fa;
    const df = d[father] as number;
    const dm = d[mother] as number;
    if (xLinked) {
      // A son gets his X from his mother; a daughter gets her father's one X and one of her
      // mother's two.
      if (p.sex === 'm') return (PASS[dm] as readonly number[]).includes(v);
      return (PASS[dm] as readonly number[]).some((m) => m + df === v);
    }
    return (PASS[df] as readonly number[]).some((f) =>
      (PASS[dm] as readonly number[]).some((m) => f + m === v),
    );
  };
  const assign = (k: number) => {
    if (k === order.length) {
      for (let i = 0; i < n; i++) seen[i]?.add(d[i] as number);
      return;
    }
    const i = order[k] as number;
    for (const v of domain(i)) {
      if (!fits(i, v)) continue;
      d[i] = v;
      assign(k + 1);
    }
    d[i] = -1;
  };
  assign(0);
  return seen;
}

/** Ist dieser Erbgang mit dem Stammbaum verträglich? */
export function modeFits(ped: Pedigree, mode: InheritanceMode): boolean {
  return genotypeSets(ped, mode).every((s) => s.size > 0);
}

/** Der Genotyp als Schreibweise der Schule: AA, Aa, aa oder Xᴬ Xᵃ, Xᵃ Y. */
export function genotypeText(mode: InheritanceMode, sex: 'm' | 'f', d: number): string {
  if (mode === 'ad') return ['aa', 'Aa', 'AA'][d] as string;
  if (mode === 'ar') return ['AA', 'Aa', 'aa'][d] as string;
  // X-linked: the disease allele is the capital one when dominant, the small one when recessive.
  const ill = mode === 'xd' ? 'Xᴬ' : 'Xᵃ';
  const well = mode === 'xd' ? 'Xᵃ' : 'Xᴬ';
  if (sex === 'm') return d === 1 ? `${ill}Y` : `${well}Y`;
  return [`${well}${well}`, mode === 'xd' ? `${ill}${well}` : `${well}${ill}`, `${ill}${ill}`][
    d
  ] as string;
}

/** Alle Genotypen, die eine Person dieses Geschlechts in diesem Erbgang haben kann. */
export function genotypeOptions(mode: InheritanceMode, sex: 'm' | 'f'): string[] {
  const ds = (mode === 'xd' || mode === 'xr') && sex === 'm' ? [0, 1] : [0, 1, 2];
  return ds.map((d) => genotypeText(mode, sex, d));
}

// ─────────────── Automat (#256) ───────────────

export type Automaton = {
  accept: boolean[];
  /** Je Zustand: Zeichen → Folgezustand. */
  delta: Map<string, number>[];
  /** Die Pfeile, je Paar zusammengefasst („a,b"). */
  moves: { from: number; to: number; syms: string }[];
};

/**
 * Der Automat, geprüft: eindeutige Zustände, jeder Übergang zwischen vorhandenen Zuständen,
 * deterministisch (ein Zeichen führt aus einem Zustand höchstens einmal heraus), höchstens drei
 * Zeichen im Alphabet, jeder Zustand vom Start aus erreichbar, mindestens ein Endzustand. Sonst
 * null.
 */
export function automatonOf(task: DfaTask): Automaton | null {
  const at = indexOfIds(task.states.map((s) => s.id));
  if (at === null) return null;
  const n = task.states.length;
  const delta = Array.from({ length: n }, () => new Map<string, number>());
  for (const m of task.moves) {
    const from = at.get(m.from);
    const to = at.get(m.to);
    if (from === undefined || to === undefined) return null;
    const out = delta[from] as Map<string, number>;
    if (out.has(m.sym)) return null;
    out.set(m.sym, to);
  }
  const alphabet = new Set(task.moves.map((m) => m.sym));
  if (alphabet.size > 3) return null;
  if (!task.states.some((s) => s.accept)) return null;
  const reach = new Set([0]);
  const stack = [0];
  while (stack.length > 0) {
    const s = stack.pop() as number;
    for (const to of (delta[s] as Map<string, number>).values()) {
      if (!reach.has(to)) {
        reach.add(to);
        stack.push(to);
      }
    }
  }
  if (reach.size !== n) return null;
  const pairs = new Map<string, { from: number; to: number; syms: string[] }>();
  delta.forEach((out, from) => {
    for (const [sym, to] of [...out.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const key = `${from}>${to}`;
      const pair = pairs.get(key) ?? { from, to, syms: [] };
      pair.syms.push(sym);
      pairs.set(key, pair);
    }
  });
  return {
    accept: task.states.map((s) => s.accept),
    delta,
    moves: [...pairs.values()].map((p) => ({ ...p, syms: p.syms.join(',') })),
  };
}

/**
 * Der Lauf eines Worts: die besuchten Zustände, oder null, wenn ein Übergang fehlt. Ein
 * fehlender Übergang wird NICHT als „verworfen" gelesen — ob er in einen Fehlerzustand führt, ist
 * eine Konvention, die nicht jede Klasse gleich lernt, und Code rät keine Konvention.
 */
export function runWord(a: Automaton, word: string): number[] | null {
  const trail = [0];
  for (const ch of word) {
    const next = a.delta[trail[trail.length - 1] as number]?.get(ch);
    if (next === undefined) return null;
    trail.push(next);
  }
  return trail;
}
