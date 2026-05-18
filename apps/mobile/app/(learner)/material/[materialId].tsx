// Material screen. Doc 05 §Material.
//
// Renders the item list from GET /materials/:id. Two modes:
//   - List mode: cards with tap-to-reveal answers
//   - Flashcard mode: full-screen flip cards (front=question, back=answer)

import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, CircleBtn, EmptyState } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { getMaterial } from '../../../lib/api/materials.js';
import { LB } from '../../../lib/theme/colors.js';
import type { Item } from '@learnbuddy/shared-types';

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

  const [flashcardMode, setFlashcardMode] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  if (materialQuery.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={() => router.back()} />
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

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (flashcardMode && items.length > 0) {
    const card = items[flashcardIndex] as Item;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          <CircleBtn
            icon="back"
            onPress={() => {
              setFlashcardMode(false);
              setFlipped(false);
            }}
          />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: LB.ink }}>
            {tCommon('material.flashcards')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2 }}>
            {flashcardIndex + 1} / {items.length}
          </Text>
        </View>

        <Pressable
          style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 16 }}
          onPress={() => setFlipped((v) => !v)}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 24,
              backgroundColor: flipped ? LB.lavender : '#fff',
              borderColor: LB.hairline,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 28,
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: LB.ink3,
                fontWeight: '600',
                letterSpacing: 0.5,
                marginBottom: 16,
              }}
            >
              {flipped ? tCommon('material.card_answer') : tCommon('material.card_question')}
            </Text>
            <Text
              style={{
                fontSize: 18,
                color: LB.ink,
                textAlign: 'center',
                lineHeight: 26,
                fontWeight: '500',
              }}
            >
              {flipped ? card.expected_answer : card.question}
            </Text>
            {!flipped && (
              <Text style={{ marginTop: 24, fontSize: 12, color: LB.ink3 }}>
                {tCommon('material.flip_hint')}
              </Text>
            )}
          </View>
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 16),
            gap: 12,
          }}
        >
          <Btn
            size="lg"
            full
            variant="outline"
            disabled={flashcardIndex === 0}
            onPress={() => {
              setFlashcardIndex((i) => i - 1);
              setFlipped(false);
            }}
          >
            ←
          </Btn>
          <Btn
            size="lg"
            full
            variant={flashcardIndex === items.length - 1 ? 'primary' : 'outline'}
            onPress={() => {
              if (flashcardIndex === items.length - 1) {
                setFlashcardMode(false);
                setFlipped(false);
                setFlashcardIndex(0);
              } else {
                setFlashcardIndex((i) => i + 1);
                setFlipped(false);
              }
            }}
          >
            {flashcardIndex === items.length - 1 ? tCommon('actions.done') : '→'}
          </Btn>
        </View>
      </SafeAreaView>
    );
  }

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
        {items.length > 0 && (
          <Pressable
            onPress={() => {
              setFlashcardMode(true);
              setFlashcardIndex(0);
              setFlipped(false);
            }}
            style={{
              backgroundColor: LB.lavender,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: LB.ink }}>
              🃏 {tCommon('material.flashcards')}
            </Text>
          </Pressable>
        )}
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
