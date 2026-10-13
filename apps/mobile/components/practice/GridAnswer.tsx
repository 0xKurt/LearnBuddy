// Zeichnen auf dem Raster (issue #249): sie trägt Punkte ein, setzt Punkte auf einen Graphen
// (eine Gerade aus zwei Punkten zeichnet die App gleich mit), spiegelt eine Figur auf Karopapier
// oder zieht die Säulen eines Diagramms. In der Antworthülle wie jede Form (`AnswerShell`, #310):
// das Blatt über seiner einen Tastenreihe, „Prüfen" in der Leiste. Geprüft wird auf dem Server,
// exakt und ohne Modell (apps/api/src/modules/practice/grid.ts).
//
// Bedienung wie die Notenzeile (#275): das Blatt ist EIN Tippziel (`TapSurface`); der Tipp setzt
// den Punkt auf die Kreuzung, die dem Finger am nächsten liegt, bzw. zieht die Säule der Spalte
// bis dorthin. Ein Tipp auf einen eigenen Punkt nimmt ihn weg, „Zurück" macht den letzten Schritt
// rückgängig (lib/practice/gridDraw.ts). Was gezeichnet ist, steht in Worten unter dem Blatt —
// auch für den Screenreader, der es nach jedem Schritt hört.
//
// Gezeichnete Pfeiltasten gibt es nicht mehr (Owner-Regel 8, #599; Design
// components/practice/Answers.jsx `GridBars`, ui_kits/app/Extra.jsx `bars`: Säule antippen,
// − / +). In der einen Tastenreihe (`KeyRow`, der `keys`-Platz der Antworthülle — die eine
// Tastenreihe jeder Form, lib/__tests__/answerShell.test.ts) stehen bei Säulen „−" und „+" und auf
// jedem Blatt „Zurück". Wer keinen Finger auf dem Blatt hat, schiebt den zuletzt gesetzten Punkt
// bzw. wählt und zieht eine Säule ohne gezeichnetes Bedienelement: mit den Aktionen des
// Screenreaders auf dem Blatt, im Browser mit den vier Pfeiltasten (`step`) — der Weg, den die
// Notenzeile seit #608 geht.
//
// Platz (Regel 16): das Blatt nimmt so viel Höhe, wie unter der Frage frei ist, und wird kleiner,
// nie abgeschnitten — nie unter dem kleinsten Kästchen (`gridMinHeight`, `keeps`). Ihr Stand liegt im Entwurf
// (`lib/drafts.ts`): er übersteht hell/dunkel und einen Neustart.

import { PRACTICE } from '../../lib/theme/practice.js';
import { gridDrawnText, type GridDrawTaskView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View, type AccessibilityActionEvent } from 'react-native';

import { announce } from '../../lib/announce.js';
import { useDraft } from '../../lib/drafts.js';
import {
  drawnWords,
  gridAnswer,
  gridComplete,
  gridFrom,
  nextPoint,
  nudge,
  tapBar,
  tapPoint,
  undo,
  type GridKept,
} from '../../lib/practice/gridDraw.js';
import { SPACE } from '../../lib/theme/space.js';
import { useBox } from '../../lib/useBox.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { KeyRow, type Key } from '../lb/KeyRow.js';
import { TapSurface } from '../lb/TapSurface.js';
import {
  barAt,
  crossingAt,
  gridMinHeight,
  gridLayout,
  gridSize,
  GridSheet,
} from '../math/GridSheet.js';
import { AnswerShell } from './AnswerShell.js';
import type { FormProps } from './formProps.js';

/** Height enough for any paper at its natural size: the width decides first. */
const UNBOUNDED = 10_000;
/**
 * The line under the paper: one line of meta text, the gap above it and a little air under it — at
 * exactly a line's height the web cut its descenders off (tests/web/grid.spec.ts, 249c at 360).
 */
const wordsRoom = () => SPACE.sm + TYPE.meta.lineHeight + SPACE.xs;

/**
 * A bar chart has no line under it: its values stand in the question and on its scale, and the line
 * would only repeat them — on 360×740 under a four-line question and Buddy's reply it was the 37 pt
 * too many (tests/web/grid.spec.ts, 249k). A screen reader hears them on the paper itself.
 */
const hasLine = (view: GridDrawTaskView) => view.sheet.mode !== 'bars';

/** The least the answer takes: the paper at its smallest and the line under it. */
function gridAnswerMin(view: GridDrawTaskView): number {
  return gridMinHeight(view) + (hasLine(view) ? wordsRoom() : 0);
}

/**
 * The steps without a finger on the paper, by the name they come in: a screen reader's action on
 * the paper, or an arrow key of a hardware keyboard. `[dx, dy]` in crossings (a bar chart: another
 * bar, or the chosen bar's height).
 */
export const GRID_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
  previous: [-1, 0],
  next: [1, 0],
  increment: [0, 1],
  decrement: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * What a screen reader offers on the paper, and the words it is offered in (`practice:grid.*`):
 * on a bar chart the chosen bar a row higher or lower and the bar before or after it, on every
 * other paper the last point one crossing in each direction.
 */
export const GRID_ACTIONS = {
  bars: [
    ['increment', 'bar_up'],
    ['decrement', 'bar_down'],
    ['previous', 'bar_left'],
    ['next', 'bar_right'],
  ],
  points: [
    ['left', 'left'],
    ['up', 'up'],
    ['down', 'down'],
    ['right', 'right'],
  ],
} as const;

/** "Prüfen": every point set (a bar chart: one bar drawn); `shown` is her drawing in words. */
export function GridAnswer({ view, draftKey, disabled, onSubmit }: FormProps<GridDrawTaskView>) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  const { box, onLayout } = useBox();
  const { now, past } = gridFrom(kept, view);
  const bars = view.sheet.mode === 'bars';

  const natural = box.width > 0 ? gridSize(gridLayout(view, box.width, UNBOUNDED)).height : 0;
  const g = gridLayout(view, box.width, box.height > 0 ? box.height : UNBOUNDED);
  const size = gridSize(g);

  const words = drawnWords(now, view);
  const next = nextPoint(now, view);
  const drawn = bars ? now.bars.some((v) => v > 0) : words.length > 0;
  const line = drawn
    ? [...words, ...(next ? [t('grid.next', { name: next })] : [])].join(' · ')
    : view.sheet.mode === 'graph'
      ? t('grid.how_graph', { count: view.sheet.count })
      : t(`grid.how_${view.sheet.mode}`);

  /** One step on her drawing, said to a screen reader as what is drawn now. */
  const change = (fn: (k: GridKept) => GridKept) => {
    const after = fn({ now, past });
    keep(JSON.stringify(after));
    announce(drawnWords(after.now, view).join(', '));
  };

  /**
   * The way without a finger position (a screen reader, a keyboard): the point she set last one
   * crossing further, or another bar / the chosen bar a row higher or lower. Never drawn — who
   * sees and taps sets a point with her finger (owner rule 8, #599).
   */
  const step = (name: string): boolean => {
    const by = GRID_STEPS[name];
    if (disabled || by === undefined) return false;
    change((k) => nudge(k, view, by[0], by[1]));
    return true;
  };
  const actions = GRID_ACTIONS[bars ? 'bars' : 'points'].map(([name, word]) => ({
    name,
    label: t(`grid.${word}`),
  }));
  const onAction = (e: AccessibilityActionEvent) => void step(e.nativeEvent.actionName);
  /** In the browser the same steps with the arrow keys, while the paper has the focus. */
  const onKeys =
    Platform.OS === 'web'
      ? {
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key.startsWith('Arrow') && step(e.key)) e.preventDefault();
          },
        }
      : {};

  // The keys (ui_kits/app/Extra.jsx `bars`): − and + pull the chosen bar a row; "Zurück" takes
  // the last step back on every paper. No arrow keys.
  const pull = (
    sign: string,
    name: 'increment' | 'decrement',
    word: 'bar_up' | 'bar_down',
  ): Key => ({
    id: name,
    face: sign,
    label: t(`grid.${word}`),
    onPress: () => void step(name),
  });
  const keys: Key[] = [
    ...(bars ? [pull('−', 'decrement', 'bar_down'), pull('+', 'increment', 'bar_up')] : []),
    {
      id: 'undo',
      face: (color) => <Icon name="undo" size={PRACTICE.actionIcon} color={color} />,
      label: t('grid.undo'),
      quiet: true,
      disabled: past.length === 0,
      onPress: () => change(undo),
    },
  ];

  return (
    <AnswerShell
      keeps={gridAnswerMin(view)}
      answer={
        <View testID="answer-grid" style={{ flexShrink: 1, minHeight: 0, gap: SPACE.sm }}>
          {/* The paper: as tall as its width allows, smaller when the screen under the question
              has less, never cut. */}
          <View
            style={{ height: natural, flexShrink: 1, minHeight: gridMinHeight(view) }}
            onLayout={onLayout}
          >
            {/* The target is there before the paper is measured: a screen reader can set a point
                from the first moment (without a finger it lands in the middle). */}
            <View style={{ alignItems: 'center' }} {...onKeys}>
              <TapSurface
                testID="grid-paper"
                accessibilityRole="button"
                style={box.width > 0 ? size : { alignSelf: 'stretch' }}
                accessibilityLabel={`${t(`grid.paper_${view.sheet.mode}`)}: ${line}`}
                accessibilityHint={t(bars ? 'grid.tap_hint_bars' : 'grid.tap_hint')}
                accessibilityActions={actions}
                onAccessibilityAction={onAction}
                disabled={disabled}
                onTap={(at) =>
                  change((k) =>
                    bars
                      ? tapBar(k, view, at && box.width > 0 ? barAt(g, at) : null)
                      : tapPoint(k, view, at && box.width > 0 ? crossingAt(g, at) : null),
                  )
                }
              >
                {box.width > 0 ? <GridSheet view={view} state={now} g={g} /> : null}
              </TapSurface>
            </View>
          </View>
          {/* What is drawn, in words (never the drawing alone); before anything, how to draw. */}
          {hasLine(view) ? (
            <Text
              testID="grid-words"
              numberOfLines={1}
              style={[TYPE.meta, { color: palette.ink2, textAlign: 'center', flexShrink: 0 }]}
            >
              {line}
            </Text>
          ) : null}
        </View>
      }
      keys={<KeyRow keys={keys} label={t('grid.keys_label')} fill disabled={disabled} />}
      action={{
        ready: gridComplete(now),
        disabled,
        waitsHint: t(bars ? 'grid.check_waits_bars' : 'grid.check_waits'),
        onPress: () => {
          const parts = gridAnswer(now, view);
          onSubmit(parts, gridDrawnText(view.sheet, parts));
        },
      }}
    />
  );
}
