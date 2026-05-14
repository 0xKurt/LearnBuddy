import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { Chip } from './Chip.js';
import { CircleBtn } from './CircleBtn.js';
import { Progress } from './Progress.js';

export function SessionTopBar({
  progress,
  index,
  badge,
  onExit,
  hideExit = false,
}: {
  progress: number;
  index: string;
  badge?: string;
  onExit?: () => void;
  hideExit?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 12,
      }}
    >
      {hideExit ? <View style={{ width: 36 }} /> : <CircleBtn icon="close" onPress={onExit} />}
      <Progress value={progress} />
      <Text
        style={{
          fontSize: 11,
          color: LB.ink2,
          fontWeight: '600',
          minWidth: 32,
          textAlign: 'right',
        }}
      >
        {index}
      </Text>
      {badge && <Chip>{badge}</Chip>}
    </View>
  );
}
