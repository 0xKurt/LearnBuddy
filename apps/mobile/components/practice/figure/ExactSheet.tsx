// "Eingeben": every interactive figure can be answered without aiming a finger at it
// (issues #248, #249). A screen reader cannot tap a grid point, a finger may not want to —
// so next to every figure is a button that opens this sheet, where the same value is set one
// step at a time (`Stepper`: − and + buttons, and an adjustable value a screen reader moves
// with a swipe). It writes into the same draft as a tap, so the figure behind shows the same
// thing, and "Prüfen" sends the same `parts`. One way to answer, two ways to set it.
//
// It stays closed until she opens it (progressive disclosure, docs/UX-PRINCIPLES.md): the
// figure is the way for most, this is the way for everyone.

import {
  circuitParts,
  elementId,
  tableElements,
  WHEEL_IDS,
  wheelIndex,
  type FigureTapTaskView,
  type GridDrawTaskView,
  type TapValue,
} from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  gridValue,
  samePoint,
  stepsBetween,
  type Pt,
} from '../../../../../packages/shared-math/src/grid.js';
import { wheelWord } from '../../../lib/figure/library.js';
import { toggleCell, togglePoint, type Drawing } from '../../../lib/math/gridFrame.js';
import { SPACE } from '../../../lib/theme/space.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../../lib/theme/type.js';
import { Btn } from '../../lb/Btn.js';
import { Sheet } from '../../lb/Sheet.js';
import { Stepper } from '../../lb/Stepper.js';
import { formatNumber } from '../../math/FigureView.js';

/** A value on a grid from `min` to `max`: one step less or more, never past the ends. */
function Axis({
  name,
  value,
  min,
  max,
  step,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation('practice');
  const n = stepsBetween(min, max, step) ?? 0;
  const i = Math.round((value - min) / step);
  return (
    <Stepper
      label={name}
      value={formatNumber(value)}
      canLess={i > 0}
      canMore={i < n}
      position={{ now: i, count: n + 1 }}
      onLess={() => onChange(gridValue(min, step, Math.max(0, i - 1)))}
      onMore={() => onChange(gridValue(min, step, Math.min(n, i + 1)))}
      lessLabel={t('figure.less', { name })}
      moreLabel={t('figure.more', { name })}
    />
  );
}

/** A value that goes round (the hour, the minutes): past the end it starts again. */
function Round({
  name,
  value,
  shown,
  values,
  onChange,
}: {
  name: string;
  value: number;
  shown: string;
  values: readonly number[];
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation('practice');
  const i = Math.max(0, values.indexOf(value));
  const n = values.length;
  return (
    <Stepper
      label={name}
      value={shown}
      canLess
      canMore
      position={{ now: i, count: n }}
      onLess={() => onChange(values[(i - 1 + n) % n]!)}
      onMore={() => onChange(values[(i + 1) % n]!)}
      lessLabel={t('figure.less', { name })}
      moreLabel={t('figure.more', { name })}
    />
  );
}

function Frame({
  open,
  onClose,
  readout,
  children,
}: {
  open: boolean;
  onClose: () => void;
  readout: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  return (
    <Sheet
      visible={open}
      title={t('figure.exact_title')}
      closeLabel={t('figure.done')}
      onClose={onClose}
    >
      <View style={{ gap: SPACE.md }}>
        <Text
          accessibilityLiveRegion="polite"
          style={[TYPE.body, { color: palette.ink, fontWeight: '600' }]}
        >
          {readout}
        </Text>
        {children}
      </View>
    </Sheet>
  );
}

/** A clock time as she reads it: 3:05. */
export function clockText(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function TapExactSheet({
  view,
  value,
  readout,
  open,
  onClose,
  onChange,
}: {
  view: FigureTapTaskView;
  value: TapValue | null;
  readout: string;
  open: boolean;
  onClose: () => void;
  onChange: (v: TapValue) => void;
}) {
  const { t } = useTranslation('practice');
  const fig = view.figure;
  let body: React.ReactNode = null;
  switch (fig.kind) {
    case 'plane': {
      const g = fig.grid;
      const p =
        value?.kind === 'plane'
          ? value
          : {
              kind: 'plane' as const,
              x: Math.min(g.x_max, Math.max(g.x_min, 0)),
              y: Math.min(g.y_max, Math.max(g.y_min, 0)),
            };
      body = (
        <>
          <Axis
            name="x"
            value={p.x}
            min={g.x_min}
            max={g.x_max}
            step={g.step}
            onChange={(x) => onChange({ ...p, x })}
          />
          <Axis
            name="y"
            value={p.y}
            min={g.y_min}
            max={g.y_max}
            step={g.step}
            onChange={(y) => onChange({ ...p, y })}
          />
        </>
      );
      break;
    }
    case 'number_line': {
      const v =
        value?.kind === 'number_line' ? value.value : Math.min(fig.max, Math.max(fig.min, 0));
      body = (
        <Axis
          name={t('figure.number')}
          value={v}
          min={fig.min}
          max={fig.max}
          step={fig.snap}
          onChange={(next) => onChange({ kind: 'number_line', value: next })}
        />
      );
      break;
    }
    case 'bars':
      body = (
        <View accessibilityRole="radiogroup" style={{ gap: SPACE.sm }}>
          {fig.bars.map((b) => (
            <Btn
              key={b.id}
              variant={value?.kind === 'bars' && value.id === b.id ? 'primary' : 'outline'}
              selected={value?.kind === 'bars' && value.id === b.id}
              full
              onPress={() => onChange({ kind: 'bars', id: b.id })}
            >
              {t('figure.bar_choice', {
                label: b.label,
                value: `${formatNumber(b.value)}${fig.unit ? ` ${fig.unit}` : ''}`,
              })}
            </Btn>
          ))}
        </View>
      );
      break;
    case 'clock': {
      const c = value?.kind === 'clock' ? value : { kind: 'clock' as const, h: 12, m: 0 };
      const minutes = Array.from({ length: 60 / fig.snap }, (_, i) => i * fig.snap);
      body = (
        <>
          <Round
            name={t('figure.hour')}
            value={c.h}
            shown={String(c.h)}
            values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
            onChange={(h) => onChange({ ...c, h })}
          />
          <Round
            name={t('figure.minutes')}
            value={c.m}
            shown={String(c.m).padStart(2, '0')}
            values={minutes}
            onChange={(m) => onChange({ ...c, m })}
          />
        </>
      );
      break;
    }
    // The figure library (#250, #252, #261): one step through the elements in the order of their
    // atomic numbers, or one button per pin, colour or lamp — the same value a tap sets.
    case 'periodic': {
      const els = tableElements(fig.table);
      const ids = els.map(elementId);
      const now = value?.kind === 'periodic' ? ids.indexOf(value.id) : -1;
      const at = Math.max(0, now);
      body = (
        <Stepper
          label={t('figure.element')}
          value={now < 0 ? '–' : `${els[at]!.sym} (${els[at]!.z})`}
          canLess
          canMore
          position={{ now: at, count: ids.length }}
          onLess={() =>
            onChange({ kind: 'periodic', id: ids[(at - 1 + ids.length) % ids.length]! })
          }
          onMore={() =>
            onChange({ kind: 'periodic', id: ids[now < 0 ? 0 : (at + 1) % ids.length]! })
          }
          lessLabel={t('figure.less', { name: t('figure.element') })}
          moreLabel={t('figure.more', { name: t('figure.element') })}
        />
      );
      break;
    }
    case 'schematic':
      body = (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}
        >
          {fig.parts.map((id, i) => {
            const on = value?.kind === 'schematic' && value.id === id;
            return (
              <Btn
                key={id}
                variant={on ? 'primary' : 'outline'}
                selected={on}
                onPress={() => onChange({ kind: 'schematic', id })}
              >
                {t('figure.pin', { n: i + 1 })}
              </Btn>
            );
          })}
        </View>
      );
      break;
    case 'color_wheel': {
      const names = WHEEL_IDS.map((id) => wheelWord(t(`figure.wheel.${id}`)));
      const i = value?.kind === 'color_wheel' ? wheelIndex(value.id) : -1;
      body = (
        <Round
          name={t('figure.color')}
          value={i}
          shown={i < 0 ? '–' : names[i]!}
          values={WHEEL_IDS.map((_, k) => k)}
          onChange={(k) => onChange({ kind: 'color_wheel', id: WHEEL_IDS[k]! })}
        />
      );
      break;
    }
    case 'circuit':
      body = (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}
        >
          {circuitParts(fig.circuit)
            .filter((p) => p.part === 'lamp')
            .map((p) => {
              const on = value?.kind === 'circuit' && value.id === p.id;
              return (
                <Btn
                  key={p.id}
                  variant={on ? 'primary' : 'outline'}
                  selected={on}
                  onPress={() => onChange({ kind: 'circuit', id: p.id })}
                >
                  {p.id.toUpperCase()}
                </Btn>
              );
            })}
        </View>
      );
      break;
  }
  return (
    <Frame open={open} onClose={onClose} readout={readout}>
      {body}
    </Frame>
  );
}

export function DrawExactSheet({
  view,
  drawing,
  readout,
  open,
  onClose,
  onChange,
}: {
  view: GridDrawTaskView;
  drawing: Drawing;
  readout: string;
  open: boolean;
  onClose: () => void;
  onChange: (d: Drawing) => void;
}) {
  const { t } = useTranslation('practice');
  const g = view.grid;
  const start = (): Pt => ({
    x: Math.min(g.x_max - (view.tool === 'cells' ? g.step : 0), Math.max(g.x_min, 0)),
    y: Math.min(g.y_max - (view.tool === 'cells' ? g.step : 0), Math.max(g.y_min, 0)),
  });
  // Where the next point or square goes: kept while the sheet is open, starting at 0 | 0.
  const [cursor, setCursor] = useState<Pt>(start);
  let body: React.ReactNode;
  if (view.tool === 'bars') {
    body = view.bars.map((b) => {
      const bar = drawing.bars.find((x) => x.id === b.id);
      return (
        <Axis
          key={b.id}
          name={b.label}
          value={bar?.value ?? g.y_min}
          min={g.y_min}
          max={g.y_max}
          step={g.step}
          onChange={(v) =>
            onChange({
              ...drawing,
              bars: drawing.bars.map((x) => (x.id === b.id ? { ...x, value: v } : x)),
            })
          }
        />
      );
    });
  } else {
    const cells = view.tool === 'cells';
    const xMax = cells ? g.x_max - g.step : g.x_max;
    const yMax = cells ? g.y_max - g.step : g.y_max;
    const there = cells
      ? drawing.cells.some((c) => samePoint(c, cursor, g.step))
      : drawing.points.some((p) => samePoint(p, cursor, g.step));
    body = (
      <>
        <Axis
          name="x"
          value={cursor.x}
          min={g.x_min}
          max={xMax}
          step={g.step}
          onChange={(x) => setCursor({ ...cursor, x })}
        />
        <Axis
          name="y"
          value={cursor.y}
          min={g.y_min}
          max={yMax}
          step={g.step}
          onChange={(y) => setCursor({ ...cursor, y })}
        />
        <Btn
          variant={there ? 'outline' : 'soft'}
          pill
          full
          onPress={() =>
            onChange(
              cells
                ? { ...drawing, cells: toggleCell(drawing.cells, cursor, g.step) }
                : { ...drawing, points: togglePoint(drawing.points, cursor, g.step, view.needs) },
            )
          }
        >
          {cells
            ? t(there ? 'draw.clear_cell' : 'draw.fill_cell')
            : t(there ? 'draw.remove_point' : 'draw.set_point')}
        </Btn>
      </>
    );
  }
  return (
    <Frame open={open} onClose={onClose} readout={readout}>
      {body}
    </Frame>
  );
}
