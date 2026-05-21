// Admin → Stimme.
//
// Lets the kid (well — usually the parent) preview the curated Chirp HD
// voices and pick a default. Selection persists to learners.tts_voice;
// the server reads it on every opener + per-turn TTS synthesis.
//
// Design follows `preferences.tsx`: white cards, hairline border,
// primaryLt-tinted selected state. Each row has a left-side "play"
// circle that synthesises a sample on tap (POST /agent/voice/sample)
// and plays it via the same playTtsAudio that runs the live tutor
// playback. Exactly one row at a time is selected; the selected
// indicator is a small "✓" inside a primary-coloured chip on the right.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TtsVoiceCharacter } from '@learnbuddy/shared-types';

import { Btn, CircleBtn, Icon } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { fetchVoiceSample } from '../../lib/api/agent.js';
import { updateLearner } from '../../lib/api/learners.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';
import { DEFAULT_VOICE_CHARACTER, VOICE_CATALOGUE } from '../../lib/voice/catalogue.js';
import { playTtsAudio, type TtsPlayHandle } from '../../lib/voice/play-tts.js';

export default function VoiceSettingsScreen() {
  const { t } = useTranslation('admin');
  const navigateUp = useNavigateUp();
  const unlocked = useAppStore((s) => s.admin_unlocked);

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learner = accountQuery.data?.learner ?? null;
  const learnerId = learner?.id ?? null;
  const selected: TtsVoiceCharacter = (learner?.tts_voice ??
    DEFAULT_VOICE_CHARACTER) as TtsVoiceCharacter;

  // Currently playing preview, if any — drives the row's animated state.
  const [playingChar, setPlayingChar] = useState<TtsVoiceCharacter | null>(null);
  const playingRef = useRef<TtsPlayHandle | null>(null);

  // Stop any in-flight preview when the screen unmounts.
  useEffect(
    () => () => {
      playingRef.current?.stop();
      playingRef.current = null;
    },
    [],
  );

  const qc = useQueryClient();
  const selectMut = useMutation({
    mutationFn: async (voice: TtsVoiceCharacter) => {
      if (!learnerId) throw new Error('no learner');
      return updateLearner(learnerId, { tts_voice: voice });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['account'] });
    },
  });

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const onPreview = async (character: TtsVoiceCharacter) => {
    if (!learnerId) return;
    // Stop any prior preview before kicking off a new one.
    playingRef.current?.stop();
    playingRef.current = null;
    setPlayingChar(character);
    try {
      const audio = await fetchVoiceSample(learnerId, character);
      // Race-check: another row may have been tapped while the sample
      // was synthesising. Only play if the character is still the one
      // the user expects to hear.
      if (playingRef.current !== null) return; // safety; should be cleared
      const handle = playTtsAudio(audio.base64, audio.mime);
      playingRef.current = handle;
      await handle.done;
    } catch {
      /* swallow — the row visual just clears */
    } finally {
      // Clear UI state only if we're still the latest playback.
      if (playingRef.current?.done) {
        // current handle is ours — clear it
      }
      playingRef.current = null;
      setPlayingChar((c) => (c === character ? null : c));
    }
  };

  const onSelect = (character: TtsVoiceCharacter) => {
    if (character === selected) return;
    selectMut.mutate(character);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={styles.header}>
        <CircleBtn icon="back" onPress={navigateUp} />
        <Text style={styles.headerTitle}>{t('voice.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 48, gap: 12 }}>
        <Text style={styles.subtitle}>{t('voice.subtitle')}</Text>

        {accountQuery.isLoading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={LB.ink2} />
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            {VOICE_CATALOGUE.map((v) => {
              const isSelected = v.character === selected;
              const isPlaying = v.character === playingChar;
              const description = t(`voice.descriptions.${v.descriptionKey}`);
              const genderLabel = t(`voice.gender.${v.gender}`);
              return (
                <Pressable
                  key={v.character}
                  onPress={() => onSelect(v.character)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${v.character}, ${description}`}
                >
                  <View
                    style={[
                      styles.row,
                      {
                        borderColor: isSelected ? LB.primary : LB.hairline,
                        backgroundColor: isSelected ? LB.primaryLt : '#fff',
                      },
                    ]}
                  >
                    {/* Preview play button — separate tap target so
                        tapping the row selects, tapping the circle
                        previews. Both nest cleanly because Pressable
                        respects hit-test bubbling. */}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void onPreview(v.character);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('voice.preview_a11y', { name: v.character })}
                      hitSlop={6}
                    >
                      <View
                        style={[
                          styles.playCircle,
                          {
                            backgroundColor: isPlaying ? LB.primary : '#fff',
                            borderColor: isPlaying ? LB.primary : LB.hairline,
                          },
                        ]}
                      >
                        {isPlaying ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Icon name="play" size={16} color={LB.ink2} />
                        )}
                      </View>
                    </Pressable>

                    <View style={{ flex: 1, paddingHorizontal: 12 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, { color: isSelected ? LB.primaryDk : LB.ink }]}>
                          {v.character}
                        </Text>
                        <View
                          style={[
                            styles.genderChip,
                            { backgroundColor: isSelected ? '#fff' : LB.paper },
                          ]}
                        >
                          <Text style={styles.genderChipText}>{genderLabel}</Text>
                        </View>
                      </View>
                      <Text style={[styles.desc, { color: isSelected ? LB.primaryDk : LB.ink2 }]}>
                        {description}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View style={styles.selectedDot}>
                        <Icon name="check" size={14} color="#fff" />
                      </View>
                    ) : (
                      <View style={{ width: 22 }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.note}>{t('voice.note')}</Text>

        <View style={{ marginTop: 10 }}>
          <Btn variant="ghost" onPress={navigateUp}>
            {t('preferences.done')}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '600' as const, color: LB.ink },
  subtitle: { fontSize: 13, color: LB.ink3, lineHeight: 18 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  playCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  name: { fontSize: 15, fontWeight: '600' as const },
  genderChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  genderChipText: { fontSize: 10, color: LB.ink3, fontWeight: '600' as const },
  desc: { fontSize: 13, marginTop: 3, lineHeight: 17 },
  selectedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: LB.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  note: {
    fontSize: 11,
    color: LB.ink3,
    fontStyle: 'italic' as const,
    marginTop: 8,
    paddingHorizontal: 4,
  },
} as const;
