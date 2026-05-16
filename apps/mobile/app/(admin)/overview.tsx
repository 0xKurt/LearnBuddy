// Admin overview. Doc 05 §overview — placeholder body until Slice G3
// fleshes out the real per-profile content. The unlock gate is the
// guarantee that matters for A3.

import { Redirect, router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function AdminOverviewScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  if (!unlocked) {
    return <Redirect href="/(admin)/unlock" />;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink }}>Konto</Text>
        <Text style={{ color: LB.ink2 }}>Doc 05 §overview — pending implementation.</Text>
        <View style={{ marginTop: 24, width: '100%' }}>
          <Btn full onPress={() => router.replace('/(learner)/home')}>
            Zurück zur Lern-Ansicht
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
