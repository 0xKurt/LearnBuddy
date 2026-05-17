// Material screen. Doc 05 §Material.
//
// Renders the item list from GET /materials/:id. Slice C2 ships placeholder
// items from the API; Slice D1 puts real Vertex-generated questions behind
// the same endpoint. The screen renders whatever comes back — no mock data
// here (CLAUDE.md §rule #5).

import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, CircleBtn, EmptyState } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { getMaterial } from '../../../lib/api/materials.js';
import { LB } from '../../../lib/theme/colors.js';

export default function MaterialScreen() {
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const { t: tCommon } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const materialQuery = useQuery({
    queryKey: ['material', materialId],
    queryFn: () => getMaterial(learnerId as string, materialId),
    enabled: !!learnerId && !!materialId,
  });

  if (materialQuery.isLoading || accountQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={LB.ink2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!materialQuery.data) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={() => router.back()} />
          <EmptyState
            glyph="🤔"
            title={tCommon('material.not_found')}
            body={tCommon('material.not_found_body')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const material = materialQuery.data;
  const items = material.items;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <CircleBtn icon="back" onPress={() => router.back()} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink, flex: 1 }} numberOfLines={1}>
          {material.title ?? 'Material'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {material.title ?? 'Material'}
        </Text>
        <Text style={{ fontSize: 12, color: LB.ink2 }}>
          {tCommon('material.question_count', { count: items.length })}
        </Text>

        {items.length === 0 ? (
          <View style={{ paddingVertical: 28 }}>
            <EmptyState
              glyph="📷"
              title={tCommon('material.no_items')}
              body={tCommon('material.no_items_body')}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((item, idx) => (
              <View
                key={item.id}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: '#fff',
                  borderColor: LB.hairline,
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 11, color: LB.ink3, fontWeight: '600' }}>
                  {tCommon('material.question_label', { index: idx + 1 })}
                </Text>
                <Text style={{ fontSize: 15, color: LB.ink, marginTop: 6, lineHeight: 21 }}>
                  {item.question}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: Math.max(insets.bottom, 12),
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <Btn size="lg" full variant="outline" onPress={() => router.replace('/(learner)/home')}>
          {tCommon('actions.done')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
