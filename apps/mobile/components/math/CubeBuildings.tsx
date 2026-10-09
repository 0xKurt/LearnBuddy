// Würfelgebäude (#368, the rest of #255): a building of unit cubes as a Schrägbild, as its Bauplan
// (the height of every column written in its square) or as one of its views — the squares seen
// from the front, from the left or from above. Nothing here decides anything: the views, which
// columns can be seen and every key come from packages/shared-math/src/cubes.ts, the same code that
// checked the figure on the server. The Schrägbild is painted back to front, so a nearer cube
// covers what it hides; its faces are opaque for that reason. Each figure also says in words what
// it shows (`describeCubes`).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// Imported by path, like every figure file: dependency-free.
import { cubesView } from '../../../../packages/shared-math/src/cubes.js';
import { projectSolid, type SolidXY } from '../../../../packages/shared-math/src/solids.js';
import type { Translate } from '../../lib/i18n/index.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FONT, HaloText } from './figureText.js';

export type CubesFig = Extract<Figure, { type: 'cubes' }>;

/** The tallest a building is drawn, so the answer stays on a small screen (as SolidFigures). */
const MAX_HEIGHT = 160;
/** The largest square of a Bauplan: a touch target's width, so it reads as a tile. */
const CELL_MAX = 36;
/**
 * A view is only ever an option's picture, four of them under the building: small squares, at
 * most 60 pt high, so the building and its four options stand on 360 × 740 without scrolling
 * (walkthrough 99-cubes-views: 36-pt squares ran 120 pt past the bottom).
 */
const VIEW_CELL = 20;
const VIEW_HEIGHT = 60;
/**
 * One cube edge in the Schrägbild at most: a building of four columns stays well under
 * MAX_HEIGHT, so a question with option pictures under it keeps its room.
 */
const CUBE_EDGE = 32;

const pathOf = (pts: readonly SolidXY[]) =>
  `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`;

export function CubesBody({ fig, width }: { fig: CubesFig; width: number }) {
  if (fig.v === 'oblique') return <Oblique fig={fig} width={width} />;
  if (fig.v === 'plan') return <Plan fig={fig} width={width} />;
  return <Squares grid={cubesView(fig.g, fig.v)} width={width} />;
}

/** The Schrägbild: every cube's front, top and right face, painted from the back to the front. */
function Oblique({ fig, width }: { fig: CubesFig; width: number }) {
  const { figure: ink, palette } = useTheme();
  type Face = { pts: SolidXY[]; fill: string };
  const faces: Face[] = [];
  const rows = fig.g.length;
  for (let r = rows - 1; r >= 0; r--) {
    fig.g[r]!.forEach((h, c) => {
      for (let y = 0; y < h; y++) {
        const p = (dx: number, dy: number, dz: number) => projectSolid([c + dx, y + dy, r + dz]);
        faces.push(
          { pts: [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0)], fill: palette.paper },
          { pts: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], fill: ink.fill },
          { pts: [p(1, 0, 0), p(1, 0, 1), p(1, 1, 1), p(1, 1, 0)], fill: palette.canvas },
        );
      }
    });
  }
  const all = faces.flatMap((f) => f.pts);
  const x0 = Math.min(...all.map((q) => q.x));
  const x1 = Math.max(...all.map((q) => q.x));
  const y0 = Math.min(...all.map((q) => q.y));
  const y1 = Math.max(...all.map((q) => q.y));
  const pad = 8;
  const scale = Math.min(
    (width - 2 * pad) / (x1 - x0),
    (MAX_HEIGHT - 2 * pad) / (y1 - y0),
    CUBE_EDGE,
  );
  const ox = (width - (x1 - x0) * scale) / 2;
  const at = (q: SolidXY): SolidXY => ({ x: ox + (q.x - x0) * scale, y: pad + (q.y - y0) * scale });
  return (
    <Svg width={width} height={(y1 - y0) * scale + 2 * pad}>
      {faces.map((f, i) => (
        <Path
          key={i}
          d={pathOf(f.pts.map(at))}
          fill={f.fill}
          stroke={ink.stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** The Bauplan: the ground plan on squared paper, each column's height in its square. */
function Plan({ fig, width }: { fig: CubesFig; width: number }) {
  const { figure: ink } = useTheme();
  const rows = fig.g.length;
  const cols = fig.g[0]?.length ?? 0;
  const cell = Math.min(CELL_MAX, width / cols, MAX_HEIGHT / rows);
  const ox = (width - cols * cell) / 2;
  const out: ReactNode[] = [];
  // The front row at the bottom, as the plan lies in front of her.
  fig.g.forEach((row, r) =>
    row.forEach((h, c) => {
      const x = ox + c * cell;
      const y = (rows - 1 - r) * cell;
      out.push(
        <Rect
          key={`c${r}-${c}`}
          x={x}
          y={y}
          width={cell}
          height={cell}
          fill={h > 0 ? ink.fillSoft : 'none'}
          stroke={h > 0 ? ink.stroke : ink.grid}
          strokeWidth={h > 0 ? 2 : 1}
        />,
      );
      if (h > 0) {
        out.push(
          <HaloText
            key={`n${r}-${c}`}
            x={x + cell / 2}
            y={y + cell / 2 + FONT * 0.4}
            anchor="middle"
            text={String(h)}
            size={FONT + 2}
            color={ink.stroke}
          />,
        );
      }
    }),
  );
  return (
    <Svg width={width} height={rows * cell}>
      {out}
    </Svg>
  );
}

/** A view: the squares one sees, as rows from the top down (`cubesView`). */
function Squares({ grid, width }: { grid: number[][]; width: number }) {
  const { figure: ink } = useTheme();
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const cell = Math.min(VIEW_CELL, width / Math.max(cols, 1), VIEW_HEIGHT / Math.max(rows, 1));
  const ox = (width - cols * cell) / 2;
  return (
    <Svg width={width} height={rows * cell}>
      {grid.flatMap((row, r) =>
        row.map((on, c) =>
          on ? (
            <Rect
              key={`${r}-${c}`}
              x={ox + c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={ink.fillSoft}
              stroke={ink.stroke}
              strokeWidth={2}
            />
          ) : null,
        ),
      )}
    </Svg>
  );
}

/** The building in words: each row from the front, its columns' heights from the left. */
export function describeCubes(fig: CubesFig, t: Translate): string {
  if (fig.v === 'front' || fig.v === 'side' || fig.v === 'top') {
    const rows = cubesView(fig.g, fig.v).map((row) => row.map((x) => (x ? '■' : '□')).join(''));
    return t(`figure.cubes_${fig.v}`, { rows: rows.join(' / ') });
  }
  const rows = fig.g.map((row, r) => t('figure.cubes_row', { n: r + 1, h: row.join(', ') }));
  return t(fig.v === 'plan' ? 'figure.cubes_plan' : 'figure.cubes', { rows: rows.join('; ') });
}
