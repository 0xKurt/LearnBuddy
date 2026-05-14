import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LB } from '../lib/theme/colors.js';

export default function LoginScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink }}>Anmelden</Text>
        <Text style={{ color: LB.ink2 }}>Doc 05 §login — pending implementation.</Text>
      </View>
    </SafeAreaView>
  );
}
