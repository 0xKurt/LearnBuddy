import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LB } from '../../../lib/theme/colors.js';

export default function PracticeScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink }}>Practice: {templateId}</Text>
      </View>
    </SafeAreaView>
  );
}
