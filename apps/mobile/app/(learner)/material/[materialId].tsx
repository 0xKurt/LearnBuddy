import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LB } from '../../../lib/theme/colors.js';

export default function MaterialScreen() {
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink }}>Material: {materialId}</Text>
      </View>
    </SafeAreaView>
  );
}
