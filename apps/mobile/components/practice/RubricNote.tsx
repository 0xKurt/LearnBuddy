// What stands next to Buddy's sentence when she explained something or wrote a text (issues
// #236, #258): the key points or required elements, each with whether it is in her words — and,
// for an essay, up to three places from her own text to improve.
//
// The sentence above it says the ONE next step (a follow-up question, or what to add); this list
// shows what already carries. It is the server's measurement (`RubricFeedback`), shown as it is:
// - every row carries its state in WORDS ("drin" / "fehlt noch") and in the mark's SHAPE (a check
//   in a filled circle, an empty ring) — never colour alone;
// - no count, no share, no grade anywhere (CLAUDE.md rule 6, #258 "keine Note, keine Punktzahl");
// - a place to improve is HER quote (the server found it in her text), set apart like a quote,
//   with one sentence on how it gets better.
// It lines up with Buddy's bubble (past the orb), like PronunciationNote, so it reads as his.

import type { RubricFeedback } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

/** The orb beside Buddy's bubble (26) and the gap after it (8): the note starts where his words do. */
const BUBBLE_INDENT = 34;
/** The mark in front of a point: big enough to read as a sign, small enough to sit in a line of text. */
const MARK = 20;

export function RubricNote({ feedback }: { feedback: RubricFeedback }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  if (feedback.points.length === 0 && feedback.spots.length === 0) return null;
  return (
    <View
      style={[
        {
          marginLeft: BUBBLE_INDENT,
          maxWidth: '86%',
          alignSelf: 'flex-start',
          backgroundColor: palette.paper,
          borderRadius: 18,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
          gap: SPACE.md,
        },
        SHADOW.soft,
      ]}
    >
      {feedback.points.length > 0 ? (
        <View
          accessibilityRole="list"
          accessibilityLabel={t(feedback.kind === 'explain' ? 'rubric.points' : 'rubric.elements')}
          style={{ gap: SPACE.sm }}
        >
          {feedback.points.map((p) => (
            <View
              key={p.name}
              accessible
              accessibilityLabel={t(p.met ? 'rubric.met_a11y' : 'rubric.open_a11y', {
                name: p.name,
              })}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}
            >
              <View
                style={{
                  width: MARK,
                  height: MARK,
                  borderRadius: MARK / 2,
                  // Optical: the mark sits on the first line's x-height, not on its top.
                  marginTop: 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: p.met ? palette.mint : 'transparent',
                  borderWidth: p.met ? 0 : 2,
                  borderColor: palette.ink4,
                }}
              >
                {p.met ? <Icon name="check" size={14} color={palette.successText} /> : null}
              </View>
              <Text style={[TYPE.body, { flex: 1, color: p.met ? palette.ink : palette.ink2 }]}>
                {p.name}
                <Text style={[TYPE.caption, { color: p.met ? palette.successText : palette.ink2 }]}>
                  {'  '}
                  {t(p.met ? 'rubric.met' : 'rubric.open')}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {feedback.spots.length > 0 ? (
        <View style={{ gap: SPACE.md }}>
          {feedback.points.length > 0 ? (
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
          ) : null}
          <Text accessibilityRole="header" style={TYPE.label}>
            {t('rubric.spots')}
          </Text>
          {feedback.spots.map((sp) => (
            <View key={sp.quote} style={{ gap: SPACE.xs }}>
              <View
                accessible
                accessibilityLabel={t('rubric.quote_a11y', { quote: sp.quote })}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: palette.lavenderDeep,
                  paddingLeft: SPACE.sm,
                }}
              >
                <Text style={[TYPE.small, { fontStyle: 'italic' }]}>
                  {t('rubric.quote', { quote: sp.quote })}
                </Text>
              </View>
              <Text style={TYPE.body}>{sp.tip}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
