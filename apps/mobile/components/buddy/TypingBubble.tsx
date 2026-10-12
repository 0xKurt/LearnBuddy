// Static thinking status. Only the existing header Orb animates automatically.
import { Text, View } from 'react-native';
import { useAnnounce } from '../../lib/announce.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';

export function TypingBubble({ label }: { label: string }) {
  useAnnounce(label);
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ paddingVertical: SPACE.sm }}
    >
      <Text style={TYPE.meta}>{label}</Text>
    </View>
  );
}
