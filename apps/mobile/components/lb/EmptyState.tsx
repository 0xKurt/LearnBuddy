// Nothing here (yet), or something went wrong while loading: a friendly
// title, an optional sentence and one way on. With `orb`, a small Buddy sits
// above it; a `glyph` shows in a soft round tile instead.

import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from './BuddyOrb.js';

export function EmptyState({
  glyph,
  orb = false,
  title,
  body,
  action,
}: {
  glyph?: string;
  /** A small Buddy above the title (friendly empty states). */
  orb?: boolean;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 24,
        gap: 12,
      }}
    >
      {orb ? (
        <View style={{ marginBottom: 4 }}>
          <BuddyOrb size={64} />
        </View>
      ) : glyph ? (
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: LB.primaryLt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 36 }}>{glyph}</Text>
        </View>
      ) : null}
      <Text style={[TYPE.title, { fontSize: 20, lineHeight: 26, textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', maxWidth: 320 }]}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}
