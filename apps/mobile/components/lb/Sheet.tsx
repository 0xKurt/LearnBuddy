// Bottom sheet. Always closable with a visible in-sheet button (CLAUDE.md
// rule 14); the backdrop also closes it but is never the only way.
// A sheet with a form passes its CTA as `footer`: it stays pinned under the
// scrolling content and, with the keyboard open, right above the keyboard
// (CLAUDE.md rule 15).
// Looks: a rounded white top sheet on a soft shadow, with a small grab handle
// (decorative) over a light violet-grey veil.

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
import { SHADOW } from '../../lib/theme/shadow.js';
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
            <View style={{ flex: 1, backgroundColor: 'rgba(31,27,46,0.28)' }} />
          </Pressable>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: LB.paper,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingTop: 10,
              paddingBottom: insets.bottom + 16,
              maxHeight: '92%',
              ...SHADOW.float,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                alignSelf: 'center',
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: LB.ink4,
                marginBottom: 14,
              }}
            />
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 14, gap: 14 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text accessibilityRole="header" style={TYPE.title}>
                {title}
              </Text>
              {children}
            </ScrollView>
            <View style={{ paddingHorizontal: 22, gap: 8 }}>
              {footer}
              <Btn variant="ghost" pill full onPress={onClose}>
                {closeLabel}
              </Btn>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
