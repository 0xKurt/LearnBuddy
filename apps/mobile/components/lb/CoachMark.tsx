// CoachMark — contextual one-shot tooltip for first-time power features.
// USER-FLOWS-DEEP §10.
//
// Visual: full-screen modal with a semi-transparent dim, a small card near
// the bottom that holds the title + body + dismiss button. The caller picks
// what to anchor it to logically (math keyboard, camera, streak, etc.); the
// component itself is a layout-neutral overlay so it works the same on every
// screen.
//
// The state is owned by `useFirstTime(key)` in lib/onboarding/coach.ts —
// the caller passes `visible` + an `onDismiss` callback from that hook.

import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  body: string;
  /** Defaults to "Verstanden". */
  ctaLabel?: string;
  /** Optional emoji at the top-left of the card. */
  glyph?: string;
};

export function CoachMark({ visible, onDismiss, title, body, ctaLabel, glyph }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable onPress={onDismiss} style={{ flex: 1 }}>
        <View
          style={{ flex: 1, backgroundColor: 'rgba(10,10,15,0.55)', justifyContent: 'flex-end' }}
        >
          <SafeAreaView edges={['bottom']}>
            <Pressable onPress={() => undefined}>
              <View
                style={{
                  backgroundColor: LB.paper,
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  padding: 22,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {glyph ? <Text style={{ fontSize: 26 }}>{glyph}</Text> : null}
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '600',
                      color: LB.ink,
                      letterSpacing: -0.3,
                      flex: 1,
                    }}
                  >
                    {title}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>{body}</Text>
                <Pressable
                  onPress={onDismiss}
                  accessibilityRole="button"
                  accessibilityLabel={ctaLabel ?? 'Verstanden'}
                >
                  <View
                    style={{
                      marginTop: 6,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: LB.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                      {ctaLabel ?? 'Verstanden'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </Pressable>
          </SafeAreaView>
        </View>
      </Pressable>
    </Modal>
  );
}
