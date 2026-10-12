// Nothing here (yet), or something went wrong while loading: a friendly
// title, an optional sentence and one way on. With `orb`, a small Buddy sits
// above it.

import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { SPACE } from '../../lib/theme/space.js';
import { EMPTY_STATE } from '../../lib/theme/states.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from './BuddyOrb.js';

export function EmptyState({
  orb = false,
  title,
  body,
  action,
}: {
  /** A small Buddy above the title (friendly empty states). */
  orb?: boolean;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { palette } = useTheme();
  // An empty or error state replaces the whole content: say so (iOS has no live regions).
  useAnnounce(title);
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACE.xl,
        paddingVertical: SPACE.xl,
        gap: SPACE.md,
      }}
    >
      {orb ? (
        <View style={{ marginBottom: SPACE.xs }}>
          <BuddyOrb size={EMPTY_STATE.orb} />
        </View>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[TYPE.title, EMPTY_STATE.title, { textAlign: 'center' }]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            TYPE.body,
            { color: palette.ink2, textAlign: 'center', maxWidth: EMPTY_STATE.bodyWidth },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: EMPTY_STATE.actionGap }}>{action}</View> : null}
    </View>
  );
}
