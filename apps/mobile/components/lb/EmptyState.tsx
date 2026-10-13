// Nothing here (yet), or something went wrong while loading: a friendly
// title, an optional sentence and one way on. With `orb`, a small Buddy sits
// above it. With `page`, it is the design's empty page instead (ui_kits/app/Gaps.jsx `Empty`):
// Buddy is in the head already, so the content is one quiet block at the start edge.

import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { GUTTER_OUTER, SPACE } from '../../lib/theme/space.js';
import { EMPTY_STATE } from '../../lib/theme/states.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb, type MoonState } from './BuddyOrb.js';

export function EmptyState({
  orb = false,
  state,
  page = false,
  title,
  body,
  action,
}: {
  /** A small Buddy above the title: only on a page without a head (update, deleting). */
  orb?: boolean;
  /** What that Buddy is doing (design components/core/States.jsx `StateScreen`). */
  state?: MoonState;
  /**
   * An empty or gone page under the app's head: fills the room it is given, everything at the
   * start edge, the action as wide as its words. Without it, the centred system state.
   */
  page?: boolean;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { palette } = useTheme();
  // An empty or error state replaces the whole content: say so (iOS has no live regions).
  useAnnounce(title);
  if (page)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          gap: SPACE.xl,
          paddingHorizontal: GUTTER_OUTER,
          paddingBottom: EMPTY_STATE.page.bottom,
        }}
      >
        <View style={{ gap: SPACE.sm }}>
          <Text accessibilityRole="header" style={[TYPE.display, EMPTY_STATE.page.head]}>
            {title}
          </Text>
          {body ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{body}</Text> : null}
        </View>
        {action ? <View style={{ alignSelf: 'flex-start' }}>{action}</View> : null}
      </View>
    );
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
          <BuddyOrb size={EMPTY_STATE.orb} state={state} />
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
