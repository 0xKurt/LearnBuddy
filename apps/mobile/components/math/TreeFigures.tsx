// Trees (issue #256): a probability tree (left to right, as in the schoolbook), a plain tree
// (top down, Informatik), a pedigree (Stammbaum: □ man, ○ woman, filled = affected) and a finite
// automaton (states on a ring, the start at the left). Nothing here decides anything — the
// layout and every computed fact come from packages/shared-math/src/trees.ts and pedigree.ts,
// the same code that checked the figure on the server, so the app draws exactly what was
// checked. Each figure also says in words what it shows (`describeTree`), so the question can be
// answered with a screen reader.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

// Imported by path, like molecule.js in MoleculeView: dependency-free, no mathjs in the bundle.
import {
  automatonLayout,
  TREE_CHAR,
  treeLayout,
  type XY,
} from '../../../../packages/shared-math/src/trees.js';
import {
  generations,
  PEDIGREE_LEVEL,
  PEDIGREE_SYMBOL,
  pedigreeLayout,
} from '../../../../packages/shared-math/src/pedigree.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FONT, HaloText, SMALL } from './figureText.js';

type TreeFig = Extract<Figure, { type: 'tree' }>;
type PedigreeFig = Extract<Figure, { type: 'pedigree' }>;
type AutomatonFig = Extract<Figure, { type: 'automaton' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

const isAsked = (text: string) => text.trim() === '?';

export function TreeBody({
  figure,
  width,
}: {
  figure: TreeFig | PedigreeFig | AutomatonFig;
  width: number;
}) {
  switch (figure.type) {
    case 'tree':
      return figure.pr ? (
        <ProbTree fig={figure} width={width} />
      ) : (
        <PlainTree fig={figure} width={width} />
      );
    case 'pedigree':
      return <PedigreeView fig={figure} width={width} />;
    case 'automaton':
      return <AutomatonView fig={figure} width={width} />;
  }
}

/** A small filled triangle at `tip`, pointing along `from → tip` (also SolidFigures). */
export function arrowHead(from: XY, tip: XY, size = 7): string {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / len;
  const uy = (tip.y - from.y) / len;
  const bx = tip.x - ux * size;
  const by = tip.y - uy * size;
  const half = size * 0.55;
  return `M${tip.x},${tip.y} L${bx - uy * half},${by + ux * half} L${bx + uy * half},${by - ux * half} Z`;
}

// ─────────────── probability tree ───────────────

function ProbTree({ fig, width }: { fig: TreeFig; width: number }) {
  const { figure: ink } = useTheme();
  const { at, height } = treeLayout(fig, width);
  const nodes: ReactNode[] = [];
  const labelEnd = (i: number) => {
    const p = at[i] as XY;
    return i === 0 ? p.x + 4 : p.x + (fig.n[i]?.l.length ?? 0) * TREE_CHAR + 4;
  };
  fig.n.forEach((node, i) => {
    if (node.p < 0) return;
    const from = { x: labelEnd(node.p), y: (at[node.p] as XY).y };
    const to = { x: (at[i] as XY).x - 4, y: (at[i] as XY).y };
    nodes.push(
      <Line
        key={`e${i}`}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={ink.stroke}
        strokeWidth={1.6}
      />,
    );
    const asked = isAsked(node.e);
    // The probability sits on its branch, above it where the branch rises, below where it falls,
    // so two branches from one node never share a corner.
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const dy = to.y < from.y ? -5 : to.y > from.y ? 15 : -5;
    nodes.push(
      <HaloText
        key={`p${i}`}
        x={mid.x}
        y={mid.y + dy}
        anchor="middle"
        text={node.e}
        size={asked ? FONT + 3 : FONT}
        color={asked ? ink.point : ink.label}
      />,
    );
  });
  nodes.push(
    <Circle key="root" cx={(at[0] as XY).x} cy={(at[0] as XY).y} r={3.5} fill={ink.stroke} />,
  );
  fig.n.forEach((node, i) => {
    if (i === 0 || node.l === '') return;
    const p = at[i] as XY;
    nodes.push(
      <HaloText
        key={`l${i}`}
        x={p.x}
        y={p.y + FONT * 0.36}
        anchor="start"
        text={node.l}
        color={ink.axis}
      />,
    );
  });
  return (
    <Svg width={width} height={height + 8}>
      <G y={4}>{nodes}</G>
    </Svg>
  );
}

// ─────────────── plain tree (top down) ───────────────

const NODE_R = 16;

function PlainTree({ fig, width }: { fig: TreeFig; width: number }) {
  const { figure: ink } = useTheme();
  const { at, height } = treeLayout(fig, width);
  const nodes: ReactNode[] = [];
  fig.n.forEach((node, i) => {
    if (node.p < 0) return;
    const a = at[node.p] as XY;
    const b = at[i] as XY;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    nodes.push(
      <Line
        key={`e${i}`}
        x1={a.x + ux * NODE_R}
        y1={a.y + uy * NODE_R}
        x2={b.x - ux * NODE_R}
        y2={b.y - uy * NODE_R}
        stroke={ink.stroke}
        strokeWidth={1.6}
      />,
    );
    if (node.e !== '') {
      // A code bit or a branch name beside the middle of its branch, on the outer side.
      const side = b.x < a.x ? -1 : 1;
      nodes.push(
        <HaloText
          key={`p${i}`}
          x={(a.x + b.x) / 2 + side * 9}
          y={(a.y + b.y) / 2 + 4}
          anchor={side < 0 ? 'end' : 'start'}
          text={node.e}
          size={SMALL}
          color={ink.label}
        />,
      );
    }
  });
  fig.n.forEach((node, i) => {
    const p = at[i] as XY;
    nodes.push(
      <G key={`n${i}`}>
        <Circle
          cx={p.x}
          cy={p.y}
          r={NODE_R}
          fill={ink.paper}
          stroke={ink.stroke}
          strokeWidth={1.6}
        />
        <HaloText x={p.x} y={p.y + FONT * 0.36} anchor="middle" text={node.l} color={ink.axis} />
      </G>,
    );
  });
  return (
    <Svg width={width} height={height}>
      {nodes}
    </Svg>
  );
}

// ─────────────── pedigree ───────────────

const ROMAN = ['I', 'II', 'III', 'IV'];
/** Room left of the symbols for the generation numerals. */
const NUMERAL_ROOM = 26;

function PedigreeView({ fig, width }: { fig: PedigreeFig; width: number }) {
  const { figure: ink } = useTheme();
  const layout = pedigreeLayout(fig, width, NUMERAL_ROOM);
  // The server never stores a pedigree it could not lay out.
  if (!layout) return null;
  const { at, gen, couples } = layout;
  const half = PEDIGREE_SYMBOL / 2;
  const nodes: ReactNode[] = [];
  const line = (key: string, x1: number, y1: number, x2: number, y2: number) => (
    <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink.stroke} strokeWidth={1.6} />
  );
  couples.forEach((c, k) => {
    const fa = at[c.fa] as XY;
    const mo = at[c.mo] as XY;
    const [l, r] = fa.x < mo.x ? [fa, mo] : [mo, fa];
    nodes.push(line(`c${k}`, l.x + half, l.y, r.x - half, r.y));
    // The children hang from one line half a generation below their parents.
    const midX = (l.x + r.x) / 2;
    const bar = l.y + PEDIGREE_LEVEL / 2;
    const xs = c.kids.map((i) => (at[i] as XY).x);
    nodes.push(line(`d${k}`, midX, l.y, midX, bar));
    nodes.push(line(`s${k}`, Math.min(midX, ...xs), bar, Math.max(midX, ...xs), bar));
    c.kids.forEach((i) =>
      nodes.push(line(`k${i}`, (at[i] as XY).x, bar, (at[i] as XY).x, (at[i] as XY).y - half)),
    );
  });
  fig.p.forEach((x, i) => {
    const p = at[i] as XY;
    const fill = x.a ? ink.axis : ink.paper;
    nodes.push(
      x.s === 'm' ? (
        <Rect
          key={`p${i}`}
          x={p.x - half}
          y={p.y - half}
          width={PEDIGREE_SYMBOL}
          height={PEDIGREE_SYMBOL}
          fill={fill}
          stroke={ink.axis}
          strokeWidth={1.8}
        />
      ) : (
        <Circle
          key={`p${i}`}
          cx={p.x}
          cy={p.y}
          r={half}
          fill={fill}
          stroke={ink.axis}
          strokeWidth={1.8}
        />
      ),
    );
    nodes.push(
      <HaloText
        key={`n${i}`}
        x={p.x}
        y={p.y + half + SMALL + 2}
        anchor="middle"
        text={String(i + 1)}
        size={SMALL}
        color={ink.label}
        weight="400"
      />,
    );
  });
  const rows = Math.max(...gen) + 1;
  for (let g = 0; g < rows; g++) {
    nodes.push(
      <HaloText
        key={`g${g}`}
        x={2}
        y={PEDIGREE_SYMBOL + g * PEDIGREE_LEVEL + 5}
        anchor="start"
        text={ROMAN[g] ?? ''}
        size={SMALL}
        color={ink.label}
      />,
    );
  }
  return (
    <Svg width={width} height={layout.height}>
      {nodes}
    </Svg>
  );
}

// ─────────────── automaton ───────────────

const STATE_R = 18;

function AutomatonView({ fig, width }: { fig: AutomatonFig; width: number }) {
  const { figure: ink } = useTheme();
  const { at, height } = automatonLayout(fig, width, STATE_R);
  const centre = { x: width / 2, y: height / 2 };
  const nodes: ReactNode[] = [];
  const pairs = new Set(fig.t.map((tr) => `${tr.a}>${tr.b}`));
  fig.t.forEach((tr, k) => {
    const a = at[tr.a] as XY;
    const b = at[tr.b] as XY;
    let path: string;
    let head: string;
    let label: XY;
    if (tr.a === tr.b) {
      // A loop above a state in the upper half, below one in the lower half.
      const dir = a.y > centre.y + 20 ? 1 : -1;
      const p0 = { x: a.x - 9, y: a.y + dir * (STATE_R - 3) };
      const p3 = { x: a.x + 9, y: a.y + dir * (STATE_R - 3) };
      const c1 = { x: a.x - 24, y: a.y + dir * (STATE_R + 30) };
      const c2 = { x: a.x + 24, y: a.y + dir * (STATE_R + 30) };
      path = `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
      head = arrowHead(c2, p3);
      label = { x: a.x, y: a.y + dir * (STATE_R + 28) + (dir > 0 ? 10 : 0) };
    } else {
      // Straight, or bent to one side when the way back exists too.
      const bend = pairs.has(`${tr.b}>${tr.a}`) ? 22 : 0;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const ctrl = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
      const toward = (p: XY, q: XY) => {
        const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        return { x: p.x + ((q.x - p.x) / l) * STATE_R, y: p.y + ((q.y - p.y) / l) * STATE_R };
      };
      const s = toward(a, ctrl);
      const e = toward(b, ctrl);
      path = `M${s.x},${s.y} Q${ctrl.x},${ctrl.y} ${e.x},${e.y}`;
      head = arrowHead(ctrl, e);
      // Beside the bend's outer side, or above a straight arrow.
      const up = ny < 0 ? 1 : -1;
      label =
        bend > 0
          ? { x: ctrl.x, y: ctrl.y + 4 }
          : { x: ctrl.x + nx * 9 * up, y: ctrl.y + ny * 9 * up + 4 };
    }
    nodes.push(
      <G key={`t${k}`}>
        <Path d={path} stroke={ink.stroke} strokeWidth={1.6} fill="none" />
        <Path d={head} fill={ink.stroke} />
        <HaloText
          x={label.x}
          y={label.y}
          anchor="middle"
          text={tr.c}
          size={SMALL}
          color={ink.label}
        />
      </G>,
    );
  });
  const start = at[0] as XY;
  nodes.push(
    <G key="start">
      <Line
        x1={start.x - STATE_R - 22}
        y1={start.y}
        x2={start.x - STATE_R - 2}
        y2={start.y}
        stroke={ink.axis}
        strokeWidth={1.8}
      />
      <Path
        d={arrowHead(
          { x: start.x - STATE_R - 22, y: start.y },
          { x: start.x - STATE_R, y: start.y },
        )}
        fill={ink.axis}
      />
    </G>,
  );
  fig.s.forEach((st, i) => {
    const p = at[i] as XY;
    nodes.push(
      <G key={`s${i}`}>
        <Circle
          cx={p.x}
          cy={p.y}
          r={STATE_R}
          fill={ink.paper}
          stroke={ink.axis}
          strokeWidth={1.8}
        />
        {st.f ? (
          <Circle
            cx={p.x}
            cy={p.y}
            r={STATE_R - 4}
            fill="none"
            stroke={ink.axis}
            strokeWidth={1.4}
          />
        ) : null}
        <HaloText
          x={p.x}
          y={p.y + FONT * 0.36}
          anchor="middle"
          text={st.l}
          size={SMALL}
          color={ink.axis}
        />
      </G>,
    );
  });
  return (
    <Svg width={width} height={height}>
      {nodes}
    </Svg>
  );
}

// ─────────────── description for screen readers ───────────────

/**
 * The same content as the drawing, in words: every branch with its label, every person with
 * sex, generation, parents and whether affected, every state and transition. Nothing derived —
 * no path probability, no mode, no genotype — because that is what a question asks for.
 */
export function describeTree(figure: TreeFig | PedigreeFig | AutomatonFig, t: T): string {
  switch (figure.type) {
    case 'tree': {
      const name = (i: number) =>
        figure.n[i]?.l || (i === 0 ? t('figure.tree_root') : String(i + 1));
      const said = (e: string) => (isAsked(e) ? t('figure.tree_unknown') : e);
      const parts = [t(figure.pr ? 'figure.tree_prob' : 'figure.tree_plain')];
      figure.n.forEach((node, i) => {
        if (node.p < 0) return;
        const branch = { from: name(node.p), to: name(i) };
        parts.push(
          node.e === ''
            ? t('figure.tree_branch', branch)
            : t('figure.tree_branch_label', { ...branch, label: said(node.e) }),
        );
      });
      return parts.join('. ');
    }
    case 'pedigree': {
      const gen = generations(figure.p) ?? figure.p.map(() => 0);
      const parts = [t('figure.pedigree', { gens: Math.max(...gen) + 1 })];
      figure.p.forEach((x, i) => {
        const who = t(x.s === 'm' ? 'figure.pedigree_man' : 'figure.pedigree_woman', {
          n: i + 1,
          gen: ROMAN[gen[i] ?? 0] ?? '',
        });
        const affected = x.a ? `, ${t('figure.pedigree_affected')}` : '';
        const parents =
          x.fa >= 0 ? `, ${t('figure.pedigree_child', { fa: x.fa + 1, mo: x.mo + 1 })}` : '';
        parts.push(`${who}${affected}${parents}`);
      });
      return parts.join('. ');
    }
    case 'automaton': {
      const state = (i: number) => figure.s[i]?.l ?? '';
      const parts = [
        t('figure.automaton', {
          start: state(0),
          finals: figure.s
            .filter((s) => s.f)
            .map((s) => s.l)
            .join(', '),
        }),
      ];
      for (const tr of figure.t) {
        parts.push(
          t('figure.automaton_move', { from: state(tr.a), to: state(tr.b), symbols: tr.c }),
        );
      }
      return parts.join('. ');
    }
  }
}
