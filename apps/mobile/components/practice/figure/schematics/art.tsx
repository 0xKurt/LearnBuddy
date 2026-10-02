// Our own schematic drawings (issue #252): calm, flat, in the app's pastels — drawn here as code,
// nothing licensed (#224). Every drawing is 100 units wide and as high as its entry in
// packages/shared-types/src/contracts/schematics.ts says; the parts' `at` points there are
// places ON these shapes, which is where a leader line starts. Change a shape, check its point.
//
// Inks come from the palette only (`art`, `lib/theme/palettes.ts`), so every drawing has its own
// tones at night. No text in a drawing: the names are what she is asked for.

import type { SchematicId } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import type { Palette } from '../../../../lib/theme/palettes.js';

export type Ink = Palette['art'] & { danger: string; warning: string; paper: string };

/** A bone as school drawings show it: a light shaft with a fine outline. */
function Bone({ d, w, ink }: { d: string; w: number; ink: Ink }) {
  return (
    <G>
      <Path d={d} stroke={ink.line} strokeWidth={w + 0.9} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={ink.bone} strokeWidth={w} strokeLinecap="round" fill="none" />
    </G>
  );
}

function plantCell(ink: Ink) {
  const chloro = [
    [16, 50, -25],
    [24, 66, 15],
    [46, 12, 0],
    [84, 14, 20],
    [86, 58, 80],
    [58, 64, -10],
  ] as const;
  return (
    <G>
      <Rect
        x={2}
        y={2}
        width={96}
        height={76}
        rx={9}
        fill={ink.leaf}
        stroke={ink.leafDeep}
        strokeWidth={1.4}
      />
      <Rect
        x={7}
        y={7}
        width={86}
        height={66}
        rx={6}
        fill={ink.bone}
        stroke={ink.line}
        strokeWidth={0.6}
      />
      <Ellipse
        cx={64}
        cy={40}
        rx={22}
        ry={17}
        fill={ink.water}
        stroke={ink.waterDeep}
        strokeWidth={0.7}
      />
      <Circle cx={22} cy={30} r={9} fill={ink.lilac} stroke={ink.lilacDeep} strokeWidth={0.8} />
      <Circle cx={24} cy={28} r={3} fill={ink.lilacDeep} />
      {chloro.map(([x, y, r], i) => (
        <G key={i} transform={`rotate(${r} ${x} ${y})`}>
          <Ellipse cx={x} cy={y} rx={5} ry={2.8} fill={ink.leafDeep} />
          <Line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke={ink.leaf} strokeWidth={0.5} />
        </G>
      ))}
      <G transform="rotate(-15 74 68)">
        <Ellipse
          cx={74}
          cy={68}
          rx={5.5}
          ry={2.6}
          fill={ink.petal}
          stroke={ink.petalDeep}
          strokeWidth={0.6}
        />
        <Path
          d="M70 68 L71.5 66.6 L73 69.4 L74.5 66.6 L76 69.4 L77.5 67.8"
          stroke={ink.petalDeep}
          strokeWidth={0.5}
          fill="none"
        />
      </G>
    </G>
  );
}

function animalCell(ink: Ink) {
  const dots = [
    [20, 48],
    [36, 20],
    [70, 18],
    [84, 40],
    [40, 66],
    [64, 68],
    [22, 60],
    [86, 52],
  ] as const;
  return (
    <G>
      <Path
        d="M50 6 C72 4 92 14 94 36 C96 58 82 76 56 75 C30 76 8 66 7 44 C6 22 26 8 50 6 Z"
        fill={ink.tissue}
        stroke={ink.tissueDeep}
        strokeWidth={1.1}
      />
      {dots.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={0.9} fill={ink.tissueDeep} />
      ))}
      <Circle cx={52} cy={44} r={12} fill={ink.lilac} stroke={ink.lilacDeep} strokeWidth={0.8} />
      <Circle cx={55} cy={37} r={3.6} fill={ink.lilacDeep} />
      {[
        [25, 29, -25],
        [76, 60, 20],
      ].map(([x, y, r], i) => (
        <G key={i} transform={`rotate(${r} ${x} ${y})`}>
          <Ellipse
            cx={x}
            cy={y}
            rx={6}
            ry={3}
            fill={ink.petal}
            stroke={ink.petalDeep}
            strokeWidth={0.6}
          />
          <Path
            d={`M${x! - 4} ${y} L${x! - 2.5} ${y! - 1.5} L${x! - 1} ${y! + 1.5} L${x! + 0.5} ${y! - 1.5} L${x! + 2} ${y! + 1.5} L${x! + 3.5} ${y}`}
            stroke={ink.petalDeep}
            strokeWidth={0.5}
            fill="none"
          />
        </G>
      ))}
    </G>
  );
}

function flower(ink: Ink) {
  return (
    <G>
      <Rect x={49} y={78} width={4} height={22} fill={ink.leafDeep} />
      <Path
        d="M44 70 C24 70 6 52 10 30 C22 34 36 48 46 64 Z"
        fill={ink.petal}
        stroke={ink.petalDeep}
        strokeWidth={0.8}
      />
      <Path
        d="M58 70 C78 70 96 52 92 30 C80 34 66 48 56 64 Z"
        fill={ink.petal}
        stroke={ink.petalDeep}
        strokeWidth={0.8}
      />
      <Path d="M44 77 C37 75 31 71 28 64 C35 65 41 69 47 74 Z" fill={ink.leafDeep} />
      <Path d="M58 77 C65 75 71 71 74 64 C67 65 61 69 55 74 Z" fill={ink.leafDeep} />
      <Ellipse cx={51} cy={76} rx={9} ry={4} fill={ink.leafDeep} />
      <Line x1={45} y1={66} x2={31} y2={30} stroke={ink.sandDeep} strokeWidth={1} />
      <Line x1={57} y1={66} x2={71} y2={30} stroke={ink.sandDeep} strokeWidth={1} />
      <Ellipse cx={31} cy={28} rx={3} ry={4.5} fill={ink.sandDeep} />
      <Ellipse cx={71} cy={28} rx={3} ry={4.5} fill={ink.sandDeep} />
      <Ellipse
        cx={51}
        cy={63}
        rx={7}
        ry={8}
        fill={ink.leaf}
        stroke={ink.leafDeep}
        strokeWidth={0.8}
      />
      <Circle cx={49} cy={64} r={1.5} fill={ink.leafDeep} />
      <Circle cx={53} cy={62} r={1.5} fill={ink.leafDeep} />
      <Rect x={49.6} y={27} width={2.8} height={29} fill={ink.leafDeep} />
      <Ellipse cx={51} cy={25} rx={5} ry={3} fill={ink.leafDeep} />
    </G>
  );
}

function plant(ink: Ink) {
  const petals = [0, 72, 144, 216, 288].map((a) => {
    const r = (a * Math.PI) / 180;
    return [51 + Math.sin(r) * 5.5, 14 - Math.cos(r) * 5.5] as const;
  });
  return (
    <G>
      <Rect x={0} y={78} width={100} height={22} fill={ink.sand} />
      <Line x1={0} y1={78} x2={100} y2={78} stroke={ink.sandDeep} strokeWidth={0.8} />
      <Path
        d="M51 78 L51 96 M51 84 C46 88 42 90 36 96 M51 86 C56 90 62 92 68 96 M44 90 C42 94 40 96 38 98 M51 80 C44 84 36 84 28 88"
        stroke={ink.sandDeep}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M51 78 L51 20" stroke={ink.leafDeep} strokeWidth={2.4} />
      <Path d="M51 44 C60 42 68 38 74 34" stroke={ink.leafDeep} strokeWidth={1.6} fill="none" />
      <Path
        d="M50 56 C40 44 26 40 12 46 C24 56 38 58 50 56 Z"
        fill={ink.leaf}
        stroke={ink.leafDeep}
        strokeWidth={0.8}
      />
      <Path d="M50 56 C38 50 26 48 14 46" stroke={ink.leafDeep} strokeWidth={0.5} fill="none" />
      <Path
        d="M52 66 C60 58 72 56 84 60 C76 68 62 70 52 66 Z"
        fill={ink.leaf}
        stroke={ink.leafDeep}
        strokeWidth={0.8}
      />
      <G transform="rotate(50 77 32)">
        <Ellipse cx={77} cy={32} rx={3.5} ry={5.5} fill={ink.petalDeep} />
        <Path d="M73.5 34 C74 37 80 37 80.5 34" fill={ink.leafDeep} />
      </G>
      {petals.map(([x, y], i) => (
        <Circle
          key={i}
          cx={x}
          cy={y}
          r={4.6}
          fill={ink.petal}
          stroke={ink.petalDeep}
          strokeWidth={0.6}
        />
      ))}
      <Circle cx={51} cy={14} r={3.4} fill={ink.sandDeep} />
    </G>
  );
}

function eye(ink: Ink) {
  return (
    <G>
      <Circle cx={58} cy={40} r={32} fill={ink.bone} stroke={ink.line} strokeWidth={0.9} />
      <Circle cx={58} cy={40} r={28.5} fill={ink.glass} />
      <Path
        d="M47.9 12.3 A29.5 29.5 0 1 1 47.9 67.7"
        stroke={ink.petalDeep}
        strokeWidth={1.8}
        fill="none"
      />
      <Path
        d="M86 44 L100 46 L100 56 L86 52 Z"
        fill={ink.sand}
        stroke={ink.sandDeep}
        strokeWidth={0.6}
      />
      <Path
        d="M30 22 C18 28 18 52 30 58 Z"
        fill={ink.water}
        stroke={ink.waterDeep}
        strokeWidth={1.1}
      />
      <Rect x={28} y={20} width={2.6} height={13} rx={1} fill={ink.lilacDeep} />
      <Rect x={28} y={47} width={2.6} height={13} rx={1} fill={ink.lilacDeep} />
      <Ellipse
        cx={35}
        cy={40}
        rx={4.5}
        ry={9.5}
        fill={ink.lilac}
        stroke={ink.lilacDeep}
        strokeWidth={0.7}
      />
      <Line x1={31} y1={20} x2={34} y2={30.5} stroke={ink.line} strokeWidth={0.4} />
      <Line x1={31} y1={60} x2={34} y2={49.5} stroke={ink.line} strokeWidth={0.4} />
    </G>
  );
}

function ear(ink: Ink) {
  return (
    <G>
      <Ellipse cx={56} cy={41} rx={9} ry={10} fill={ink.glass} />
      <Path
        d="M14 8 C2 10 0 30 6 40 C10 48 8 58 14 64 C20 70 26 62 22 54 C18 46 22 40 24 34 C28 22 26 8 14 8 Z"
        fill={ink.tissue}
        stroke={ink.tissueDeep}
        strokeWidth={0.9}
      />
      <Path d="M14 18 C8 22 8 32 12 38" stroke={ink.tissueDeep} strokeWidth={0.6} fill="none" />
      <Path
        d="M20 38 L46 39.5 L46 46.5 L20 47 Z"
        fill={ink.bone}
        stroke={ink.tissueDeep}
        strokeWidth={0.6}
      />
      <Path
        d="M52 48 C56 60 62 68 72 78"
        stroke={ink.tissueDeep}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={47} cy={43} rx={1.4} ry={5.5} fill={ink.petalDeep} />
      <Path
        d="M48.5 41 C50 38 53 38 54 40 M54 40 C55 35 58 34 59.5 36.5 M59.5 36.5 C61 38 62 40 64 40"
        stroke={ink.line}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse
        cx={67}
        cy={38}
        rx={4.5}
        ry={3.5}
        fill={ink.water}
        stroke={ink.waterDeep}
        strokeWidth={0.6}
      />
      <Ellipse cx={67} cy={21} rx={5} ry={8} stroke={ink.waterDeep} strokeWidth={1.5} fill="none" />
      <Ellipse
        cx={76}
        cy={17}
        rx={7}
        ry={4.5}
        stroke={ink.waterDeep}
        strokeWidth={1.5}
        fill="none"
      />
      <G transform="rotate(30 75 26)">
        <Ellipse
          cx={75}
          cy={26}
          rx={4}
          ry={6}
          stroke={ink.waterDeep}
          strokeWidth={1.5}
          fill="none"
        />
      </G>
      <Circle cx={78} cy={48} r={9} fill={ink.water} stroke={ink.waterDeep} strokeWidth={0.8} />
      <Path
        d="M78 48 m0 -2 a2 2 0 1 1 -2 2 a4 4 0 1 1 4 4 a6 6 0 1 1 -6 -6"
        stroke={ink.waterDeep}
        strokeWidth={1}
        fill="none"
      />
    </G>
  );
}

function heart(ink: Ink) {
  const outline =
    'M50 26 C38 18 20 22 18 40 C16 60 34 80 52 94 C68 80 86 62 84 42 C82 24 64 18 50 26 Z';
  return (
    <G>
      <Path d="M14 0 L21 0 L22 34 L15 36 Z" fill={ink.waterDeep} />
      <Path
        d="M38 30 L38 16 C38 12 34 10 28 10"
        stroke={ink.waterDeep}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M56 30 L56 14 C56 4 74 2 78 12 L80 22"
        stroke={ink.petalDeep}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M50 26 C38 18 20 22 18 40 C16 60 34 80 52 94 L52 90 C51 70 50 50 50 30 Z"
        fill={ink.water}
      />
      <Path
        d="M50 26 C64 18 82 24 84 42 C86 62 68 80 52 94 L52 90 C51 70 50 50 50 30 Z"
        fill={ink.petal}
      />
      <Path d="M20 52 C34 55 66 55 82 50" stroke={ink.tissueDeep} strokeWidth={1} fill="none" />
      <Path d="M50 28 C50 50 51 70 52 92" stroke={ink.tissueDeep} strokeWidth={1.8} fill="none" />
      <Path d={outline} stroke={ink.tissueDeep} strokeWidth={1.1} fill="none" />
    </G>
  );
}

function skeleton(ink: Ink) {
  const ribs = [28, 32, 36, 40, 44];
  return (
    <G>
      <Bone d="M30 25 L26 48" w={2.6} ink={ink} />
      <Bone d="M70 25 L74 48" w={2.6} ink={ink} />
      <Bone d="M26 49 L22 68 M27 49 L25 68" w={1.2} ink={ink} />
      <Bone d="M74 49 L78 68 M73 49 L75 68" w={1.2} ink={ink} />
      <Circle cx={21.5} cy={71} r={2.4} fill={ink.bone} stroke={ink.line} strokeWidth={0.4} />
      <Circle cx={78.5} cy={71} r={2.4} fill={ink.bone} stroke={ink.line} strokeWidth={0.4} />
      {Array.from({ length: 12 }, (_, i) => (
        <Rect
          key={i}
          x={48}
          y={20 + i * 3.8}
          width={4}
          height={3}
          rx={1}
          fill={ink.bone}
          stroke={ink.line}
          strokeWidth={0.4}
        />
      ))}
      {ribs.map((y) => (
        <G key={y}>
          <Bone d={`M49 ${y} C43 ${y - 1} 37 ${y + 1} 36 ${y + 5}`} w={1.1} ink={ink} />
          <Bone d={`M51 ${y} C57 ${y - 1} 63 ${y + 1} 64 ${y + 5}`} w={1.1} ink={ink} />
        </G>
      ))}
      <Bone d="M50 23 C44 22 36 23 30 25 M50 23 C56 22 64 23 70 25" w={1.4} ink={ink} />
      <Path
        d="M38 62 C38 58 44 58 50 62 C56 58 62 58 62 62 C62 70 56 74 50 72 C44 74 38 70 38 62 Z"
        fill={ink.bone}
        stroke={ink.line}
        strokeWidth={0.6}
      />
      <Bone d="M44 72 L42 94" w={3} ink={ink} />
      <Bone d="M56 72 L58 94" w={3} ink={ink} />
      <Bone d="M42 97 L42 114" w={2.4} ink={ink} />
      <Bone d="M58 97 L58 114" w={2.4} ink={ink} />
      <Bone d="M39.5 98 L39.5 113 M60.5 98 L60.5 113" w={0.8} ink={ink} />
      <Circle cx={42} cy={95.5} r={1.8} fill={ink.bone} stroke={ink.line} strokeWidth={0.4} />
      <Circle cx={58} cy={95.5} r={1.8} fill={ink.bone} stroke={ink.line} strokeWidth={0.4} />
      <Path
        d="M38 116 L46 116 L46 118 L36 118 Z M54 116 L62 116 L64 118 L54 118 Z"
        fill={ink.bone}
        stroke={ink.line}
        strokeWidth={0.4}
      />
      <Ellipse cx={50} cy={10} rx={8} ry={9} fill={ink.bone} stroke={ink.line} strokeWidth={0.7} />
      <Ellipse cx={47} cy={9} rx={1.8} ry={2.2} fill={ink.metalDeep} />
      <Ellipse cx={53} cy={9} rx={1.8} ry={2.2} fill={ink.metalDeep} />
      <Path d="M46 16 L54 16" stroke={ink.line} strokeWidth={0.5} />
    </G>
  );
}

function tooth(ink: Ink) {
  return (
    <G>
      <Rect x={0} y={50} width={100} height={50} fill={ink.sand} />
      {[
        [10, 72],
        [20, 88],
        [86, 70],
        [80, 92],
        [92, 84],
        [14, 96],
      ].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.6} fill={ink.sandDeep} />
      ))}
      <Path
        d="M28 30 C26 14 34 6 42 8 C46 4 54 4 58 8 C66 6 74 14 72 30 C72 40 70 48 68 54 L64 90 C63 94 58 94 57 90 L52 62 L48 62 L43 90 C42 94 37 94 36 90 L32 54 C30 48 28 40 28 30 Z"
        fill={ink.bone}
        stroke={ink.sandDeep}
        strokeWidth={0.7}
      />
      <Path
        d="M28 30 C26 14 34 6 42 8 C46 4 54 4 58 8 C66 6 74 14 72 30 C72 34 71 38 70 40 L66 40 C67 34 66 22 58 18 C54 16 46 16 42 18 C34 22 33 34 34 40 L30 40 C29 38 28 34 28 30 Z"
        fill={ink.paper}
        stroke={ink.line}
        strokeWidth={0.6}
      />
      <Path
        d="M42 26 C46 22 54 22 58 26 L58 44 L56 60 L60 86 L58 86 L53 62 L47 62 L42 86 L40 86 L44 60 L42 44 Z"
        fill={ink.petalDeep}
      />
      <Path
        d="M0 46 C14 44 22 46 31 52 L32 60 L0 60 Z"
        fill={ink.petal}
        stroke={ink.petalDeep}
        strokeWidth={0.6}
      />
      <Path
        d="M100 46 C86 44 78 46 69 52 L68 60 L100 60 Z"
        fill={ink.petal}
        stroke={ink.petalDeep}
        strokeWidth={0.6}
      />
    </G>
  );
}

function organs(ink: Ink) {
  return (
    <G>
      <Path
        d="M30 4 C30 0 70 0 70 4 L72 12 C86 14 92 22 92 34 L90 104 C90 108 10 108 10 104 L8 34 C8 22 14 14 28 12 Z"
        fill={ink.bone}
        stroke={ink.tissueDeep}
        strokeWidth={0.9}
      />
      <Rect
        x={47.5}
        y={4}
        width={5}
        height={18}
        rx={1.5}
        fill={ink.glass}
        stroke={ink.line}
        strokeWidth={0.5}
      />
      {[7, 10, 13, 16, 19].map((y) => (
        <Line key={y} x1={47.5} y1={y} x2={52.5} y2={y} stroke={ink.line} strokeWidth={0.4} />
      ))}
      <Path
        d="M46 20 C34 18 22 26 20 40 C19 48 22 52 30 50 C38 48 44 44 46 36 Z"
        fill={ink.lilac}
        stroke={ink.lilacDeep}
        strokeWidth={0.7}
      />
      <Path
        d="M54 20 C66 18 78 26 80 40 C81 48 78 52 70 50 C62 48 56 44 54 36 Z"
        fill={ink.lilac}
        stroke={ink.lilacDeep}
        strokeWidth={0.7}
      />
      <Path d="M50 22 L44 28 M50 22 L56 28" stroke={ink.line} strokeWidth={0.8} />
      <G transform="rotate(-20 55 40)">
        <Ellipse cx={55} cy={40} rx={6} ry={7} fill={ink.petalDeep} />
      </G>
      <Path d="M18 50 C34 56 66 56 82 50" stroke={ink.tissueDeep} strokeWidth={0.8} fill="none" />
      <Path
        d="M18 54 C30 52 50 54 56 58 C50 64 34 66 22 64 C18 62 17 58 18 54 Z"
        fill={ink.tissueDeep}
      />
      <Path
        d="M60 54 C70 50 80 54 78 62 C76 70 66 72 60 66 C64 64 66 60 60 58 Z"
        fill={ink.petal}
        stroke={ink.petalDeep}
        strokeWidth={0.7}
      />
      <Ellipse cx={50} cy={84} rx={20} ry={12} fill={ink.sand} />
      <Path
        d="M34 80 C38 76 42 84 46 80 C50 76 54 84 58 80 C62 76 66 84 66 84 M34 88 C38 84 42 92 46 88 C50 84 54 92 58 88 C62 84 66 90 66 90"
        stroke={ink.sandDeep}
        strokeWidth={0.9}
        fill="none"
      />
      <Path
        d="M24 98 L24 72 C24 68 28 66 32 66 L68 66 C72 66 76 68 76 72 L76 98"
        stroke={ink.sandDeep}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

function insect(ink: Ink) {
  const leg = (d: string) => (
    <Path d={d} stroke={ink.line} strokeWidth={0.9} strokeLinejoin="round" fill="none" />
  );
  return (
    <G>
      {leg('M43 29 L32 24 L26 16')}
      {leg('M42 33 L30 36 L18 40')}
      {leg('M43 37 L34 46 L28 58')}
      {leg('M57 29 L68 24 L74 16')}
      {leg('M58 33 L70 36 L82 40')}
      {leg('M57 37 L66 46 L72 58')}
      <Path d="M47 11 C44 4 40 2 36 3" stroke={ink.line} strokeWidth={0.8} fill="none" />
      <Path d="M53 11 C56 4 60 2 64 3" stroke={ink.line} strokeWidth={0.8} fill="none" />
      <Ellipse
        cx={50}
        cy={64}
        rx={13}
        ry={20}
        fill={ink.sand}
        stroke={ink.sandDeep}
        strokeWidth={0.8}
      />
      {[56, 64, 72].map((y) => (
        <Path
          key={y}
          d={`M${38.5} ${y} C44 ${y + 2} 56 ${y + 2} ${61.5} ${y}`}
          stroke={ink.sandDeep}
          strokeWidth={1.4}
          fill="none"
        />
      ))}
      <Ellipse cx={50} cy={33} rx={9} ry={8} fill={ink.sandDeep} />
      <G transform="rotate(-20 64 48)" opacity={0.85}>
        <Ellipse
          cx={64}
          cy={48}
          rx={8}
          ry={19}
          fill={ink.glass}
          stroke={ink.waterDeep}
          strokeWidth={0.7}
        />
      </G>
      <G transform="rotate(20 36 48)" opacity={0.85}>
        <Ellipse
          cx={36}
          cy={48}
          rx={8}
          ry={19}
          fill={ink.glass}
          stroke={ink.waterDeep}
          strokeWidth={0.7}
        />
      </G>
      <Circle cx={50} cy={16} r={6.4} fill={ink.sandDeep} />
      <Ellipse cx={45} cy={15} rx={2.4} ry={3.2} fill={ink.line} />
      <Ellipse cx={55} cy={15} rx={2.4} ry={3.2} fill={ink.line} />
    </G>
  );
}

function microscope(ink: Ink) {
  return (
    <G>
      <Path
        d="M30 96 L80 96 C84 96 86 100 84 104 L28 104 C24 104 24 96 30 96 Z"
        fill={ink.metalDeep}
      />
      <Path
        d="M66 94 C80 82 82 52 72 30 L63 30 C71 50 71 76 59 90 Z"
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.8}
      />
      <Rect
        x={44}
        y={22}
        width={22}
        height={6}
        rx={1}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.6}
      />
      <Rect
        x={37}
        y={14}
        width={9}
        height={26}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.7}
      />
      <Rect x={35.5} y={4} width={12} height={10} rx={1.5} fill={ink.metalDeep} />
      <Path d="M33 40 L50 40 L48 45 L35 45 Z" fill={ink.metalDeep} />
      <Rect
        x={36.5}
        y={45}
        width={4.5}
        height={8}
        rx={0.8}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.5}
      />
      <Rect
        x={43}
        y={45}
        width={3.5}
        height={6}
        rx={0.8}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.5}
      />
      <Rect x={20} y={56} width={48} height={3.6} rx={1} fill={ink.metalDeep} />
      <Path d="M26 56 L33 54 M52 56 L58 54" stroke={ink.line} strokeWidth={0.8} />
      <Rect x={37} y={81} width={6} height={15} fill={ink.metalDeep} />
      <Ellipse
        cx={40}
        cy={79}
        rx={6.5}
        ry={3.2}
        fill={ink.flame}
        stroke={ink.metalDeep}
        strokeWidth={0.6}
      />
      <Circle cx={74} cy={62} r={5.5} fill={ink.metalDeep} stroke={ink.line} strokeWidth={0.6} />
      <Circle cx={74} cy={62} r={2} fill={ink.metal} />
    </G>
  );
}

function burner(ink: Ink) {
  return (
    <G>
      <Path d="M50.5 28 C40 22 42 10 50.5 2 C59 10 61 22 50.5 28 Z" fill={ink.flame} />
      <Path d="M50.5 27 C46.5 22 47 15 50.5 10 C54 15 54.5 22 50.5 27 Z" fill={ink.flameCore} />
      <Rect
        x={46}
        y={28}
        width={9}
        height={60}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.7}
      />
      <Rect x={44} y={68} width={13} height={8} rx={1} fill={ink.metalDeep} />
      <Rect x={48.5} y={70} width={4} height={4} rx={0.6} fill={ink.line} />
      <Rect
        x={8}
        y={81.5}
        width={38}
        height={5}
        fill={ink.metal}
        stroke={ink.metalDeep}
        strokeWidth={0.6}
      />
      <Path d="M8 80 L4 80 L4 88 L8 88 Z" fill={ink.metalDeep} />
      <Path d="M30 88 L70 88 C76 88 78 96 74 98 L26 98 C22 96 24 88 30 88 Z" fill={ink.metalDeep} />
    </G>
  );
}

function glassware(ink: Ink) {
  const glass = { fill: ink.glass, stroke: ink.line, strokeWidth: 0.7 } as const;
  return (
    <G>
      <Line x1={2} y1={58.4} x2={98} y2={58.4} stroke={ink.metalDeep} strokeWidth={0.8} />
      <Path d="M7 8 L13 8 L13 52 C13 57 7 57 7 52 Z" {...glass} />
      <Path d="M7.4 40 L12.6 40 L12.6 52 C12.6 56 7.4 56 7.4 52 Z" fill={ink.water} />
      <Path
        d="M19 21 L39 21 M20 22 L20 56 C20 57.5 21 58 22 58 L36 58 C37 58 38 57.5 38 56 L38 22"
        {...glass}
      />
      <Path
        d="M20.4 42 L37.6 42 L37.6 56 C37.6 57 37 57.6 36 57.6 L22 57.6 C21 57.6 20.4 57 20.4 56 Z"
        fill={ink.water}
      />
      {[30, 36, 42, 48].map((y) => (
        <Line key={y} x1={20} y1={y} x2={24} y2={y} stroke={ink.line} strokeWidth={0.4} />
      ))}
      <Path
        d="M47 12 L53 12 L53 30 L60 56 C60.5 57.5 59.5 58 58 58 L42 58 C40.5 58 39.5 57.5 40 56 L47 30 Z"
        {...glass}
      />
      <Path
        d="M43.6 44 L56.4 44 L59.6 56 C60 57.4 59.4 57.6 58 57.6 L42 57.6 C40.6 57.6 40 57.4 40.4 56 Z"
        fill={ink.water}
      />
      <Rect x={67.5} y={10} width={5} height={24} {...glass} />
      <Circle cx={70} cy={45} r={12} {...glass} />
      <Path d="M58.4 47 A11.6 11.6 0 0 0 81.6 47 Z" fill={ink.water} />
      <Path d="M86 8 L94 8 L94 54 L96 58 L84 58 L86 54 Z" {...glass} />
      <Rect x={86.4} y={34} width={7.2} height={20} fill={ink.water} />
      {[16, 22, 28, 34, 40, 46].map((y) => (
        <Line key={y} x1={86} y1={y} x2={89} y2={y} stroke={ink.line} strokeWidth={0.4} />
      ))}
    </G>
  );
}

function bicycle(ink: Ink) {
  const wheel = (cx: number) => (
    <G>
      <Circle cx={cx} cy={44} r={16} stroke={ink.line} strokeWidth={2} fill="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        return (
          <Line
            key={i}
            x1={cx + Math.cos(a) * 15}
            y1={44 + Math.sin(a) * 15}
            x2={cx - Math.cos(a) * 15}
            y2={44 - Math.sin(a) * 15}
            stroke={ink.metalDeep}
            strokeWidth={0.3}
          />
        );
      })}
      <Circle cx={cx} cy={44} r={1.6} fill={ink.line} />
    </G>
  );
  return (
    <G>
      {wheel(20)}
      {wheel(80)}
      <Path
        d="M20 44 L38 44 L62 22 L32 21 Z M38 44 L30 17 M64 15 L80 44"
        stroke={ink.lilacDeep}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M8 24 L30 24 M12 24 L20 44" stroke={ink.metalDeep} strokeWidth={1.2} fill="none" />
      <Path d="M26 14 L38 14 C38 17 30 17 26 15.4 Z" fill={ink.line} />
      <Rect x={4.5} y={24.5} width={4} height={3.5} rx={0.8} fill={ink.danger} />
      <Path
        d="M64 15 L61 9 L71 8.5"
        stroke={ink.line}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={68} cy={10} r={2} fill={ink.metal} stroke={ink.line} strokeWidth={0.5} />
      <Rect x={75.5} y={25.5} width={5} height={3} rx={0.6} fill={ink.line} />
      <Rect
        x={82}
        y={20}
        width={6}
        height={4.4}
        rx={1.2}
        fill={ink.sand}
        stroke={ink.line}
        strokeWidth={0.6}
      />
      <Path d="M38 44 L45 52" stroke={ink.line} strokeWidth={1.2} />
      <Rect x={42} y={51} width={6.5} height={2.6} rx={0.6} fill={ink.line} />
      <Rect x={43} y={51.4} width={2.2} height={1.8} fill={ink.warning} />
      <G transform="rotate(35 86 50)">
        <Rect x={84} y={49} width={4.5} height={2.2} rx={0.6} fill={ink.warning} />
      </G>
      <Circle cx={38} cy={44} r={3} stroke={ink.line} strokeWidth={0.8} fill="none" />
    </G>
  );
}

export const ART: Record<SchematicId, (ink: Ink) => ReactNode> = {
  plant_cell: plantCell,
  animal_cell: animalCell,
  flower,
  plant,
  eye,
  ear,
  heart,
  skeleton,
  tooth,
  organs,
  insect,
  microscope,
  burner,
  glassware,
  bicycle,
};
