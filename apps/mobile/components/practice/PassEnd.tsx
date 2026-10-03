// The end of a pass that is not a run of questions (docs/architecture.md §Practice): a card pass
// (issue #147) and a Kopfrechnen round (issue #243) end the same way — Buddy's orb, one headline,
// one calm line, never a count of what went wrong (CLAUDE.md rule 6). A run that ended without
// being finished says only that.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { EmptyState } from '../lb/EmptyState.js';
import { Rise } from '../lb/Motion.js';

type Props = {
  finished: boolean;
  /** The headline of a finished pass. */
  title: string;
  /** Its one line, or nothing. */
  line: string | null;
  lineTestID?: string;
};

export function PassEnd({ finished, title, line, lineTestID }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.lg }}>
      {finished ? (
        <View style={{ alignItems: 'center', gap: SPACE.lg }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <BuddyOrb size={88} />
          </View>
          <Rise slow delay={160}>
            <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
              {title}
            </Text>
          </Rise>
          {line ? (
            <Rise slow delay={320}>
              <Text
                testID={lineTestID}
                style={[TYPE.body, { textAlign: 'center', color: palette.ink2 }]}
              >
                {line}
              </Text>
            </Rise>
          ) : null}
        </View>
      ) : (
        <EmptyState title={t('ended')} />
      )}
    </View>
  );
}
