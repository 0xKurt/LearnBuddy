// Buddy's feedback on a version of her long text (issue #258): a card over the thread's full
// width under his short reply bubble ("Erörterung – so steht dein Text", `ItemThread`). Inside the
// bubble it had three quarters of the width and her quotes broke after three or four words (issue
// #525). docs/architecture.md §Practice („Lange Texte").
//
// What it shows is what the server checked (`EssayFeedback`, contracts/essay.ts), nothing more:
//   · each key point of the text type with a calm state — "geschafft" with her own words that
//     carry it, or "noch offen" with what she can do. A sign AND a word, never colour alone, and
//     never "falsch": an open point is a next step. A point the server has no judgement on
//     (`unknown`) is not shown;
//   · up to three places to improve, each her quote and one line;
//   · the next step: revise (her text is still in the field), or that this was the last version.
// Her words are marked as hers the way her answers are: in the violet of her bubbles, in quotation
// marks, with a rule beside them — and a screen reader hears "Deine Worte". No number, no grade.

import type { EssayFeedback as Feedback } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

/** The round sign before a point: about one line of body text high. */
const SIGN = 22;

export function EssayFeedback({ feedback }: { feedback: Feedback }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const points = feedback.points.filter((p) => p.state !== 'unknown');
  return (
    <View testID="essay-feedback" style={{ gap: SPACE.md }}>
      <View style={{ gap: SPACE.md }}>
        {points.map((p) => {
          const met = p.state === 'met';
          return (
            <View key={p.name} testID="essay-point" style={{ gap: SPACE.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <View
                  style={{
                    width: SIGN,
                    height: SIGN,
                    // A corner as large as the sign: it rounds to a circle.
                    borderRadius: SIGN,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: met ? palette.mint : palette.canvas,
                  }}
                >
                  <Icon
                    name={met ? 'check' : 'arrow'}
                    size={14}
                    color={met ? palette.successText : palette.ink2}
                  />
                </View>
                <Text style={[TYPE.body, { flex: 1, fontWeight: '600', color: palette.ink }]}>
                  {p.name}
                </Text>
                <Text style={[TYPE.caption, { color: met ? palette.successText : palette.ink2 }]}>
                  {t(met ? 'essay.met' : 'essay.open')}
                </Text>
              </View>
              {met && p.quote ? <HerWords text={p.quote} /> : null}
              {!met && p.missing ? (
                <Text style={[TYPE.small, { color: palette.ink2, marginLeft: SIGN + SPACE.sm }]}>
                  {p.missing}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      {feedback.places.length > 0 ? (
        <View style={{ gap: SPACE.md }}>
          <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('essay.places')}</Text>
          {feedback.places.map((place) => (
            <View key={place.quote} testID="essay-place" style={{ gap: SPACE.xs }}>
              <HerWords text={place.quote} flush />
              <Text style={[TYPE.small, { color: palette.ink }]}>{place.better}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={[TYPE.small, { color: palette.ink2 }]}>
        {t(feedback.last ? 'essay.last' : 'essay.revise')}
      </Text>
    </View>
  );
}

/** Her own words: violet like her bubbles, in quotation marks, with a rule — and said as hers. */
function HerWords({ text, flush = false }: { text: string; flush?: boolean }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const quoted = t('essay.quote', { text });
  return (
    <View
      accessible
      accessibilityLabel={`${t('essay.her_words')}: ${quoted}`}
      style={{
        marginLeft: flush ? 0 : SIGN + SPACE.sm,
        paddingLeft: SPACE.sm,
        borderLeftWidth: 3,
        borderLeftColor: palette.primary,
      }}
    >
      <Text style={[TYPE.small, { color: palette.primaryDk, fontStyle: 'italic' }]}>{quoted}</Text>
    </View>
  );
}
