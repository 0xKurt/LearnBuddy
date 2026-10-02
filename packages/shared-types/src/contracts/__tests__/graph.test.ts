// Schemata und Bäume (issues #247, #256): was Code am Graphen prüft und wie es ihn auslegt.
// Abnahme #247: „Layout ohne Überlappung auf 360 px Breite für bis zu 8 Knoten, Verwerfen
// ungültiger Graphen". Abnahme #256: „Äste ≠ 1 wird verworfen, ein mehrdeutiger Stammbaum wird
// verworfen, Akzeptanz eines Automaten".
import { describe, expect, it } from 'vitest';

import {
  automatonOf,
  diagramGraph,
  formatRatio,
  genotypeSets,
  MODES,
  modeFits,
  parseProb,
  pedigreeOf,
  probTree,
  runWord,
  walkOrder,
  type DfaTask,
  type DiagramFigure,
  type DiagramTask,
  type PedigreeTask,
  type ProbTask,
} from '../graph.js';
import {
  automatonLayout,
  diagramLayout,
  LAYOUT_W,
  overlaps,
  pedigreeLayout,
  probTreeLayout,
  segmentHitsRect,
  wrapText,
  textWidth,
} from '../graphLayout.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i + 1}`);

function chain(n: number, extra: Partial<DiagramTask> = {}): DiagramTask {
  const nodes = ids(n).map((id, i) => ({ id, text: `Station ${i + 1}` }));
  return {
    g: 'diagram',
    title: 'Kette',
    shape: 'chain',
    ask: 'order',
    nodes,
    edges: nodes.slice(1).map((nd, i) => ({ from: `n${i + 1}`, to: nd.id, label: '' })),
    gaps: [],
    ...extra,
  };
}

function cycle(n: number, extra: Partial<DiagramTask> = {}): DiagramTask {
  const nodes = ids(n).map((id, i) => ({ id, text: `Station ${i + 1}` }));
  return {
    g: 'diagram',
    title: 'Kreislauf',
    shape: 'cycle',
    ask: 'order',
    nodes,
    edges: nodes.map((nd, i) => ({ from: nd.id, to: `n${((i + 1) % n) + 1}`, label: '' })),
    gaps: [],
    ...extra,
  };
}

/** The figure a task becomes with every box filled in — what the layout must fit. */
function figureOf(task: DiagramTask, labels = false): DiagramFigure {
  const g = diagramGraph(task);
  if (g === null) throw new Error('invalid');
  return {
    type: 'diagram',
    shape: task.shape,
    boxes: g.nodes.map((text) => ({ text, blank: false })),
    arrows: g.edges.map((e, k) => ({ from: e.from, to: e.to, tag: labels ? String(k + 1) : '' })),
    legend: [],
  };
}

describe('diagram: what is rejected (#247, Erzeugung)', () => {
  it('accepts a closed cycle and a chain', () => {
    expect(diagramGraph(cycle(5))).not.toBeNull();
    expect(diagramGraph(chain(5))).not.toBeNull();
  });

  it('rejects an arrow to a box that does not exist', () => {
    const t = chain(4);
    t.edges[1] = { from: 'n2', to: 'n9', label: '' };
    expect(diagramGraph(t)).toBeNull();
  });

  it('rejects two boxes with the same id or the same words', () => {
    const t = chain(4);
    t.nodes[3] = { id: 'n1', text: 'anders' };
    expect(diagramGraph(t)).toBeNull();
    const u = chain(4);
    u.nodes[3] = { id: 'n4', text: 'station 1' };
    expect(diagramGraph(u)).toBeNull();
  });

  it('rejects a cycle that is not closed and a chain that loops', () => {
    const open = cycle(5);
    open.edges.pop();
    expect(diagramGraph(open)).toBeNull();
    const looped = chain(4);
    looped.edges.push({ from: 'n4', to: 'n1', label: '' });
    expect(diagramGraph(looped)).toBeNull();
  });

  it('rejects two separate pieces', () => {
    const t: DiagramTask = {
      ...chain(4),
      shape: 'web',
      ask: 'gap',
      gaps: ['n1'],
      edges: [
        { from: 'n1', to: 'n2', label: '' },
        { from: 'n3', to: 'n4', label: '' },
      ],
    };
    expect(diagramGraph(t)).toBeNull();
  });

  it('rejects a gap whose answer stands in another box, on an arrow or in the title', () => {
    const base = cycle(4, { ask: 'gap', gaps: ['n2'] });
    base.nodes = [
      { id: 'n1', text: 'Meer' },
      { id: 'n2', text: 'Wolke' },
      { id: 'n3', text: 'Regen' },
      { id: 'n4', text: 'Fluss' },
    ];
    expect(diagramGraph(base)).not.toBeNull();
    expect(diagramGraph({ ...base, title: 'Wolke und Wasser' })).toBeNull();
    const leak = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'n3' ? { ...n, text: 'Regen aus der Wolke' } : n)),
    };
    expect(diagramGraph(leak)).toBeNull();
    const onArrow = {
      ...base,
      edges: base.edges.map((e, i) => (i === 0 ? { ...e, label: 'zur Wolke' } : e)),
    };
    expect(diagramGraph(onArrow)).toBeNull();
  });

  it('orders a cycle from its first box and a chain from the box nothing points to', () => {
    const t = chain(4);
    t.nodes.reverse();
    const g = diagramGraph(t);
    expect(g && walkOrder(g, 'chain').map((i) => g.nodes[i])).toEqual([
      'Station 1',
      'Station 2',
      'Station 3',
      'Station 4',
    ]);
  });

  it('wants 3–6 distinct labels for a label task', () => {
    const t = cycle(4, { ask: 'label' });
    expect(diagramGraph(t)).toBeNull();
    t.edges = t.edges.map((e, i) => ({ ...e, label: `Vorgang ${i + 1}` }));
    expect(diagramGraph(t)).not.toBeNull();
    t.edges[1] = { ...(t.edges[1] as DiagramTask['edges'][number]), label: 'vorgang 1' };
    expect(diagramGraph(t)).toBeNull();
  });
});

describe('diagram layout: no overlap on a 360 px phone, up to 8 boxes', () => {
  const long = 'Wasserdampf steigt in die Luft auf';
  for (let n = 3; n <= 8; n++) {
    for (const make of [chain, cycle]) {
      it(`${make.name} of ${n}, longest texts, with number tags`, () => {
        const t = make(n, { ask: 'gap', gaps: ['n1'] });
        t.nodes = t.nodes.map((nd, i) => ({ ...nd, text: `${long.slice(0, 36)} ${i}` }));
        const fig = figureOf(t, true);
        const l = diagramLayout(fig);
        expect(l.why).toBeNull();
        expect(l.fits).toBe(true);
        for (let i = 0; i < l.boxes.length; i++) {
          const b = l.boxes[i] as (typeof l.boxes)[number];
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(LAYOUT_W + 0.01);
          for (const line of b.lines) expect(textWidth(line)).toBeLessThanOrEqual(b.w - 12 + 0.01);
          for (let j = i + 1; j < l.boxes.length; j++)
            expect(overlaps(b, l.boxes[j] as (typeof l.boxes)[number])).toBe(false);
        }
        // Every arrow leaves its box and enters the other one without crossing a third.
        l.arrows.forEach((a, k) => {
          const spec = fig.arrows[k] as DiagramFigure['arrows'][number];
          l.boxes.forEach((b, bi) => {
            if (bi !== spec.from && bi !== spec.to)
              expect(segmentHitsRect(a.from, a.to, b)).toBe(false);
          });
        });
      });
    }
  }

  it('lays out a food web in layers and rejects one too wide to draw', () => {
    const web: DiagramTask = {
      g: 'diagram',
      title: 'Nahrungsnetz',
      shape: 'web',
      ask: 'gap',
      nodes: [
        { id: 'n1', text: 'Gras' },
        { id: 'n2', text: 'Klee' },
        { id: 'n3', text: 'Hase' },
        { id: 'n4', text: 'Maus' },
        { id: 'n5', text: 'Fuchs' },
      ],
      edges: [
        { from: 'n1', to: 'n3', label: '' },
        { from: 'n2', to: 'n3', label: '' },
        { from: 'n2', to: 'n4', label: '' },
        { from: 'n3', to: 'n5', label: '' },
        { from: 'n4', to: 'n5', label: '' },
      ],
      gaps: ['n5'],
    };
    expect(diagramLayout(figureOf(web)).fits).toBe(true);
    const wide: DiagramTask = {
      ...web,
      nodes: [...web.nodes, ...['Moos', 'Farn'].map((text, i) => ({ id: `n${6 + i}`, text }))],
      edges: [
        ...web.edges,
        { from: 'n6', to: 'n3', label: '' },
        { from: 'n7', to: 'n4', label: '' },
      ],
    };
    // Four producers in one row: wider than a phone, so no question.
    expect(diagramLayout(figureOf(wide)).fits).toBe(false);
  });

  it('breaks a word too long for a box, with a hyphen, and stays inside', () => {
    const lines = wrapText('Grundwasserneubildung', 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l)).toBeLessThanOrEqual(60);
    expect(lines[0]?.endsWith('-')).toBe(true);
  });
});

// ─────────────── Baumdiagramm ───────────────

function coin(p1 = '1/2', p2 = '1/2'): ProbTask {
  return {
    g: 'prob',
    title: 'Zwei Würfe',
    ask: 'path',
    targets: ['b1'],
    nodes: [
      { id: 'a1', text: 'K', parent: null, p: p1 },
      { id: 'a2', text: 'Z', parent: null, p: p2 },
      { id: 'b1', text: 'K', parent: 'a1', p: '1/2' },
      { id: 'b2', text: 'Z', parent: 'a1', p: '1/2' },
      { id: 'b3', text: 'K', parent: 'a2', p: '1/2' },
      { id: 'b4', text: 'Z', parent: 'a2', p: '1/2' },
    ],
  };
}

describe('probability tree (#256)', () => {
  it('reads fractions and decimals exactly', () => {
    expect(parseProb('1/3')?.value).toEqual({ n: 1n, d: 3n });
    expect(parseProb('0,25')?.value).toEqual({ n: 1n, d: 4n });
    expect(parseProb('0')).toBeNull();
    expect(parseProb('4/3')).toBeNull();
    expect(parseProb('0.33333')).toBeNull();
    expect(formatRatio({ n: 3n, d: 8n }, true)).toBe('0.375');
    expect(formatRatio({ n: 1n, d: 6n }, true)).toBe('1/6');
  });

  it('computes path probabilities as products', () => {
    const tree = probTree(coin());
    expect(tree).not.toBeNull();
    expect(tree?.path[2]).toEqual({ n: 1n, d: 4n });
  });

  it('rejects branches that do not add up to 1 — exactly, not nearly', () => {
    expect(probTree(coin('1/3', '1/2'))).toBeNull();
    expect(probTree(coin('0.3', '0.7'))).not.toBeNull();
    // 0.33 + 0.67 = 1, but 1/3 + 0.67 is not.
    expect(probTree(coin('1/3', '0.67'))).toBeNull();
  });

  it('rejects a branch under a missing node and a node with a single branch', () => {
    const t = coin();
    t.nodes[5] = { id: 'b4', text: 'Z', parent: 'x9', p: '1/2' };
    expect(probTree(t)).toBeNull();
    const single = coin();
    single.nodes = single.nodes.slice(0, 5);
    single.nodes[4] = { id: 'b3', text: 'K', parent: 'a2', p: '1' };
    expect(probTree(single)).toBeNull();
  });

  it('lays out three branches over two stages without labels touching', () => {
    const fig = {
      type: 'prob_tree' as const,
      nodes: [
        { text: 'rot', parent: -1, p: '1/3' },
        { text: 'rot', parent: 0, p: '1/3' },
        { text: 'blau', parent: 0, p: '1/3' },
        { text: 'grün', parent: 0, p: '1/3' },
        { text: 'blau', parent: -1, p: '1/3' },
        { text: 'rot', parent: 4, p: '1/3' },
        { text: 'blau', parent: 4, p: '1/3' },
        { text: 'grün', parent: 4, p: '1/3' },
        { text: 'grün', parent: -1, p: '1/3' },
        { text: 'rot', parent: 8, p: '1/3' },
        { text: 'blau', parent: 8, p: '1/3' },
        { text: 'grün', parent: 8, p: '1/3' },
      ],
    };
    const l = probTreeLayout(fig);
    expect(l.why).toBeNull();
    expect(l.height).toBeLessThan(300);
  });
});

// ─────────────── Stammbaum ───────────────

/** Founders 1 × 2, children 3 4 5; 3 marries 6, their children 7 8. */
function family(ill: Record<string, boolean>, mode: PedigreeTask['mode'] = 'ar'): PedigreeTask {
  const p = (id: string, sex: 'm' | 'f', parents: string[] = []) => ({
    id,
    sex,
    ill: ill[id] ?? false,
    parents,
  });
  return {
    g: 'pedigree',
    mode,
    ask: 'mode',
    targets: [],
    people: [
      p('p1', 'm'),
      p('p2', 'f'),
      p('p3', 'm', ['p1', 'p2']),
      p('p4', 'f', ['p1', 'p2']),
      p('p5', 'm', ['p1', 'p2']),
      p('p6', 'f'),
      p('p7', 'f', ['p3', 'p6']),
      p('p8', 'm', ['p3', 'p6']),
    ],
  };
}

describe('pedigree (#256)', () => {
  it('two healthy parents with an ill daughter: only recessive autosomal fits', () => {
    // 1 × 2 healthy, daughter 4 ill → recessive; the ill daughter rules out X-linked recessive
    // (her healthy father would have to be ill).
    const ped = pedigreeOf(family({ p4: true }));
    expect(ped).not.toBeNull();
    if (!ped) return;
    expect(MODES.filter((m) => modeFits(ped, m))).toEqual(['ar']);
  });

  it('an ambiguous pedigree fits more than one mode', () => {
    // One ill son of healthy parents: recessive, autosomal or X-linked — both fit.
    const ped = pedigreeOf(family({ p5: true }));
    if (!ped) throw new Error('invalid');
    const fitting = MODES.filter((m) => modeFits(ped, m));
    expect(fitting.length).toBeGreaterThan(1);
  });

  it('knows the genotype exactly where the drawing forces it', () => {
    const ped = pedigreeOf(family({ p4: true }));
    if (!ped) throw new Error('invalid');
    const sets = genotypeSets(ped, 'ar');
    // The healthy parents of an ill child are carriers: one disease allele each.
    expect([...(sets[0] as Set<number>)]).toEqual([1]);
    expect([...(sets[1] as Set<number>)]).toEqual([1]);
    // A healthy sibling may or may not carry it.
    const brother = ped.people.findIndex((p) => p.id === 'p3');
    expect((sets[brother] as Set<number>).size).toBe(2);
  });

  it('numbers people in reading order, father first', () => {
    const ped = pedigreeOf(family({}));
    expect(ped?.people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p6', 'p4', 'p5', 'p7', 'p8']);
  });

  it('rejects a second founding couple, a single parent and parents of one sex', () => {
    const two = family({});
    two.people.push({ id: 'p9', sex: 'm', ill: false, parents: [] });
    expect(pedigreeOf(two)).toBeNull();
    const single = family({});
    single.people[2] = { id: 'p3', sex: 'm', ill: false, parents: ['p1'] };
    expect(pedigreeOf(single)).toBeNull();
    const same = family({});
    same.people[1] = { id: 'p2', sex: 'm', ill: false, parents: [] };
    expect(pedigreeOf(same)).toBeNull();
  });

  it('lays out three generations without crossing sibling lines', () => {
    const ped = pedigreeOf(family({ p4: true }));
    if (!ped) throw new Error('invalid');
    const l = pedigreeLayout({
      type: 'pedigree',
      people: ped.people.map(({ sex, ill, parents, spouse }) => ({ sex, ill, parents, spouse })),
    });
    expect(l.why).toBeNull();
    expect(l.families.length).toBe(2);
  });
});

// ─────────────── Automat ───────────────

/** Accepts the words over {a, b} that end in b. */
const endsInB: DfaTask = {
  g: 'dfa',
  states: [
    { id: 'q1', accept: false },
    { id: 'q2', accept: true },
  ],
  moves: [
    { from: 'q1', to: 'q1', sym: 'a' },
    { from: 'q1', to: 'q2', sym: 'b' },
    { from: 'q2', to: 'q1', sym: 'a' },
    { from: 'q2', to: 'q2', sym: 'b' },
  ],
  word: 'abab',
  accepts: true,
};

describe('automaton (#256)', () => {
  it('runs a word and accepts it where it ends in an accepting state', () => {
    const a = automatonOf(endsInB);
    if (!a) throw new Error('invalid');
    expect(runWord(a, 'abab')).toEqual([0, 0, 1, 0, 1]);
    expect(a.accept[runWord(a, 'abba')?.at(-1) as number]).toBe(false);
  });

  it('a missing move is no answer at all, never a silent reject', () => {
    const partial = { ...endsInB, moves: endsInB.moves.slice(0, 2) };
    const a = automatonOf(partial);
    // q2 cannot be left: still a valid automaton…
    expect(a).not.toBeNull();
    // …but "ba" has no run, so no key.
    expect(a && runWord(a, 'ba')).toBeNull();
  });

  it('rejects a non-deterministic automaton and an unreachable state', () => {
    expect(
      automatonOf({ ...endsInB, moves: [...endsInB.moves, { from: 'q1', to: 'q2', sym: 'a' }] }),
    ).toBeNull();
    expect(
      automatonOf({
        ...endsInB,
        states: [...endsInB.states, { id: 'q3', accept: false }],
      }),
    ).toBeNull();
  });

  it('lays out five states with loops and back arcs without labels touching', () => {
    const fig = {
      type: 'automaton' as const,
      states: [0, 1, 2, 3, 4].map((i) => ({ accept: i === 4 })),
      moves: [
        { from: 0, to: 1, syms: 'a' },
        { from: 1, to: 2, syms: 'b' },
        { from: 2, to: 3, syms: 'a' },
        { from: 3, to: 4, syms: 'b' },
        { from: 4, to: 0, syms: 'a' },
        { from: 1, to: 1, syms: 'a' },
        { from: 3, to: 1, syms: 'b' },
      ],
    };
    const l = automatonLayout(fig);
    expect(l.why).toBeNull();
  });
});
