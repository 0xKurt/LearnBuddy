// A pass ends with its factual title and one calm line, never a score inferred from self-rating.
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RESULT } from '../../lib/theme/results.js';
import { GUTTER } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

type Props = {
  finished: boolean;
  title: string;
  line: string | null;
  lineTestID?: string;
};

export function PassEnd({ finished, title, line, lineTestID }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  return (
    <View
      style={{ flex: 1, paddingHorizontal: GUTTER, paddingTop: RESULT.top, gap: RESULT.introGap }}
    >
      <Text accessibilityRole="header" style={TYPE.display}>
        {finished ? title : t('ended')}
      </Text>
      {finished && line ? (
        <Text testID={lineTestID} style={[TYPE.body, { color: palette.ink2 }]}>
          {line}
        </Text>
      ) : null}
    </View>
  );
}
