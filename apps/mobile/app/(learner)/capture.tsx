// Capture flow with on-device quality scoring. Doc 05 §Capture + Doc 04 §materials.
//
// expo-camera CameraView with:
//   - tilt warning live from expo-sensors DeviceMotion
//   - shutter → decode-to-grayscale → Laplacian-variance + mean luminance
//     scores via lib/camera/{decode,quality}.ts
//   - chip overlay on each thumbnail; recent-shot status banner above strip
//   - red verdict opens a "Trotzdem behalten" sheet (Doc 05 says red is
//     non-blocking; the user always wins)
//   - long-press strip thumbnail → delete; max 20 photos per material
//   - "Aus Galerie" import via expo-image-picker for already-taken photos
//   - "Fertig" → SubjectFolderPicker when no folderId/subjectId param was
//     passed in by the folder / subject screens. Photos + target are
//     stashed in the zustand capture store for Slice C2 to consume on
//     POST /materials/upload-url + POST /materials.
//
// What's deferred to C2 (not C1's scope):
//   - The "uploading…" SSE progress screen
//   - The /materials/upload-url + /materials calls themselves
// On "Fertig" we currently router.replace back to home; C2 will replace that
// step with the real upload progress flow that drains useCaptureStore.

import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import {
  Btn,
  CaptureChip,
  CircleBtn,
  CoachMark,
  SubjectFolderPicker,
  toast,
} from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { useFirstTime } from '../../lib/onboarding/coach.js';
import { decodeForQuality } from '../../lib/camera/decode.js';
import {
  classify,
  scoreBlur,
  scoreBrightness,
  scoreTilt,
  type QualityReason,
  type QualityScore,
  type QualityStatus,
} from '../../lib/camera/quality.js';
import { useCaptureStore, type CapturedPhoto } from '../../lib/store/capture.js';
import { LB } from '../../lib/theme/colors.js';

const MAX_PHOTOS = 20;

export default function CaptureScreen() {
  const { t } = useTranslation('capture');
  const navigateUp = useNavigateUp();
  const { t: tCoach } = useTranslation('coach');
  const captureInsets = useSafeAreaInsets();
  const cameraCoach = useFirstTime('camera');
  const params = useLocalSearchParams<{ subjectId?: string; folderId?: string }>();
  const preSubjectId = params.subjectId ?? null;
  const preFolderId = params.folderId ?? null;

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [shutterBusy, setShutterBusy] = useState(false);
  const [liveTilt, setLiveTilt] = useState<number | null>(null);
  const [recent, setRecent] = useState<{ status: QualityStatus; reason: QualityReason } | null>(
    null,
  );
  const [redCandidate, setRedCandidate] = useState<{
    photo: CapturedPhoto;
    reason: QualityReason;
  } | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const setPending = useCaptureStore((s) => s.setPending);

  // Permission is requested on the first shutter tap, not on mount.
  // Requesting before the user takes any action is an App Store rejection reason.

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(250);
      sub = DeviceMotion.addListener((m: DeviceMotionMeasurement) => {
        if (cancelled) return;
        const g = m.accelerationIncludingGravity;
        if (!g) return;
        setLiveTilt(scoreTilt(g));
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (!recent) return;
    const id = setTimeout(() => setRecent(null), 1800);
    return () => clearTimeout(id);
  }, [recent]);

  const onShutter = async () => {
    if (shutterBusy) return;
    if (!permission?.granted) {
      if (permission?.canAskAgain) {
        await requestPermission();
      }
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert(t('limits.max_reached'));
      return;
    }
    const cam = cameraRef.current;
    if (!cam) return;
    // Snapshot tilt at shutter-press, not at the end of the await chain —
    // otherwise the recorded "tilt at shutter" reflects the device pose
    // a few hundred ms later (Doc 05 §Capture wants the moment of capture).
    const tiltAtShutter = liveTilt;
    setShutterBusy(true);
    try {
      const pic = await cam.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!pic) return;
      const { gray } = await decodeForQuality(pic.uri, pic.width, pic.height);
      const blur = scoreBlur(gray);
      const brightness = scoreBrightness(gray);
      const score: QualityScore = {
        blur,
        brightness,
        tilt: tiltAtShutter,
        width: pic.width,
        height: pic.height,
      };
      const verdict = classify(score);

      const photo: CapturedPhoto = {
        uri: pic.uri,
        width: pic.width,
        height: pic.height,
        quality: score,
        localId: `${Date.now()}-${photos.length + 1}`,
      };

      if (verdict.status === 'red') {
        setRedCandidate({ photo, reason: verdict.reason });
      } else {
        setPhotos((prev) => [...prev, photo]);
        setRecent({ status: verdict.status, reason: verdict.reason });
      }
    } catch {
      toast.error(t('cta.shutter_error'));
    } finally {
      setShutterBusy(false);
    }
  };

  const deletePhoto = (localId: string) => {
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
  };

  // Pick from device photo library. We still score each picked image with the
  // same blur / brightness / tilt path the camera shutter uses, so the worker
  // sees consistent quality metadata regardless of whether photos were taken
  // here or already existed on the phone. Tilt is 0 (no device-motion frame
  // available for a previously-taken photo).
  const pickFromGallery = async () => {
    if (shutterBusy) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert(t('limits.max_reached'));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('gallery.permission_title'), t('gallery.permission_body'), [
        { text: t('gallery.permission_cancel'), style: 'cancel' },
        ...(perm.canAskAgain
          ? []
          : [
              {
                text: t('gallery.permission_settings'),
                onPress: () => void Linking.openSettings(),
              },
            ]),
      ]);
      return;
    }
    setShutterBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
        exif: false,
      });
      if (res.canceled || res.assets.length === 0) return;
      const accepted: CapturedPhoto[] = [];
      for (const asset of res.assets) {
        try {
          const { gray } = await decodeForQuality(
            asset.uri,
            asset.width ?? 1024,
            asset.height ?? 1024,
          );
          const blur = scoreBlur(gray);
          const brightness = scoreBrightness(gray);
          const score: QualityScore = {
            blur,
            brightness,
            tilt: 0,
            width: asset.width ?? 1024,
            height: asset.height ?? 1024,
          };
          accepted.push({
            uri: asset.uri,
            width: asset.width ?? 1024,
            height: asset.height ?? 1024,
            quality: score,
            localId: `gal-${Date.now()}-${accepted.length + 1}`,
          });
        } catch {
          // skip a single bad asset; keep going so the user doesn't lose
          // the others in the same selection
        }
      }
      if (accepted.length > 0) {
        setPhotos((prev) => [...prev, ...accepted]);
        setRecent({ status: 'green', reason: null });
      }
    } catch {
      toast.error(t('gallery.error'));
    } finally {
      setShutterBusy(false);
    }
  };

  const commit = (target: { subjectId: string; folderId: string | null }) => {
    setPending({
      photos,
      subject_id: target.subjectId,
      folder_id: target.folderId,
      created_at: new Date().toISOString(),
    });
    router.replace('/(learner)/upload');
  };

  const onDone = () => {
    if (photos.length === 0) return;
    if (preSubjectId) {
      commit({ subjectId: preSubjectId, folderId: preFolderId });
      return;
    }
    if (!learnerId) return;
    setPickerVisible(true);
  };

  const doneDisabled = photos.length === 0 || (!preSubjectId && !learnerId);

  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={LB.ink2} />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
        </View>
        <View style={{ paddingHorizontal: 28, gap: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: '600', color: LB.ink, letterSpacing: -0.4 }}>
            {t('permission.title')}
          </Text>
          <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
            {t('permission.body')}
          </Text>
          <View style={{ height: 6 }} />
          <Btn variant="primary" onPress={() => void Linking.openSettings()}>
            {t('permission.cta')}
          </Btn>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 18,
            paddingTop: 8,
          }}
        >
          <CircleBtn icon="back" onPress={navigateUp} />
          {liveTilt !== null && liveTilt > 25 && (
            <CaptureChip status="yellow" label={t('tilt_warn')} />
          )}
          <View style={{ width: 40 }} />
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: captureInsets.bottom,
        }}
      >
        <View style={{ paddingHorizontal: 14, paddingBottom: 10, gap: 10 }}>
          {recent && (
            <View style={{ alignItems: 'center' }}>
              <CaptureChip
                status={recent.status}
                label={recentChipLabel(recent.status, recent.reason, t)}
              />
            </View>
          )}

          {photos.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
            >
              {photos.map((p) => {
                const verdict = classify(p.quality);
                return (
                  <Pressable
                    key={p.localId}
                    onLongPress={() => {
                      Alert.alert(t('strip.delete_title'), undefined, [
                        { text: t('strip.delete_cancel'), style: 'cancel' },
                        {
                          text: t('strip.delete_confirm'),
                          style: 'destructive',
                          onPress: () => deletePhoto(p.localId),
                        },
                      ]);
                    }}
                  >
                    <View
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: '#222',
                      }}
                    >
                      <Image
                        source={{ uri: p.uri }}
                        style={{ width: 64, height: 64 }}
                        contentFit="cover"
                        transition={150}
                      />
                    </View>
                    <View style={{ position: 'absolute', bottom: 4, left: 4 }}>
                      <CaptureChip
                        status={verdict.status}
                        compact
                        label={shortChip(verdict.status, t)}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <View style={{ minWidth: 64, gap: 6 }}>
              <Text style={{ color: '#fff', fontSize: 12 }}>
                {photos.length === 1
                  ? t('strip.label_one')
                  : t('strip.label_other', { count: photos.length })}
              </Text>
              <Pressable
                onPress={() => void pickFromGallery()}
                disabled={shutterBusy || photos.length >= MAX_PHOTOS}
                accessibilityRole="button"
                accessibilityLabel={t('gallery.cta')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignSelf: 'flex-start',
                  opacity: shutterBusy || photos.length >= MAX_PHOTOS ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                  {t('gallery.cta')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onShutter}
              disabled={shutterBusy || photos.length >= MAX_PHOTOS}
              style={{
                width: 68,
                height: 68,
                opacity: shutterBusy || photos.length >= MAX_PHOTOS ? 0.55 : 1,
              }}
              accessibilityLabel={t('cta.shutter')}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 999,
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{ width: 54, height: 54, borderRadius: 999, backgroundColor: LB.ink }}
                />
              </View>
            </Pressable>
            <View style={{ minWidth: 64, alignItems: 'flex-end' }}>
              <Pressable
                onPress={onDone}
                disabled={doneDisabled}
                accessibilityLabel={t('cta.done')}
              >
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: doneDisabled ? 'rgba(255,255,255,0.15)' : '#fff',
                  }}
                >
                  <Text
                    style={{
                      color: doneDisabled ? 'rgba(255,255,255,0.55)' : LB.ink,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    {t('cta.done')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={redCandidate !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setRedCandidate(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(10,10,15,0.7)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: LB.paper,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 22,
              gap: 14,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink, letterSpacing: -0.3 }}>
              {redCandidate ? recentChipLabel('red', redCandidate.reason, t) : ''}
            </Text>
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>{t('subtitle')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Btn
                  variant="primary"
                  full
                  onPress={() => {
                    if (!redCandidate) return;
                    setRecent({ status: 'yellow', reason: redCandidate.reason });
                    setRedCandidate(null);
                  }}
                >
                  {t('review.redo')}
                </Btn>
              </View>
              <View style={{ flex: 1 }}>
                <Btn
                  variant="outline"
                  full
                  onPress={() => {
                    if (!redCandidate) return;
                    setPhotos((prev) => [...prev, redCandidate.photo]);
                    setRecent({ status: 'red', reason: redCandidate.reason });
                    setRedCandidate(null);
                  }}
                >
                  {t('review.keep')}
                </Btn>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {learnerId && (
        <SubjectFolderPicker
          visible={pickerVisible}
          learnerId={learnerId}
          onCancel={() => setPickerVisible(false)}
          onChoose={(target) => {
            setPickerVisible(false);
            commit(target);
          }}
        />
      )}

      <CoachMark
        visible={cameraCoach.shown && !!permission?.granted}
        onDismiss={cameraCoach.dismiss}
        title={tCoach('camera.title')}
        body={tCoach('camera.body')}
        ctaLabel={tCoach('dismiss')}
        glyph="📸"
      />
    </View>
  );
}

function recentChipLabel(
  status: QualityStatus,
  reason: QualityReason,
  t: (k: string) => string,
): string {
  if (reason === 'blur') return t('chip.blur');
  if (reason === 'too_dark') return t('chip.too_dark');
  if (reason === 'too_bright') return t('chip.too_bright');
  if (reason === 'too_small') return t('chip.too_small');
  if (reason === 'tilt') return t('chip.tilt');
  if (reason === 'blur_ok') return t('chip.ok');
  return status === 'green' ? t('chip.sharp') : t('chip.ok');
}

function shortChip(status: QualityStatus, t: (k: string) => string): string {
  if (status === 'green') return t('chip.sharp');
  if (status === 'yellow') return t('chip.ok');
  return t('chip.blur');
}
