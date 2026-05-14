import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LB } from '../lib/theme/colors.js';

export default function ResetPasswordScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink }}>Passwort zurücksetzen</Text>
        <Text style={{ color: LB.ink2 }}>Pending implementation.</Text>
      </View>
    </SafeAreaView>
  );
}
