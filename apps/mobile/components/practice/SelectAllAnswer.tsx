// Mehrere richtige Antworten (issue #240): „Kreuze alle richtigen an“. Dieselben ruhigen weißen
// Karten wie bei der Auswahl mit einer Antwort (ChoiceList), aber mit dem, was man von einem
// Fragebogen kennt: ein ECKIGES Kästchen statt des runden Buchstabens. Ein Tipp kreuzt an, ein
// zweiter nimmt das Kreuz wieder weg (rückgängig statt bestätigen, docs/UX-PRINCIPLES.md);
// abgeschickt wird erst mit „Prüfen“ — beurteilt auf dem Server, als Menge und ohne Modell
// (apps/api/src/modules/practice/structured.ts).
//
// Dass mehrere richtig sein können, sagt die Fläche selbst, ohne Anleitungstext: die Kästchen,
// und darüber EINE kleine Marke „Mehrere Antworten richtig“. Sie bleibt stehen, während sie
// ankreuzt (nichts rutscht unter dem Finger weg), und tritt erst nach dem ersten „Prüfen“ zur
// Seite: dann sagt Buddys Antwort es („1 von 3 richtigen hast du schon“), und auf 360×740 braucht
// genau diese Antwort den Platz (gemessen, #240). Wie viele richtig sind, steht vorher nirgends:
// das zu finden ist die Aufgabe.
//
// Farbe ist nie das einzige Signal: ein angekreuztes Kästchen trägt den Haken, die Karte einen
// Rand, und ein Screenreader hört „Kontrollkästchen, aktiviert“.

import {
  SELECT_MAX,
  type SelectAllTaskView,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { BottomBar } from './BottomBar.js';
import { CHOICE, twoColumnChoices, wholeWordsStyle } from './ChoiceList.js';
import { PartsArea } from './PartsArea.js';

/** One tap: an option without a tick gets one, a ticked one loses it. */
export function toggle(chosen: readonly string[], id: string): string[] {
  return chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
}

/**
 * Her ticks as kept in the draft (a JSON list of ids), with anything that is not an option of
 * this task — or not a list at all — left out.
 */
export function chosenFrom(kept: string, ids: ReadonlySet<string>): string[] {
  try {
    const list: unknown = JSON.parse(kept || '[]');
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const id of list)
      if (typeof id === 'string' && ids.has(id) && !out.includes(id)) out.push(id);
    return out;
  } catch {
    return [];
  }
}

/**
 * The square box: the same size as the letter it stands in for in the grid (26 pt), so the
 * arithmetic of `twoColumnChoices` holds for it unchanged. Its radius keeps it a square with
 * soft corners — round would read as "one of these".
 */
const BOX = CHOICE.badgeGrid;
const BOX_RADIUS = 8;

function TickBox({ on }: { on: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: BOX,
        height: BOX,
        borderRadius: BOX_RADIUS,
        borderWidth: 1.5,
        borderColor: on ? palette.primary : palette.field,
        backgroundColor: on ? palette.primary : palette.paper,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Icon name="check" size={16} color={palette.paper} /> : null}
    </View>
  );
}

type Props = {
  view: SelectAllTaskView;
  /** Where her ticks are kept (`lib/drafts.ts`): they survive a theme change and a restart. */
  draftKey: string;
  disabled: boolean;
  /** She has checked once already: Buddy's reply says "several" now, the tag steps aside. */
  answered: boolean;
  /** "Prüfen": at least one ticked; `shown` is what she ticked in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function SelectAllAnswer({ view, draftKey, disabled, answered, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = new Set(view.options.map((o) => o.id));
  const chosen = chosenFrom(kept, ids);
  const texts = view.options.map((o) => o.text);
  // Short options two by two, by the same arithmetic as a single choice (issue #203) — up to
  // all six of them: three rows of short forms leave room for Buddy's reply on 360×740.
  const grid = twoColumnChoices(texts, SELECT_MAX);
  // In the grid every tile is as tall as the tallest: a form that wraps ("Nominativ / Pl.")
  // would otherwise make its row taller than the next one, and the board would look ragged.
  // Measured, because only layout knows which label wraps; the first frame has no floor.
  const [tallest, setTallest] = useState(0);

  return (
    <>
      <PartsArea>
        <View style={{ gap: SPACE.sm, paddingBottom: SPACE.xs }}>
          {/* The one mark that says "more than one": a quiet tag with a ticked box in it. */}
          {answered ? null : (
            <View
              testID="select-all-tag"
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.xs,
                paddingVertical: SPACE.xs,
                paddingHorizontal: SPACE.sm,
                borderRadius: SPACE.md,
                backgroundColor: palette.primaryLt,
              }}
            >
              <Icon name="check" size={14} color={palette.primaryDk} />
              <Text style={[TYPE.label, { color: palette.primaryDk, fontWeight: '600' }]}>
                {t('select.several')}
              </Text>
            </View>
          )}
          <View
            style={
              grid
                ? { flexDirection: 'row', flexWrap: 'wrap', gap: CHOICE.gap }
                : { gap: CHOICE.gap }
            }
          >
            {view.options.map((o) => {
              const on = chosen.includes(o.id);
              const spoken = speakMathText(o.text, words);
              return (
                // The card and its shadow sit around the button (Btn clips what is inside it).
                // A ticked card keeps its size: the border is always there, only its colour
                // changes, so nothing moves under the finger.
                <View
                  key={o.id}
                  testID={`select-option-${o.id}`}
                  onLayout={
                    grid
                      ? (e) => {
                          const h = Math.ceil(e.nativeEvent.layout.height);
                          setTallest((was) => (h > was ? h : was));
                        }
                      : undefined
                  }
                  style={[
                    {
                      borderRadius: CHOICE.radius,
                      borderWidth: 1.5,
                      borderColor: on ? palette.primary : 'transparent',
                      backgroundColor: on ? palette.primaryLt : palette.paper,
                    },
                    grid
                      ? { flexBasis: '45%', flexGrow: 1, minHeight: tallest || undefined }
                      : null,
                    on ? null : SHADOW.soft,
                  ]}
                >
                  <Btn
                    variant="ghost"
                    pill
                    full
                    wrap
                    // Compact in both forms: in the grid for the half line (#203), full width so
                    // that a statement of SELECT_OPTION_MAX characters takes two lines, not three.
                    compact
                    grow={grid}
                    checked={on}
                    disabled={disabled}
                    onPress={() =>
                      keep((now) => JSON.stringify(toggle(chosenFrom(now, ids), o.id)))
                    }
                    accessibilityLabel={spoken}
                    label={
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: grid ? CHOICE.badgeGapGrid : SPACE.md,
                        }}
                      >
                        <TickBox on={on} />
                        <MathText
                          text={o.text}
                          accessible={false}
                          style={[
                            {
                              flexShrink: 1,
                              color: on ? palette.primaryDk : palette.ink,
                              fontSize: CHOICE.font,
                              lineHeight: 23,
                              fontWeight: CHOICE.weight,
                            },
                            wholeWordsStyle(o.text, grid),
                          ]}
                        />
                      </View>
                    }
                  >
                    {spoken}
                  </Btn>
                </View>
              );
            })}
          </View>
        </View>
      </PartsArea>
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || chosen.length === 0}
          onPress={() => {
            // In the order she sees them, like the server writes it into the thread.
            const shown = view.options.filter((o) => chosen.includes(o.id));
            onSubmit(
              { type: 'select_all', chosen: shown.map((o) => o.id) },
              shown.map((o) => o.text).join('; '),
            );
          }}
          accessibilityHint={chosen.length === 0 ? t('select.check_waits') : undefined}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}
