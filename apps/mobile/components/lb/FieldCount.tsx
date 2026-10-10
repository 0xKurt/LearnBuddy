// How much still fits into a field — shown only when its end is near (#133 position 17): a
// permanent 0/2000 is noise. The input bar's and the essay's writing view's (issue #525), one
// line in one place.

import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** The count appears this close to the end, not before. */
const COUNT_WITHIN = 200;

export function FieldCount({ length, max }: { length: number; max: number }) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  if (length < max - COUNT_WITHIN) return null;
  const full = length >= max;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        TYPE.label,
        {
          color: full ? palette.danger : palette.ink2,
          alignSelf: 'flex-end',
          marginRight: SPACE.sm,
        },
      ]}
    >
      {full ? t('field.full') : t('field.remaining', { count: max - length })}
    </Text>
  );
}
