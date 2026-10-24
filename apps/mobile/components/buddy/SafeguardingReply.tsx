// Code's fixed help answer, kept readable in both free-text sheets (#918).
import { Text } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export function SafeguardingReply({ text }: { text: string }) {
  useTheme();
  useAnnounce(text);
  return (
    <Text style={TYPE.body} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}
