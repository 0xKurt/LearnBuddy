// Capture flow with quality scoring. Doc 05 §capture, doc 06.
// Skeleton: stub with placeholder copy.
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LB } from '../../lib/theme/colors.js';

export default function CaptureScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink }}>Material aufnehmen</Text>
        <Text style={{ color: LB.ink2, marginTop: 8 }}>
          expo-camera viewfinder + live blur/brightness chips kommen in Schritt 14.
        </Text>
      </View>
    </SafeAreaView>
  );
}
