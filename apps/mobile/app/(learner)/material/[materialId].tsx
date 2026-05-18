// Material screen. Doc 05 §Material.
//
// One clear job: review the questions from this material, then practise
// them as a conversation. (The old flip-card mode was removed — the
// conversational session is the single, obvious way to practise.)

import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, CircleBtn, EmptyState } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { getMaterial } from '../../../lib/api/materials.js';
import { useNavigateUp } from '../../../lib/navigation/hierarchy.js';
import { LB } from '../../../lib/theme/colors.js';

export default function MaterialScreen() {
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const navigateUp = useNavigateUp();
  const { t: tCommon } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const materialQuery = useQuery({
    queryKey: ['material', materialId],
    queryFn: () => getMaterial(learnerId as string, materialId),
    enabled: !!learnerId && !!materialId,
  });

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  if (materialQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="😕"
            title={tCommon('material.load_error_title')}
            body={tCommon('load_error')}
            action={
              <Btn size="sm" onPress={() => void materialQuery.refetch()}>
                {tCommon('actions.retry')}
              </Btn>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

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
          <CircleBtn icon="back" onPress={navigateUp} />
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

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const practise = () => {
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/session/[sessionId]',
      params: { sessionId: `m-${materialId}-${Date.now()}`, learnerId, materialId },
    });
  };

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
        <CircleBtn icon="back" onPress={navigateUp} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink, flex: 1 }} numberOfLines={1}>
          {material.title ?? tCommon('material.untitled')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {material.title ?? tCommon('material.untitled')}
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
            {items.map((item, idx) => {
              const revealed = revealedIds.has(item.id);
              return (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 18,
                    backgroundColor: '#fff',
                    borderColor: LB.hairline,
                    borderWidth: 1,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ padding: 16 }}>
                    <Text style={{ fontSize: 11, color: LB.ink3, fontWeight: '600' }}>
                      {tCommon('material.question_label', { index: idx + 1 })}
                    </Text>
                    <Text style={{ fontSize: 15, color: LB.ink, marginTop: 6, lineHeight: 21 }}>
                      {item.question}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleReveal(item.id)}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: LB.hairline,
                      padding: 14,
                      backgroundColor: revealed ? '#F7F4FF' : 'transparent',
                    }}
                  >
                    {revealed ? (
                      <Text style={{ fontSize: 14, color: LB.ink, lineHeight: 20 }}>
                        {item.expected_answer}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: LB.ink3, fontStyle: 'italic' }}>
                        {tCommon('material.reveal')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: Math.max(insets.bottom, 12),
          gap: 8,
        }}
      >
        {items.length > 0 && (
          <Btn size="lg" full onPress={practise}>
            {tCommon('material.practice')}
          </Btn>
        )}
        <Btn size="md" full variant="ghost" onPress={() => router.replace('/(learner)/home')}>
          {tCommon('actions.done')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
