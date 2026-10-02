// Reihenfolge (issue #228): sie tippt die Elemente nacheinander an, und jedes bekommt seine
// Nummer — 1, 2, 3 … Ein Tipp auf ein nummeriertes Element nimmt es zurück, und alles, was
// danach kam, gleich mit: rückgängig statt bestätigen (docs/UX-PRINCIPLES.md). Sind alle
// eingeordnet, schickt „Prüfen" die Reihenfolge als `parts` — geprüft wird auf dem Server,
// exakt und ohne Modell (apps/api/src/modules/practice/structured.ts).
//
// Die Elemente bleiben, wo sie stehen; was sich ändert, ist ihre Nummer. So springt nichts
// unter dem Finger weg, und die Karte bleibt so hoch, wie sie war (Regel 16: 8 Elemente
// müssen auf 360×740 passen).
//
// Farbe ist nie das einzige Signal: die Nummer steht im Kreis, und ein Screenreader hört
// „…, Platz 2" bzw. „…, noch ohne Platz". Mehr gibt es nicht — eine Zeile Anleitung, die
// Elemente, „Prüfen" (Minimalismus, Owner 02.10.: „Möglichst einfach bedienbar").

import type { OrderTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { BottomBar } from './BottomBar.js';

/**
 * One tap: an element without a place gets the next one; an element with a place goes
 * back, together with every element placed after it (they depended on it).
 */
export function placeOrTake(placed: readonly string[], id: string): string[] {
  const at = placed.indexOf(id);
  return at === -1 ? [...placed, id] : placed.slice(0, at);
}

/**
 * Her arrangement as kept in the draft (a JSON list of ids), with anything that is not an
 * element of this task — or not a list at all — left out.
 */
export function placedFrom(kept: string, ids: ReadonlySet<string>): string[] {
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

/** The round number in front of an element; an empty ring while it has no place. */
const BADGE = 26;

function PlaceBadge({ n }: { n: number | null }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: BADGE,
        height: BADGE,
        borderRadius: BADGE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: n === null ? palette.paper : palette.primary,
        borderWidth: n === null ? 1.5 : 0,
        borderColor: palette.field,
      }}
    >
      {n === null ? null : (
        <Text style={{ color: palette.paper, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>
          {n}
        </Text>
      )}
    </View>
  );
}

type Props = {
  view: OrderTaskView;
  /**
   * Where her arrangement is kept (`lib/drafts.ts`): it survives a theme change, which
   * remounts the tree (ThemeProvider), and Android killing the app — like a typed answer.
   */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": every element placed; `shown` is her order in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function OrderAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const ids = new Set(view.elements.map((e) => e.id));
  const placed = placedFrom(kept, ids);
  const total = view.elements.length;
  const complete = placed.length === total;
  const textOf = new Map(view.elements.map((e) => [e.id, e.text]));

  return (
    <>
      <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.sm }}>
        {/* The one line of instruction, only until she has started: after that the numbers
            say it, and Buddy's reply to a check needs the room on a 360×740 phone. */}
        {placed.length === 0 ? (
          <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('order.how')}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          {view.elements.map((e) => {
            const at = placed.indexOf(e.id);
            const n = at === -1 ? null : at + 1;
            const spoken = speakMathText(e.text, words);
            return (
              // The wrapper keeps a long step inside the screen: it may take the whole line
              // and wrap, a short number sits next to its neighbours.
              <View key={e.id} style={{ maxWidth: '100%' }}>
                <Btn
                  variant={n === null ? 'outline' : 'soft'}
                  size="sm"
                  wrap
                  compact
                  disabled={disabled}
                  onPress={() =>
                    keep((now) => JSON.stringify(placeOrTake(placedFrom(now, ids), e.id)))
                  }
                  accessibilityLabel={
                    n === null
                      ? t('order.element_open', { text: spoken })
                      : t('order.element_placed', { text: spoken, n })
                  }
                  accessibilityHint={
                    n === null
                      ? t('order.hint_open', { n: placed.length + 1 })
                      : t('order.hint_placed')
                  }
                  label={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <PlaceBadge n={n} />
                      <MathText
                        text={e.text}
                        accessible={false}
                        style={{
                          flexShrink: 1,
                          color: n === null ? palette.ink : palette.primaryDk,
                          fontSize: 15,
                          lineHeight: 20,
                          fontWeight: '600',
                        }}
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
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || !complete}
          onPress={() =>
            onSubmit(
              { type: 'order', order: placed },
              placed.map((id) => textOf.get(id) ?? '').join(' → '),
            )
          }
          accessibilityHint={complete ? undefined : t('order.check_waits')}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}
