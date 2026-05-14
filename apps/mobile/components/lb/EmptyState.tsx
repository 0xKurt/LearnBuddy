import { Text, View } from 'react-native';
import { LB } from '../../lib/theme/colors.js';

export function EmptyState({
  glyph,
  title,
  body,
  action,
}: {
  glyph?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingVertical: 24,
        gap: 12,
      }}
    >
      {glyph && (
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 22,
            backgroundColor: LB.primaryLt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 36 }}>{glyph}</Text>
        </View>
      )}
      <Text
        style={{
          fontSize: 20,
          fontWeight: '600',
          color: LB.ink,
          letterSpacing: -0.4,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body && (
        <Text
          style={{
            fontSize: 13,
            color: LB.ink2,
            textAlign: 'center',
            maxWidth: 280,
            lineHeight: 19,
          }}
        >
          {body}
        </Text>
      )}
      {action && <View style={{ marginTop: 6 }}>{action}</View>}
    </View>
  );
}
