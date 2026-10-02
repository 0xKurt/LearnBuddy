// Wo sie in einer Aufgabe mit Teilaufgaben steht (issue #297): a · b · c, wie auf dem Blatt.
//
// Ruhig und ohne Zähler (CLAUDE.md Regel 6 und 16): kein „2 von 3", keine Prozent. Die Teilaufgabe,
// an der sie gerade ist, steht in einer hellen Pille und fett — derselben wie „Frage von Buddy"
// daneben auf der Karte; eine erledigte trägt ein kleines
// Häkchen; was noch kommt, steht leise da. Farbe ist nie das einzige Signal — die Pille hat eine
// Form, das Häkchen ein Zeichen, und ein Screenreader hört „Teilaufgabe b, a erledigt".
//
// Nur eine Anzeige, kein Menü: man springt nicht zwischen Teilaufgaben, b) baut auf a) auf.

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

type Props = {
  /** Every part of the task, in order (['a', 'b', 'c']). */
  labels: readonly string[];
  /** The part on screen. */
  current: string;
  /** The parts that are closed (answered right, or the solution shown). */
  done: ReadonlySet<string>;
};

export function TaskSteps({ labels, current, done }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const closed = labels.filter((l) => done.has(l) && l !== current);
  const said =
    closed.length > 0
      ? t('complex.steps_a11y_done', { current, done: closed.join(', ') })
      : t('complex.steps_a11y', { current });
  return (
    <View
      testID="task-steps"
      accessible
      accessibilityLabel={said}
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}
    >
      {labels.map((label) => {
        const now = label === current;
        const finished = done.has(label) && !now;
        return (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minWidth: 24,
              height: 24,
              paddingHorizontal: SPACE.xs,
              borderRadius: 12,
              backgroundColor: now ? palette.paper : 'transparent',
            }}
          >
            {finished ? <Icon name="check" size={12} color={palette.ink2} /> : null}
            <Text
              style={[
                TYPE.small,
                {
                  color: now ? palette.primaryDk : palette.ink2,
                  fontWeight: now ? '700' : '500',
                },
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
