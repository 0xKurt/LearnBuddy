// Zeichnen auf dem Raster (issue #249): sie trägt Punkte ein, setzt Punkte auf einen Graphen
// (eine Gerade aus zwei Punkten zeichnet die App gleich mit), spiegelt eine Figur auf Karopapier
// oder zieht die Säulen eines Diagramms. In der Antworthülle wie jede Form (`AnswerShell`, #310):
// das Blatt unten über seiner einen Tastenreihe, „Prüfen" in der Leiste. Geprüft wird auf dem
// Server, exakt und ohne Modell (apps/api/src/modules/practice/grid.ts).
//
// Bedienung wie die Notenzeile (#275): das Blatt ist EIN Tippziel (`TapSurface`); der Tipp setzt
// den Punkt auf die Kreuzung, die dem Finger am nächsten liegt, und die Pfeile schieben ihn um eine
// Kreuzung. Ein Tipp auf einen eigenen Punkt nimmt ihn weg, „Zurück" macht den letzten Schritt
// rückgängig (lib/practice/gridDraw.ts). Was gezeichnet ist, steht in Worten unter dem Blatt —
// auch für den Screenreader, der es nach jedem Schritt hört.
//
// Platz (Regel 16): das Blatt nimmt so viel Höhe, wie unter der Frage frei ist, und wird kleiner,
// nie abgeschnitten — nie unter dem kleinsten Kästchen (`gridMinHeight`, `keeps`). Ihr Stand liegt im Entwurf
// (`lib/drafts.ts`): er übersteht hell/dunkel und einen Neustart.

import {
  gridDrawnText,
  type GridDrawTaskView,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

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
import { Icon, type IconName } from '../lb/Icon.js';
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

/** Height enough for any paper at its natural size: the width decides first. */
const UNBOUNDED = 10_000;
/**
 * The line under the paper: one line of meta text, the gap above it and a little air under it — at
 * exactly a line's height the web cut its descenders off (tests/web/grid.spec.ts, 249c at 360).
 */
const wordsRoom = () => SPACE.sm + TYPE.small.lineHeight + SPACE.xs;

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

type Props = {
  view: GridDrawTaskView;
  /** Where her drawing is kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every point set (a bar chart: one bar drawn); `shown` is her drawing in words. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function GridAnswer({ view, draftKey, disabled, onSubmit }: Props) {
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

  const icon = (name: IconName) => (color: string) => <Icon name={name} size={24} color={color} />;
  const chosen = now.selected !== null;
  const arrow = (id: string, face: IconName, dx: number, dy: number): Key => ({
    id,
    face: icon(face),
    label: t(`grid.${bars ? 'bar_' : ''}${id}`),
    disabled: !bars && !chosen,
    onPress: () => change((k) => nudge(k, view, dx, dy)),
  });
  const keys: Key[] = [
    arrow('left', 'back', -1, 0),
    arrow('up', 'up', 0, 1),
    arrow('down', 'down', 0, -1),
    arrow('right', 'chevron', 1, 0),
    {
      id: 'undo',
      face: icon('undo'),
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
            <View style={{ alignItems: 'center' }}>
              <TapSurface
                testID="grid-paper"
                style={box.width > 0 ? size : { alignSelf: 'stretch' }}
                accessibilityLabel={`${t(`grid.paper_${view.sheet.mode}`)}: ${line}`}
                accessibilityHint={t(bars ? 'grid.tap_hint_bars' : 'grid.tap_hint')}
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
              style={[TYPE.small, { color: palette.ink2, textAlign: 'center', flexShrink: 0 }]}
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
