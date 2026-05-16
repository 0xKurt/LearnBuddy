// Subscription. Doc 05 §subscription. RevenueCat-backed in Slice F1.
// Renders the current tier/balance and the upgrade CTAs.

import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Chip, CircleBtn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { startPurchase, restorePurchases } from '../../lib/purchases.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function SubscriptionScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const handlePurchase = async (sku: 'standard' | 'plus') => {
    try {
      await startPurchase(sku);
      Alert.alert('Danke!', 'Dein Abo wird gleich freigeschaltet.');
    } catch (err) {
      Alert.alert('Ups.', err instanceof Error ? err.message : 'Kauf fehlgeschlagen.');
    }
  };
  const handleRestore = async () => {
    try {
      await restorePurchases();
      Alert.alert('Wiederhergestellt', 'Dein Abo-Status wurde aktualisiert.');
    } catch (err) {
      Alert.alert('Ups.', err instanceof Error ? err.message : 'Wiederherstellung fehlgeschlagen.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <CircleBtn icon="back" onPress={() => router.back()} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>Abo</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        {accountQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} />
        ) : (
          <View style={{ padding: 18, borderRadius: 16, backgroundColor: LB.bg }}>
            <Chip tone="primary">{accountQuery.data?.subscription?.tier ?? 'trial'}</Chip>
            <Text style={{ marginTop: 10, fontSize: 14, color: LB.ink2 }}>
              {accountQuery.data?.subscription?.status === 'trial'
                ? 'Du bist im 14-Tage-Trial. Volle Funktion bis Ende der Probezeit.'
                : 'Dein aktuelles Abo.'}
            </Text>
          </View>
        )}

        <Tier
          title="Standard"
          price="€4,99 / Monat"
          features={[
            '~30 Material-Aufnahmen pro Monat',
            '~150 ausgewertete Antworten',
            'Vorrang im Support',
          ]}
          cta="Standard buchen"
          onPress={() => handlePurchase('standard')}
        />
        <Tier
          title="Plus"
          price="€9,99 / Monat"
          features={[
            'Mehr als doppelt so viele Material-Aufnahmen',
            'Stoffunabhängige Power-Sitzungen',
            'Erweitertes Üben',
          ]}
          cta="Plus buchen"
          onPress={() => handlePurchase('plus')}
          highlight
        />
        <Btn variant="outline" full onPress={handleRestore}>
          Käufe wiederherstellen
        </Btn>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tier({
  title,
  price,
  features,
  cta,
  onPress,
  highlight = false,
}: {
  title: string;
  price: string;
  features: string[];
  cta: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        padding: 18,
        borderRadius: 18,
        backgroundColor: highlight ? LB.primaryLt : '#fff',
        borderColor: highlight ? LB.primaryDk : LB.hairline,
        borderWidth: 1,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>{title}</Text>
      <Text style={{ fontSize: 14, color: LB.ink2 }}>{price}</Text>
      <View style={{ gap: 4 }}>
        {features.map((f, i) => (
          <Text key={i} style={{ fontSize: 13, color: LB.ink2 }}>
            • {f}
          </Text>
        ))}
      </View>
      <Btn full variant={highlight ? 'primary' : 'outline'} onPress={onPress}>
        {cta}
      </Btn>
    </View>
  );
}
