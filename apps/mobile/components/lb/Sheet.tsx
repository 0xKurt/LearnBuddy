// Bottom sheet. Always closable with a visible in-sheet button (CLAUDE.md
// rule 9); the backdrop also closes it but is never the only way.

import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';

type Props = {
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ visible, title, closeLabel, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(29,27,34,0.35)' }} />
        </Pressable>
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: LB.paper,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: insets.bottom + 20,
            gap: 12,
          }}
        >
          <Text accessibilityRole="header" style={TYPE.title}>
            {title}
          </Text>
          {children}
          <Btn variant="ghost" full onPress={onClose}>
            {closeLabel}
          </Btn>
        </View>
      </View>
    </Modal>
  );
}
