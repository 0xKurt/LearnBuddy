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
// before: they are kept as a draft until sent, lib/capture/draft.ts), shared=1
// (files shared from another app wait in lib/capture/incoming.ts).
//
// Besides camera and photos, "Aus Dateien" takes PDFs and images from the files
// app; in the browser they can also be dropped onto the screen. A PDF is sent as
// it is: no photo check, the API counts its pages (docs/architecture.md §Material).

import { Uuid } from '@learnbuddy/shared-types/contracts';
import * as DocumentPicker from 'expo-document-picker';
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
import { ApiError } from '../lib/api/client.js';
import { deleteMaterial } from '../lib/api/endpoints.js';
import { keys, queryClient } from '../lib/api/queries.js';
import {
  MAX_PHOTOS,
  MaterialUpload,
  PhotoUploadError,
  preparePhoto,
  type MaterialLink,
  type MaterialPurpose,
  type SendProgress,
  type UploadFile,
} from '../lib/capture/upload.js';
import type { CaptureDraft, DraftLink } from '../lib/capture/draft.js';
import { drafts } from '../lib/capture/draftStorage.js';
import { useFileDrop } from '../lib/capture/drop.js';
import { ownCopy, sizeOf } from '../lib/capture/fileCopy.js';
import { displayName, MAX_PDF_MB, sortIncoming, type IncomingFile } from '../lib/capture/files.js';
import { takeIncoming } from '../lib/capture/incoming.js';
import {
  clearCameraOpen,
  markCameraOpen,
  takePendingPhotos,
} from '../lib/capture/pendingCamera.js';
import { useAnnounce } from '../lib/announce.js';
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

/** The API refused the files themselves: that material is gone, other files start anew. */
const FILE_REFUSALS = new Set(['too_many_pages', 'file_unreadable', 'file_too_large']);

/** One picked thing in page order: a photo, or a PDF (its name). */
type Entry = { uri: string; pdf: string | null };

function uploadFiles(
  uris: readonly string[],
  pdfs: Readonly<Record<string, string>>,
): UploadFile[] {
  return uris.map((uri) => ({ uri, mime: pdfs[uri] ? 'application/pdf' : 'image/jpeg' }));
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
    /** Android: photos from a camera session the system cut off (lib/capture/pendingCamera.ts). */
    pending?: string | string[];
    /** Opened from talk mode: once sent, back to the conversation there. */
    from?: string | string[];
    /**
     * Opened from the composer's + menu (issue #82): the chosen picker opens at once, so
     * she lands in the camera or the gallery instead of on a page that asks again.
     */
    source?: string | string[];
  }>();
  const fromTalk = params.from === 'talk';
  const straightTo = ((): 'camera' | 'library' | 'files' | null => {
    const value = Array.isArray(params.source) ? params.source[0] : params.source;
    return value === 'camera' || value === 'library' || value === 'files' ? value : null;
  })();
  const pending = params.pending === '1';
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
  /** The files among them that are PDFs, with their names (uri → name). */
  const [pdfs, setPdfs] = useState<Readonly<Record<string, string>>>({});
  const [preparing, setPreparing] = useState<{ current: number; total: number } | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** The API refused these files (not a network problem): she changes them first. */
  const [refused, setRefused] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // iOS has no live regions: preparation progress and a blocked camera say
  // themselves (lib/announce.ts suppresses the Android live-region duplicate).
  useAnnounce(
    preparing
      ? t('capture:preparing', { current: preparing.current, count: preparing.total })
      : null,
    { key: preparing?.current },
  );
  useAnnounce(cameraBlocked ? t('capture:permission.camera') : null);
  // One upload per photo set: a retry reuses it (same client_request_id); a changed set drops it.
  const upload = useRef<MaterialUpload | null>(null);
  const picking = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  /** Changed here since opening: only then is the draft written (and an older one replaced). */
  const dirty = useRef(false);

  /** Photos left from before when this capture opened fresh: she decides first (audit M-21). */
  const [leftover, setLeftover] = useState<CaptureDraft | null>(null);
  /** The draft from before has been looked at (shared files wait until then). */
  const [loaded, setLoaded] = useState(false);
  /** Files that came while photos were being prepared or sent. */
  const deferred = useRef<IncomingFile[]>([]);

  function applyDraft(d: CaptureDraft) {
    const uris = d.photos.map((p) => p.uri);
    setLink(d.link);
    setPhotos(uris);
    setProblems(
      Object.fromEntries(d.photos.filter((p) => p.problems.length).map((p) => [p.uri, p.problems])),
    );
    setKept(new Set(d.photos.filter((p) => p.kept).map((p) => p.uri)));
    const pdfNames = Object.fromEntries(
      d.photos.flatMap((p) => (p.pdf ? [[p.uri, p.pdf] as const] : [])),
    );
    setPdfs(pdfNames);
    // Already on its way before: the same material, nothing sent twice.
    if (d.requestId)
      upload.current = new MaterialUpload(
        uploadFiles(uris, pdfNames),
        uploadLink(d.link),
        d.requestId,
      );
  }

  /** What the draft keeps of the photos on the screen. */
  function draftPhotos() {
    return photos.map((uri) => ({
      uri,
      problems: problems[uri] ?? [],
      kept: kept.has(uri),
      pdf: pdfs[uri] ?? null,
    }));
  }

  useEffect(() => {
    mounted.current = true;
    void (resume ? drafts.load() : drafts.leftBehind()).then(async (d) => {
      if (!mounted.current) return;
      setLoaded(true);
      if (dirty.current) return;
      if (d && resume) applyDraft(d);
      else if (d) setLeftover(d);
      if (!pending) return;
      // The photo taken when the app was cut off joins the capture it was for.
      const recovered = await takePendingPhotos();
      if (!recovered || !mounted.current) return;
      if (!d) setLink(recovered.link);
      void addPhotos(recovered.uris);
    });
    return () => {
      mounted.current = false;
    };
  }, [resume, pending]);

  // Came from the + menu: open that picker once, as if she had tapped it here (issue #82).
  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || !straightTo || opened.current || leftover) return;
    opened.current = true;
    if (straightTo === 'files') void pickFiles();
    else void pick(straightTo);
  }, [loaded, straightTo, leftover]);

  function continueLeftover() {
    if (!leftover) return;
    applyDraft(leftover);
    dirty.current = true;
    setLeftover(null);
  }

  async function discardLeftover() {
    if (leftover) await drafts.discard(leftover);
    setLeftover(null);
  }

  // The draft follows every change, so closing the app loses nothing.
  useEffect(() => {
    if (!dirty.current) return;
    void drafts.save({
      requestId: upload.current?.requestId ?? null,
      photos: draftPhotos(),
      link,
    });
  }, [photos, problems, kept, pdfs, link]);

  /**
   * The first change here: from now on the draft follows this screen. A draft
   * left from before was offered first (leftover); one still being sent is
   * never deleted — its send finishes (drafts.discard keeps it).
   */
  async function touch() {
    if (!dirty.current && !resume && !leftover) await drafts.discard();
    dirty.current = true;
  }

  const busy = preparing !== null || progress !== null;
  const room = MAX_PHOTOS - photos.length;

  // Files shared from another app, now or while this screen is open (ShareIntake) — once
  // the draft from before is loaded and, if there is one, she has decided about it.
  const addFilesNow = useRef(addFiles);
  addFilesNow.current = addFiles;
  useEffect(() => {
    if (!loaded || leftover) return;
    return takeIncoming((files) => void addFilesNow.current(files));
  }, [loaded, leftover]);
  useEffect(() => {
    if (busy || deferred.current.length === 0) return;
    void addFiles(deferred.current.splice(0));
  }, [busy]);
  // In the browser a sheet can also be dropped onto the screen.
  const dropping = useFileDrop((files) => void addFilesNow.current(files), loaded && !leftover);

  function photosChanged() {
    // A reservation for the old photo set that was never submitted: gone, not left
    // behind as an "unvollständig" sheet (audit M-20).
    const abandoned = upload.current?.abandonedReservation;
    if (abandoned) void deleteMaterial(abandoned).catch(() => undefined);
    upload.current = null;
    setFailure(null);
    setRefused(false);
  }

  /** `replace`: the photo a retake stands in for — same place, only once the new one is there. */
  async function addPhotos(sources: string[], replace: string | null = null) {
    await addEntries(
      sources.map((uri) => ({ uri, pdf: null })),
      replace,
    );
  }

  /** Photos are prepared and checked; a PDF gets its own copy and is taken as it is. */
  async function addEntries(entries: Entry[], replace: string | null = null) {
    let failed = 0;
    await touch();
    for (const [i, entry] of entries.entries()) {
      const source = entry.uri;
      setPreparing({ current: i + 1, total: entries.length });
      try {
        const prepared = entry.pdf
          ? { uri: await ownCopy(source, 'pdf'), problems: [] }
          : await preparePhoto(source);
        // Where the system does not clean up: the photo survives the app being closed.
        const photo = { ...prepared, uri: await drafts.keep(prepared.uri) };
        // She left while it was being prepared: the copy belongs to no draft — delete it
        // instead of leaving it in the app's documents (p2-prepared-copies-leak-on-early-exit).
        if (!mounted.current) {
          void drafts.drop([photo.uri]);
          return;
        }
        if (replace && i === 0) {
          setPhotos((prev) => prev.map((p) => (p === replace ? photo.uri : p)));
          setProblems(({ [replace]: _gone, ...rest }) => rest);
          void drafts.drop([replace]);
        } else {
          setPhotos((prev) => (prev.length < MAX_PHOTOS ? [...prev, photo.uri] : prev));
        }
        const pdfName = entry.pdf;
        if (pdfName) setPdfs((prev) => ({ ...prev, [photo.uri]: pdfName }));
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

  /**
   * Files from "Aus Dateien", another app's share sheet or a drop in the browser: photos
   * and PDFs in the order they came; other file types and PDFs too large are said, not
   * silently dropped.
   */
  async function addFiles(files: readonly IncomingFile[]) {
    if (busy) {
      // Taken once the photos before them are ready or sent.
      deferred.current.push(...files);
      return;
    }
    const sized = files.map((f) => (f.size === null ? { ...f, size: sizeOf(f.uri) } : f));
    const { take, unsupported, tooLarge } = sortIncoming(sized);
    if (unsupported > 0) toast.show(t('capture:files.unsupported', { count: unsupported }));
    if (tooLarge > 0) toast.show(t('capture:files.too_large', { max: MAX_PDF_MB }), 'error');
    if (take.length > room) toast.show(t('capture:limit', { max: MAX_PHOTOS }));
    const entries = take
      .slice(0, Math.max(0, room))
      .map((f) => ({ uri: f.uri, pdf: f.kind === 'pdf' ? displayName(f) : null }));
    if (entries.length > 0) await addEntries(entries);
  }

  async function pickFiles() {
    if (picking.current || busy || room <= 0) return;
    picking.current = true;
    try {
      let result: DocumentPicker.DocumentPickerResult;
      try {
        result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          multiple: true,
          copyToCacheDirectory: true,
        });
      } catch {
        toast.show(t('capture:files.error'), 'error');
        return;
      }
      if (result.canceled) return;
      await addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType ?? null,
          size: a.size ?? null,
        })),
      );
    } finally {
      picking.current = false;
    }
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
          // Android may kill the app meanwhile: note what the photo is for (audit M-22).
          await markCameraOpen(link);
          try {
            result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
          } finally {
            void clearCameraOpen();
          }
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
    setPdfs(({ [uri]: _gone, ...rest }) => rest);
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
    // Refused files: the message says what to change; "your photos are still here" would
    // invite sending the same again.
    if (err instanceof ApiError && err.reason && FILE_REFUSALS.has(err.reason))
      return messageFor(err);
    return `${messageFor(err)} ${t('capture:error.kept')}`;
  }

  /** Keeps these photos as the draft if the slot is free; true when they are kept. */
  async function keepIfFree(requestId: string): Promise<boolean> {
    const existing = await drafts.load();
    if (existing) return existing.requestId === requestId;
    await drafts.save({ requestId, photos: draftPhotos(), link });
    return true;
  }

  async function send() {
    if (sending.current || busy || photos.length === 0) return;
    sending.current = true;
    if (!upload.current)
      upload.current = new MaterialUpload(uploadFiles(photos, pdfs), uploadLink(link));
    const current = upload.current;
    setFailure(null);
    setProgress({ step: 'reserving' });
    drafts.startSending(current.requestId);
    let delivered = false;
    let failedAway = false;
    dirty.current = true;
    // The request id goes into the draft first: after a crash the same material goes on.
    await drafts.save({ requestId: current.requestId, photos: draftPhotos(), link });
    try {
      // Keeps going if the learner leaves meanwhile: they asked for it to be sent.
      await current.send(setProgress);
      delivered = true;
      // With a PDF among them, page numbers are not photo positions (no page thumbnail).
      if (current.material)
        await drafts.sent(
          current.material,
          photos,
          current.requestId,
          !photos.some((uri) => pdfs[uri]),
        );
      void queryClient.invalidateQueries({ queryKey: keys.home });
      void queryClient.invalidateQueries({ queryKey: keys.library });
      if (mounted.current) {
        if (link.add && completes && router.canGoBack()) {
          // A page added to a sheet: back to that sheet, with a word that it is on its way
          // there (p2-J-06). Its questions join the sheet once read.
          void queryClient.invalidateQueries({ queryKey: keys.material(completes) });
          toast.show(t('capture:again.added'));
          router.back();
        } else if (fromTalk && router.canGoBack()) {
          // Shown to Buddy while talking: back to talk mode, which says it is being read.
          router.back();
        } else {
          // Back to Buddy's home, which now shows the reading (opens it if it isn't in the stack).
          router.dismissTo('/buddy');
        }
      }
    } catch (err) {
      // The files were refused (too many pages, not a PDF, too large): that material is
      // gone; with other files she starts a new one.
      const refusedFiles = err instanceof ApiError && !!err.reason && FILE_REFUSALS.has(err.reason);
      if (refusedFiles && upload.current === current) upload.current = null;
      if (refusedFiles && mounted.current) setRefused(true);
      if (mounted.current) setFailure(failureText(err));
      else failedAway = true;
    } finally {
      drafts.stopSending(current.requestId);
      // She left meanwhile and started another capture: these photos are offered again
      // when the draft slot is free (home: "Deine Fotos sind noch nicht gesendet"). The
      // toast says what is true: waiting on the home, or really gone
      // (left-mid-send-copy-contradiction).
      if (!mounted.current && !delivered) {
        void keepIfFree(current.requestId)
          .catch(() => false)
          .then((kept) => {
            if (failedAway)
              toast.show(t(kept ? 'capture:error.left_kept' : 'capture:error.left'), 'error');
          });
      }
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
          <Section
            title={
              photos.some((uri) => pdfs[uri])
                ? t('capture:files.title', { count: photos.length })
                : t('capture:photos_title', { count: photos.length })
            }
          >
            <PhotoStrip
              uris={photos}
              pdfs={pdfs}
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

        {leftover && photos.length === 0 ? (
          <Card tone="butter" padding={16}>
            <View style={{ gap: 10 }}>
              <Text accessibilityRole="header" style={TYPE.title}>
                {t('capture:draft.title')}
              </Text>
              <Text style={TYPE.body}>
                {t('capture:draft.body', { count: leftover.photos.length })}
              </Text>
              <Btn pill full onPress={continueLeftover}>
                {t('capture:draft.resume')}
              </Btn>
              <Btn pill full variant="ghost" onPress={() => void discardLeftover()}>
                {t('capture:draft.discard')}
              </Btn>
            </View>
          </Card>
        ) : review ? null : room > 0 ? (
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
              {/* One row, two quiet choices: a photo from the gallery, or a file (PDF too). */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Btn
                    variant="ghost"
                    pill
                    full
                    disabled={busy}
                    onPress={() => void pick('library')}
                    accessibilityLabel={t('capture:library')}
                  >
                    {t('capture:library_short')}
                  </Btn>
                </View>
                <View style={{ flex: 1 }}>
                  <Btn
                    variant="ghost"
                    pill
                    full
                    disabled={busy}
                    onPress={() => void pickFiles()}
                    accessibilityLabel={t('capture:files.pick_label')}
                  >
                    {t('capture:files.pick')}
                  </Btn>
                </View>
              </View>
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
        refused={refused}
        onSend={() => void send()}
      />

      {dropping ? (
        // The browser: files dragged over the page. A hint only; the drop works anywhere.
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            bottom: 12,
            borderRadius: 28,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: LB.primary,
            backgroundColor: LB.veil,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: LB.lavender,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="file" size={32} color={LB.primaryDk} />
          </View>
          <Text style={[TYPE.title, { textAlign: 'center', maxWidth: 260 }]}>
            {t('capture:files.drop')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
