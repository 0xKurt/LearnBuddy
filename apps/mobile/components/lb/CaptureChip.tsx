// Quality status pill rendered next to the live viewfinder banner and on
// each thumbnail. Doc 05 §Capture. Maps the green/yellow/red verdict from
// lib/camera/quality.ts to the LB color tokens — no ad-hoc hex.

import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import type { QualityStatus } from '../../lib/camera/quality.js';

const TONES: Record<QualityStatus, { bg: string; color: string }> = {
  green: { bg: 'rgba(107,141,106,0.16)', color: LB.success },
  yellow: { bg: 'rgba(181,138,60,0.18)', color: LB.warning },
  red: { bg: 'rgba(177,73,60,0.18)', color: LB.danger },
};

export function CaptureChip({
  status,
  label,
  compact = false,
}: {
  status: QualityStatus;
  label: string;
  compact?: boolean;
}) {
  const t = TONES[status];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        paddingHorizontal: compact ? 8 : 12,
        paddingVertical: compact ? 3 : 5,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: t.color,
          fontSize: compact ? 10 : 11,
          fontWeight: '600',
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
