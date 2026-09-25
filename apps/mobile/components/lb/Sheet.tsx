// Bottom sheet. Always closable with a visible in-sheet button (CLAUDE.md
// rule 14); the backdrop also closes it but is never the only way.
// A sheet with a form passes its CTA as `footer`: it stays pinned under the
// scrolling content and, with the keyboard open, right above the keyboard
// (CLAUDE.md rule 15).

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
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
  /** Pinned below the content, above the close button (a form's main action). */
  footer?: ReactNode;
};

export function Sheet({ visible, title, closeLabel, onClose, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
              paddingTop: 20,
              paddingBottom: insets.bottom + 20,
              maxHeight: '92%',
            }}
          >
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text accessibilityRole="header" style={TYPE.title}>
                {title}
              </Text>
              {children}
            </ScrollView>
            <View style={{ paddingHorizontal: 20, gap: 8 }}>
              {footer}
              <Btn variant="ghost" full onPress={onClose}>
                {closeLabel}
              </Btn>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
