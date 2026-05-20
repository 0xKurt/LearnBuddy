// Practice hub — the one obvious place to start (or resume) learning.
// Doc 05 §navigation. Previously this was a confusing "upcoming tests"
// list that dead-ended on an empty state; now the Practice tab does what
// it says: continue an open conversation, or pick a subject and start one.

import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, EmptyState, LoadingState, SubjectGlyph } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { listSubjects, type SubjectListItem } from '../../../lib/api/subjects.js';
import {
  clearPendingSession,
  loadPendingSession,
  type PendingSession,
} from '../../../lib/session/pending.js';
import { LB } from '../../../lib/theme/colors.js';

function glyphForKind(kind: string): string {
  const map: Record<string, string> = {
    math: '📐',
    physics: '🧪',
    chemistry: '⚗️',
    biology: '🌱',
    geography: '🌍',
    history: '📜',
    language_native: '📖',
    language_foreign: '🗣️',
    religion_ethics: '☯️',
    art_music: '🎨',
  };
  return map[kind] ?? '✨';
}

export default function PracticeHubScreen() {
  const { t } = useTranslation('practice');
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId as string),
    enabled: !!learnerId,
  });

  const [pending, setPending] = useState<PendingSession | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadPendingSession().then((p) => {
        if (alive) setPending(p);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const practisable = (subjectsQuery.data ?? []).filter((s) => s.material_count > 0);

  const startSubject = (s: SubjectListItem) => {
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/chat/[sessionId]',
      params: { sessionId: 'new', subjectId: s.id },
    });
  };

  if (accountQuery.isLoading || subjectsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: LB.ink,
            letterSpacing: -0.6,
            marginTop: 24,
            marginBottom: 20,
          }}
        >
          {t('hub.title')}
        </Text>

        {pending && (
          <View
            style={{
              backgroundColor: LB.lavender,
              borderRadius: 16,
              padding: 16,
              marginBottom: 18,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: LB.ink }}>
              {t('hub.resume_title')}
            </Text>
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
              {t('hub.resume_body')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Btn
                  size="sm"
                  full
                  onPress={() =>
                    router.push({
                      pathname: '/(learner)/chat/[sessionId]',
                      params: {
                        sessionId: pending.session_id,
                        testMode: String(pending.test_mode),
                      },
                    })
                  }
                >
                  {t('hub.resume_yes')}
                </Btn>
              </View>
              <View style={{ flex: 1 }}>
                <Btn
                  size="sm"
                  full
                  variant="ghost"
                  onPress={() => {
                    void clearPendingSession();
                    setPending(null);
                  }}
                >
                  {t('hub.resume_no')}
                </Btn>
              </View>
            </View>
          </View>
        )}

        {practisable.length > 0 ? (
          <>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: LB.ink2,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              {t('hub.choose')}
            </Text>
            <View style={{ gap: 10 }}>
              {practisable.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => startSubject(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s.name}
                >
                  <Card padding={16}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <SubjectGlyph
                        glyph={s.custom_glyph ?? glyphForKind(s.subject_kind)}
                        size={22}
                      />
                      <Text
                        style={{ flex: 1, fontSize: 16, fontWeight: '600', color: LB.ink }}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Text style={{ fontSize: 13, color: LB.primary, fontWeight: '600' }}>
                        {t('hub.start')}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          !subjectsQuery.isLoading && (
            <EmptyState
              glyph="📷"
              title={t('hub.empty_title')}
              body={t('hub.empty_body')}
              action={
                <Btn size="sm" onPress={() => router.push('/(learner)/home')}>
                  {t('hub.empty_cta')}
                </Btn>
              }
            />
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
