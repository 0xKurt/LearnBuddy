// Nothing here (yet), or something went wrong while loading: a friendly title, an optional
// sentence and one way on, in the middle of the screen — the design's full-screen state
// (components/core/States.jsx `StateScreen`), with Buddy at 64 above it where `orb` says so.
// With `page`, it is the design's empty page instead (ui_kits/app/Gaps.jsx `Empty`): Buddy is in
// the head already, so the content is one quiet block at the start edge.

import { Text, View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { GUTTER_OUTER, SPACE } from '../../lib/theme/space.js';
import { EMPTY_STATE, STATE_SCREEN } from '../../lib/theme/states.js';
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
  /**
   * Buddy above the title, as every full-screen state of the design has him (States.jsx:47):
   * a failed load, the gate's error, update, deleting, a page that is gone, a crash.
   */
  orb?: boolean;
  /** What that Buddy is doing (States.jsx:37–42): failed and deleting think, update waits. */
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
  // The full-screen state (components/core/States.jsx:45–52): everything in the middle, 14 apart.
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: STATE_SCREEN.padX,
        paddingVertical: STATE_SCREEN.padY,
        gap: STATE_SCREEN.gap,
      }}
    >
      {orb ? <BuddyOrb size={STATE_SCREEN.orb} state={state} /> : null}
      <Text
        accessibilityRole="header"
        style={[TYPE.display, STATE_SCREEN.title, { textAlign: 'center' }]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            TYPE.body,
            STATE_SCREEN.body,
            { color: palette.ink2, textAlign: 'center', maxWidth: STATE_SCREEN.bodyWidth },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: STATE_SCREEN.actionGap }}>{action}</View> : null}
    </View>
  );
}
