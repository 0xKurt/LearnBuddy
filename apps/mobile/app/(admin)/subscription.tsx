// Subscription. Doc 05 §subscription. RevenueCat-backed in Slice F1.
// Renders the current tier/balance and the upgrade CTAs.

import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Chip, CircleBtn, EmptyState } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import {
  startPurchase,
  restorePurchases,
  getOfferings,
  type PurchasePackage,
} from '../../lib/purchases.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function SubscriptionScreen() {
  const { t } = useTranslation('admin');
  const navigateUp = useNavigateUp();
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });

  const [packages, setPackages] = useState<PurchasePackage[] | null>(null);
  const [offeringsError, setOfferingsError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getOfferings()
      .then((pkgs) => {
        setPackages(pkgs);
        setOfferingsError(false);
      })
      .catch(() => {
        setPackages([]);
        setOfferingsError(true);
      });
  }, []);

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const priceFor = (sku: string) =>
    packages?.find((p) => p.identifier === sku || p.product.identifier.includes(sku))?.product
      .priceString ?? '—';

  const handlePurchase = async (sku: 'standard' | 'plus') => {
    if (busy) return;
    setBusy(true);
    try {
      await startPurchase(sku);
      Alert.alert(
        t('subscription.purchase_success_title'),
        t('subscription.purchase_success_body'),
      );
    } catch (err) {
      Alert.alert(
        t('subscription.purchase_error_title'),
        err instanceof Error ? err.message : t('subscription.purchase_error_generic'),
      );
    } finally {
      setBusy(false);
    }
  };
  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await restorePurchases();
      Alert.alert(t('subscription.restore_success_title'), t('subscription.restore_success_body'));
    } catch (err) {
      Alert.alert(
        t('subscription.purchase_error_title'),
        err instanceof Error ? err.message : t('subscription.restore_error_generic'),
      );
    } finally {
      setBusy(false);
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
        <CircleBtn icon="back" onPress={navigateUp} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>
          {t('subscription.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        {accountQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} />
        ) : accountQuery.isError ? (
          <EmptyState
            glyph="⚠️"
            title={t('subscription.account_error_title')}
            action={
              <Btn onPress={() => void accountQuery.refetch()}>{t('subscription.retry')}</Btn>
            }
          />
        ) : (
          <View style={{ padding: 18, borderRadius: 16, backgroundColor: LB.bg }}>
            <Chip tone="primary">{accountQuery.data?.subscription?.tier ?? 'trial'}</Chip>
            <Text style={{ marginTop: 10, fontSize: 14, color: LB.ink2 }}>
              {accountQuery.data?.subscription?.status === 'trial'
                ? t('subscription.trial_body')
                : t('subscription.active_body')}
            </Text>
          </View>
        )}

        {packages === null ? (
          <ActivityIndicator color={LB.ink2} style={{ marginVertical: 16 }} />
        ) : offeringsError ? (
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: '#FFF3E0',
              borderWidth: 1,
              borderColor: '#FFB74D',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: '#E65100' }}>
              {t('subscription.offerings_error')}
            </Text>
            <Btn
              variant="outline"
              onPress={() => {
                setPackages(null);
                setOfferingsError(false);
                void getOfferings()
                  .then((pkgs) => {
                    setPackages(pkgs);
                    setOfferingsError(false);
                  })
                  .catch(() => {
                    setPackages([]);
                    setOfferingsError(true);
                  });
              }}
            >
              {t('subscription.retry')}
            </Btn>
          </View>
        ) : (
          <>
            <Tier
              title={t('subscription.tiers.standard.title')}
              price={priceFor('standard')}
              features={[
                t('subscription.tiers.standard.feature_1'),
                t('subscription.tiers.standard.feature_2'),
                t('subscription.tiers.standard.feature_3'),
              ]}
              cta={t('subscription.tiers.standard.cta')}
              onPress={() => void handlePurchase('standard')}
              disabled={busy}
            />
            <Tier
              title={t('subscription.tiers.plus.title')}
              price={priceFor('plus')}
              features={[
                t('subscription.tiers.plus.feature_1'),
                t('subscription.tiers.plus.feature_2'),
                t('subscription.tiers.plus.feature_3'),
              ]}
              cta={t('subscription.tiers.plus.cta')}
              onPress={() => void handlePurchase('plus')}
              highlight
              disabled={busy}
            />
          </>
        )}
        <Btn variant="outline" full onPress={() => void handleRestore()} disabled={busy}>
          {busy ? '…' : t('subscription.restore')}
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
  disabled = false,
}: {
  title: string;
  price: string;
  features: string[];
  cta: string;
  onPress: () => void;
  highlight?: boolean;
  disabled?: boolean;
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
      <Btn full variant={highlight ? 'primary' : 'outline'} onPress={onPress} disabled={disabled}>
        {cta}
      </Btn>
    </View>
  );
}
