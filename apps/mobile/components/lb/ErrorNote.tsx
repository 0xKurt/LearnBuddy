// An inline problem note under a form or list action: a soft blush card, never a
// toast (toasts vanish and sit behind sheets). Says itself to the screen reader on
// every platform (iOS has no live regions — lib/announcePlan.ts).

import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from './Card.js';

export function ErrorNote({ text }: { text: string | null }) {
  useAnnounce(text);
  if (!text) return null;
  return (
    <View accessibilityLiveRegion="polite">
      <Card tone="blush" padding={14} radius={18}>
        <Text style={TYPE.body}>{text}</Text>
      </Card>
    </View>
  );
}
