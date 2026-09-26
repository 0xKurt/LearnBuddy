// Photograph study material and send it to be read (docs/architecture.md
// §Material). Photos are made small but readable on the device, uploaded
// straight to storage, then the API checks and reads them; Buddy's home shows
// the reading. A failed send keeps the photos for another try.
//
// Optional route params: stepId (the capture step Buddy asked for), goalId
// (the goal the material belongs to) and purpose ('homework': the tasks are
// read and a help session is made — hints only, never the solution),
// completes (an earlier material whose missing pages these are) with pages
// (their numbers, for the hint), resume=1 (go on with the photos left from
// before: they are kept as a draft until sent, lib/capture/draft.ts).

import { Uuid } from '@learnbuddy/shared-types/contracts';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CaptureTips } from '../components/capture/CaptureTips.js';
import { PhotoCheckCard } from '../components/capture/PhotoCheckCard.js';
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
  type MaterialLink,
  type MaterialPurpose,
  type SendProgress,
} from '../lib/capture/upload.js';
import type { DraftLink } from '../lib/capture/draft.js';
import { drafts } from '../lib/capture/draftStorage.js';
import { messageFor } from '../lib/errors.js';
import type { PhotoProblem } from '../lib/photo/quality.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

/** The purpose param; anything else is study material. */
function purposeParam(value: string | string[] | undefined): MaterialPurpose {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'homework' ? 'homework' : 'study';
}

/** "2,3" → "2, 3"; anything that is not a list of page numbers is ignored. */
function pagesParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^\d{1,2}(,\d{1,2})*$/.test(v) ? v.split(',').join(', ') : null;
}

function uploadLink(l: DraftLink): MaterialLink {
  return { stepId: l.stepId, goalId: l.goalId, purpose: l.purpose, completes: l.completes };
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
    completes?: string | string[];
    pages?: string | string[];
    resume?: string | string[];
    add?: string | string[];
  }>();
  const resume = params.resume === '1';
  /** What the photos are for; a resumed draft brings its own. */
  const [link, setLink] = useState<DraftLink>(() => ({
    stepId: idParam(params.stepId),
    goalId: idParam(params.goalId),
    purpose: purposeParam(params.purpose),
    completes: idParam(params.completes),
    pages: pagesParam(params.pages),
    add: params.add === '1',
  }));
  const homework = link.purpose === 'homework';
  const completes = link.completes;
  const missingPages = link.pages;

  /** Local URIs of the prepared JPEGs, in page order. */
  const [photos, setPhotos] = useState<string[]>([]);
  /** What the check on the device found per photo (lib/photo/quality.ts). */
  const [problems, setProblems] = useState<Record<string, PhotoProblem[]>>({});
  /** Photos she chose to keep despite a problem. */
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [preparing, setPreparing] = useState<{ current: number; total: number } | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // One upload per photo set: a retry reuses it (same client_request_id); a changed set drops it.
  const upload = useRef<MaterialUpload | null>(null);
  const picking = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  /** Changed here since opening: only then is the draft written (and an older one replaced). */
  const dirty = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (resume) {
      void drafts.load().then((d) => {
        if (!d || !mounted.current || dirty.current) return;
        const uris = d.photos.map((p) => p.uri);
        setLink(d.link);
        setPhotos(uris);
        setProblems(
          Object.fromEntries(
            d.photos.filter((p) => p.problems.length).map((p) => [p.uri, p.problems]),
          ),
        );
        setKept(new Set(d.photos.filter((p) => p.kept).map((p) => p.uri)));
        // Already on its way before: the same material, nothing sent twice.
        if (d.requestId) upload.current = new MaterialUpload(uris, uploadLink(d.link), d.requestId);
      });
    }
    return () => {
      mounted.current = false;
    };
  }, [resume]);

  // The draft follows every change, so closing the app loses nothing.
  useEffect(() => {
    if (!dirty.current) return;
    void drafts.save({
      requestId: upload.current?.requestId ?? null,
      photos: photos.map((uri) => ({ uri, problems: problems[uri] ?? [], kept: kept.has(uri) })),
      link,
    });
  }, [photos, problems, kept, link]);

  /** The first change in a fresh capture replaces a draft left from before. */
  async function touch() {
    if (!dirty.current && !resume) await drafts.discard();
    dirty.current = true;
  }

  const busy = preparing !== null || progress !== null;
  const room = MAX_PHOTOS - photos.length;

  function photosChanged() {
    upload.current = null;
    setFailure(null);
  }

  /** `replace`: the photo a retake stands in for — same place, only once the new one is there. */
  async function addPhotos(sources: string[], replace: string | null = null) {
    let failed = 0;
    await touch();
    for (const [i, source] of sources.entries()) {
      setPreparing({ current: i + 1, total: sources.length });
      try {
        const prepared = await preparePhoto(source);
        // Where the system does not clean up: the photo survives the app being closed.
        const photo = { ...prepared, uri: await drafts.keep(prepared.uri) };
        if (replace && i === 0) {
          setPhotos((prev) => prev.map((p) => (p === replace ? photo.uri : p)));
          setProblems(({ [replace]: _gone, ...rest }) => rest);
          void drafts.drop([replace]);
        } else {
          setPhotos((prev) => (prev.length < MAX_PHOTOS ? [...prev, photo.uri] : prev));
        }
        if (photo.problems.length > 0)
          setProblems((prev) => ({ ...prev, [photo.uri]: photo.problems }));
        photosChanged();
      } catch {
        failed += 1;
      }
    }
    setPreparing(null);
    if (failed > 0) toast.show(t('capture:error.prepare', { count: failed }), 'error');
  }

  async function pick(source: 'camera' | 'library', replace: string | null = null) {
    if (picking.current || busy || (room <= 0 && !replace)) return;
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
      if (!replace && result.assets.length > room)
        toast.show(t('capture:limit', { max: MAX_PHOTOS }));
      await addPhotos(
        result.assets.slice(0, replace ? 1 : room).map((a) => a.uri),
        replace,
      );
    } finally {
      picking.current = false;
    }
  }

  function remove(uri: string) {
    if (busy) return;
    dirty.current = true;
    setPhotos((prev) => prev.filter((p) => p !== uri));
    void drafts.drop([uri]);
    photosChanged();
  }

  /** The first photo with a problem she has not decided about yet. */
  const review = photos.find((uri) => (problems[uri]?.length ?? 0) > 0 && !kept.has(uri)) ?? null;

  function retake(uri: string) {
    // The old photo stays until a new one is taken (cancelling keeps it), in its place.
    void pick('camera', uri);
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
    if (!upload.current) upload.current = new MaterialUpload(photos, uploadLink(link));
    const current = upload.current;
    setFailure(null);
    setProgress({ step: 'reserving' });
    drafts.startSending(current.requestId);
    dirty.current = true;
    // The request id goes into the draft first: after a crash the same material goes on.
    await drafts.save({
      requestId: current.requestId,
      photos: photos.map((uri) => ({ uri, problems: problems[uri] ?? [], kept: kept.has(uri) })),
      link,
    });
    try {
      // Keeps going if the learner leaves meanwhile: they asked for it to be sent.
      await current.send(setProgress);
      if (current.material) await drafts.sent(current.material, photos);
      void queryClient.invalidateQueries({ queryKey: keys.home });
      void queryClient.invalidateQueries({ queryKey: keys.library });
      // Back to Buddy's home, which now shows the reading (opens it if it isn't in the stack).
      if (mounted.current) router.dismissTo('/buddy');
    } catch (err) {
      if (mounted.current) setFailure(failureText(err));
      else toast.show(t('capture:error.left'), 'error');
    } finally {
      drafts.stopSending(current.requestId);
      sending.current = false;
      setProgress(null);
    }
  }

  return (
    <Screen back>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 18 }}>
        <View style={{ gap: 8, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={TYPE.display}>
            {completes
              ? link.add
                ? t('capture:again.title_add')
                : missingPages
                  ? t('capture:again.title_pages', { pages: missingPages })
                  : t('capture:again.title')
              : homework
                ? t('capture:homework.title')
                : t('capture:title')}
          </Text>
          {photos.length === 0 ? (
            <Text style={[TYPE.body, { color: LB.ink2 }]}>
              {completes
                ? link.add
                  ? t('capture:again.intro_add')
                  : t('capture:again.intro')
                : homework
                  ? t('capture:homework.intro')
                  : t('capture:intro')}
            </Text>
          ) : null}
        </View>

        {/* Tips are for taking the photo; once there is one, the photos get the room. */}
        {photos.length === 0 ? <CaptureTips /> : null}

        {photos.length > 0 ? (
          <Section title={t('capture:photos_title', { count: photos.length })}>
            <PhotoStrip
              uris={photos}
              flagged={new Set(photos.filter((uri) => (problems[uri]?.length ?? 0) > 0))}
              disabled={busy}
              onRemove={remove}
            />
          </Section>
        ) : null}

        {review ? (
          <PhotoCheckCard
            index={photos.indexOf(review) + 1}
            problems={problems[review] ?? []}
            disabled={busy}
            onRetake={() => retake(review)}
            onKeep={() => {
              dirty.current = true;
              setKept((prev) => new Set(prev).add(review));
            }}
          />
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

        {review ? null : room > 0 ? (
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
