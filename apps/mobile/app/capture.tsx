// Photograph study material and send it to be read (docs/architecture.md
// §Material). Photos are made small but readable on the device, uploaded
// straight to storage, then the API checks and reads them; Buddy's home shows
// the reading. A failed send keeps the photos for another try.
//
// Optional route params: stepId (the capture step Buddy asked for), goalId
// (the goal the material belongs to) and purpose ('homework': the tasks are
// read and a help session is made — hints only, never the solution).

import { Uuid } from '@learnbuddy/shared-types/contracts';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CaptureTips } from '../components/capture/CaptureTips.js';
import { PhotoStrip } from '../components/capture/PhotoStrip.js';
import { SendBar } from '../components/capture/SendBar.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Icon } from '../components/lb/Icon.js';
import { Screen } from '../components/lb/Screen.js';
import { Section } from '../components/lb/Section.js';
import { toast } from '../components/lb/Toast.js';
import { keys, queryClient } from '../lib/api/queries.js';
import {
  MAX_PHOTOS,
  MaterialUpload,
  PhotoUploadError,
  preparePhoto,
  type MaterialPurpose,
  type SendProgress,
} from '../lib/capture/upload.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

/** The purpose param; anything else is study material. */
function purposeParam(value: string | string[] | undefined): MaterialPurpose {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'homework' ? 'homework' : 'study';
}

/** A route param as one id; anything that is not a UUID is ignored. */
function idParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v !== undefined && Uuid.safeParse(v).success ? v : null;
}

export default function CaptureScreen() {
  const { t } = useTranslation(['capture', 'common']);
  const params = useLocalSearchParams<{
    stepId?: string | string[];
    goalId?: string | string[];
    purpose?: string | string[];
  }>();
  const stepId = idParam(params.stepId);
  const goalId = idParam(params.goalId);
  const purpose = purposeParam(params.purpose);
  const homework = purpose === 'homework';

  /** Local URIs of the prepared JPEGs, in page order. */
  const [photos, setPhotos] = useState<string[]>([]);
  const [preparing, setPreparing] = useState<{ current: number; total: number } | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // One upload per photo set: a retry reuses it (same client_request_id); a changed set drops it.
  const upload = useRef<MaterialUpload | null>(null);
  const picking = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = preparing !== null || progress !== null;
  const room = MAX_PHOTOS - photos.length;

  function photosChanged() {
    upload.current = null;
    setFailure(null);
  }

  async function addPhotos(sources: string[]) {
    let failed = 0;
    for (const [i, source] of sources.entries()) {
      setPreparing({ current: i + 1, total: sources.length });
      try {
        const photo = await preparePhoto(source);
        setPhotos((prev) => (prev.length < MAX_PHOTOS ? [...prev, photo.uri] : prev));
        photosChanged();
      } catch {
        failed += 1;
      }
    }
    setPreparing(null);
    if (failed > 0) toast.show(t('capture:error.prepare', { count: failed }), 'error');
  }

  async function pick(source: 'camera' | 'library') {
    if (picking.current || busy || room <= 0) return;
    picking.current = true;
    try {
      let result: ImagePicker.ImagePickerResult;
      try {
        if (source === 'camera') {
          // Asked only now, when the learner wants to take a photo.
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          setCameraBlocked(!permission.granted);
          if (!permission.granted) return;
          result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
        } else {
          // The system photo picker needs no photo-library permission.
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: room,
            orderedSelection: true,
          });
        }
      } catch {
        toast.show(
          t(source === 'camera' ? 'capture:error.camera' : 'capture:error.library'),
          'error',
        );
        return;
      }
      if (result.canceled) return;
      if (result.assets.length > room) toast.show(t('capture:limit', { max: MAX_PHOTOS }));
      await addPhotos(result.assets.slice(0, room).map((a) => a.uri));
    } finally {
      picking.current = false;
    }
  }

  function remove(uri: string) {
    if (busy) return;
    setPhotos((prev) => prev.filter((p) => p !== uri));
    photosChanged();
  }

  function failureText(err: unknown): string {
    if (err instanceof PhotoUploadError) {
      const index = err.position + 1;
      if (err.kind === 'file') return t('capture:error.upload_file', { index });
      const what = t(
        err.kind === 'network' ? 'capture:error.upload_network' : 'capture:error.upload_rejected',
        {
          index,
        },
      );
      return `${what} ${t('capture:error.kept')}`;
    }
    return `${messageFor(err)} ${t('capture:error.kept')}`;
  }

  async function send() {
    if (sending.current || busy || photos.length === 0) return;
    sending.current = true;
    if (!upload.current) upload.current = new MaterialUpload(photos, { stepId, goalId, purpose });
    const current = upload.current;
    setFailure(null);
    setProgress({ step: 'reserving' });
    try {
      // Keeps going if the learner leaves meanwhile: they asked for it to be sent.
      await current.send(setProgress);
      void queryClient.invalidateQueries({ queryKey: keys.home });
      void queryClient.invalidateQueries({ queryKey: keys.library });
      // Back to Buddy's home, which now shows the reading (opens it if it isn't in the stack).
      if (mounted.current) router.dismissTo('/buddy');
    } catch (err) {
      if (mounted.current) setFailure(failureText(err));
      else toast.show(t('capture:error.left'), 'error');
    } finally {
      sending.current = false;
      setProgress(null);
    }
  }

  return (
    <Screen back>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 18 }}>
        <View style={{ gap: 8, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={TYPE.display}>
            {homework ? t('capture:homework.title') : t('capture:title')}
          </Text>
          <Text style={[TYPE.body, { color: LB.ink2 }]}>
            {homework ? t('capture:homework.intro') : t('capture:intro')}
          </Text>
        </View>

        <CaptureTips />

        {photos.length > 0 ? (
          <Section title={t('capture:photos_title', { count: photos.length })}>
            <PhotoStrip uris={photos} disabled={busy} onRemove={remove} />
          </Section>
        ) : null}

        {preparing ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <ActivityIndicator size="small" color={LB.primary} />
            <Text style={[TYPE.body, { flex: 1 }]}>
              {t('capture:preparing', { current: preparing.current, count: preparing.total })}
            </Text>
          </View>
        ) : null}

        {cameraBlocked ? (
          <View accessibilityLiveRegion="polite">
            <Card tone="butter" padding={16}>
              <View style={{ gap: 12 }}>
                <Text style={TYPE.body}>{t('capture:permission.camera')}</Text>
                <Btn size="sm" variant="outline" pill onPress={() => void Linking.openSettings()}>
                  {t('capture:permission.open_settings')}
                </Btn>
              </View>
            </Card>
          </View>
        ) : null}

        {room > 0 ? (
          // First the camera is the one main action; once there are photos, sending is.
          <Card padding={16}>
            <View style={{ gap: 10 }}>
              {photos.length === 0 ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    alignSelf: 'center',
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    marginBottom: 8,
                    backgroundColor: LB.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="camera" size={32} color={LB.primaryDk} />
                </View>
              ) : null}
              <Btn
                size="lg"
                variant={photos.length === 0 ? 'primary' : 'soft'}
                pill
                full
                icon="camera"
                disabled={busy}
                onPress={() => void pick('camera')}
              >
                {photos.length === 0 ? t('capture:camera') : t('capture:camera_more')}
              </Btn>
              <Btn variant="ghost" pill full disabled={busy} onPress={() => void pick('library')}>
                {t('capture:library')}
              </Btn>
            </View>
          </Card>
        ) : (
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}>
            {t('capture:limit', { max: MAX_PHOTOS })}
          </Text>
        )}
      </ScrollView>

      <SendBar
        progress={progress}
        failure={failure}
        hasPhotos={photos.length > 0}
        disabled={busy}
        onSend={() => void send()}
      />
    </Screen>
  );
}
