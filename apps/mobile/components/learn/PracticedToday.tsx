// The quiet "Heute geübt ✓" beside Buddy's greeting on a first visit (components/buddy/HomeIntro.tsx
// `introMark`, issue #107): she answered a practice question today. Never a number, never missed
// days (DESIGN-BRIEF §What we are NOT).

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { HOME } from '../../lib/theme/home.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';

/** The quiet "Heute geübt ✓" beside the greeting: a mark of what she did, never a number. */
export function PracticedToday() {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const label = t('buddy:practiced_today');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: SPACE.xs,
        paddingHorizontal: HOME.practiced.horizontal,
        paddingVertical: HOME.practiced.vertical,
        borderRadius: RADIUS.round,
        backgroundColor: palette.mint,
      }}
    >
      <Icon name="check" size={HOME.practiced.icon} color={palette.successText} />
      <Text style={[TYPE.label, { color: palette.successText }]}>{label}</Text>
    </View>
  );
}
