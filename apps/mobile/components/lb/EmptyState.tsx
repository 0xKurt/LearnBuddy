// Nothing here (yet), or something went wrong while loading: a friendly
// title, an optional sentence and one way on. With `orb`, a small Buddy sits
// above it.

import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from './BuddyOrb.js';

/**
 * The title: a step above TYPE.title, the one line the empty screen has to say.
 * token-exempt: 20/26, between TYPE.title and TYPE.prompt.
 */
const TITLE = { fontSize: 20, lineHeight: 26 } as const;

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
          <BuddyOrb size={64} />
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[TYPE.title, TITLE, { textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[TYPE.body, { color: palette.ink2, textAlign: 'center', maxWidth: 320 }]}>
          {body}
        </Text>
      ) : null}
      {/* token-exempt: the way on set 6 further apart than the lines above it */}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}
