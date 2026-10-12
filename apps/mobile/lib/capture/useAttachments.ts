// Everything that happens to a page between picking it and the API having it:
// preparing and checking a photo, taking a PDF as it is, the draft that survives the
// app being closed, the upload that can be resumed with the same client_request_id,
// files shared from other apps and dropped in the browser.
//
// One place (issues #82, #519): the chat's input bar. Every way to a page ends there
// (lib/capture/attachRequest.ts) — a page for the chat, the homework, a step, a sheet that
// misses a page — and what the pages are for travels as their `link`. What it draws is
// components/buddy/ComposerPages.tsx; what happens once they are sent is the bar's (`onSent`).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { toast } from '../../components/lb/Toast.js';
import { useAnnounce } from '../announce.js';
import { deleteMaterial } from '../api/endpoints.js';
import { keys, queryClient } from '../api/queries.js';
import { messageFor } from '../errors.js';
import { useMounted } from '../useMounted.js';
import {
  classifySend,
  draftPages,
  filesToTake,
  firstToReview,
  hasPdf,
  NO_PAGES,
  pagesFromDraft,
  roomFor,
  uploadFiles,
  withPageAdded,
  withPageKept,
  withPageRemoved,
  type Entry,
  type PageSet,
} from './attachments.js';
import { CHAT_LINK } from './attachRequest.js';
import type { CaptureDraft, DraftLink } from './draft.js';
import { drafts } from './draftStorage.js';
import { useFileDrop } from './drop.js';
import { ownCopy, sizeOf } from './fileCopy.js';
import { openCamera } from './camera.js';
import { MAX_PDF_MB, sortIncoming, type IncomingFile } from './files.js';
import { useLiveAttachments } from './live.js';
import { takeIncoming } from './incoming.js';
import { clearCameraOpen, markCameraOpen, takePendingPhotos } from './pendingCamera.js';
import {
  MAX_PHOTOS,
  pageHandler,
  type PageLink,
  type PageUpload,
  type SendProgress,
  type UploadFile,
} from './pages.js';
import { preparePhoto } from './prepare.js';

function uploadLink(l: DraftLink): PageLink {
  return { stepId: l.stepId, goalId: l.goalId, purpose: l.purpose, completes: l.completes };
}

/**
 * Starts one set's send with the domain that takes the pages (lib/capture/pages.ts). The chat
 * offers no way to attach without one (components/buddy/Composer.tsx), so none starts here.
 */
function startUpload(
  files: readonly UploadFile[],
  link: DraftLink,
  requestId?: string,
): PageUpload {
  const handler = pageHandler.get();
  if (!handler) throw new Error('Anhänge: keine Domain nimmt Seiten an (#107)');
  return handler.start(files, uploadLink(link), requestId);
}

type Options = {
  /**
   * A drop in the browser lands here: only while the chat is the screen she sees, never under
   * a practice that stands over it.
   */
  droppable: boolean;
  /** The pages are with the API: the material's id, or null when it was sent without one. */
  onSent?: (materialId: string | null, link: DraftLink) => void;
};

export function useAttachments({ droppable, onSent }: Options) {
  const { t } = useTranslation(['capture', 'common']);
  /** What the pages are for; a resumed draft brings its own. */
  const [link, setLinkState] = useState<DraftLink>(CHAT_LINK);
  /**
   * The same, readable at once: a place that asks for a page sets it and opens the camera in one
   * go (lib/capture/attachRequest.ts), and the page that comes back must go up for what was asked
   * — not for what the render before knew.
   */
  const linkNow = useRef(link);
  function setLink(next: DraftLink) {
    linkNow.current = next;
    setLinkState(next);
  }

  /** The pages of this sheet, in page order (lib/capture/attachments.ts). */
  const [pages, setPages] = useState<PageSet>(NO_PAGES);
  const { uris: photos, problems, kept, pdfs } = pages;
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
  const upload = useRef<PageUpload | null>(null);
  const picking = useRef(false);
  const sending = useRef(false);
  const mounted = useMounted();
  /** Changed here since opening: only then is the draft written (and an older one replaced). */
  const dirty = useRef(false);
  const sent = useRef(onSent);
  sent.current = onSent;

  /** Files that came while photos were being prepared or sent. */
  const deferred = useRef<IncomingFile[]>([]);

  function applyDraft(d: CaptureDraft) {
    const restored = pagesFromDraft(d);
    setLink(d.link);
    setPages(restored);
    // Already on its way before: the same material, nothing sent twice.
    if (d.requestId)
      upload.current = startUpload(uploadFiles(restored.uris, restored.pdfs), d.link, d.requestId);
  }

  /** What the draft keeps of the photos on the screen. */
  function draftPhotos() {
    return draftPages(pages);
  }

  // The chat's pages are on screen while they are attached: the home notice must not treat
  // them as left behind (lib/capture/live.ts).
  const live = useLiveAttachments((st) => st.set);
  useEffect(() => {
    live(photos.length);
    return () => live(0);
  }, [photos.length, live]);

  /**
   * Go on with the pages left from before (the home's "Weiter", audit M-21): they become the
   * pages above her text, with what they were for. `withPending`: the photo taken when Android
   * cut the app off joins them (audit M-22).
   */
  async function resumeDraft(withPending: boolean) {
    const d = await drafts.load();
    if (!mounted.current) return;
    if (d) {
      applyDraft(d);
      dirty.current = true;
    }
    if (!withPending) return;
    const recovered = await takePendingPhotos();
    if (!recovered || !mounted.current) return;
    if (!d) setLink(recovered.link);
    await addPhotos(recovered.uris);
  }

  // The draft follows every change, so closing the app loses nothing.
  useEffect(() => {
    if (!dirty.current) return;
    void drafts.save({
      requestId: upload.current?.requestId ?? null,
      photos: draftPhotos(),
      link,
    });
  }, [pages, link]);

  /**
   * The first change here: from now on the draft follows the bar. A draft left from before
   * was offered on the home ("Deine Fotos sind noch nicht gesendet"); one still being sent is
   * never deleted — its send finishes (drafts.discard keeps it).
   */
  async function touch() {
    if (!dirty.current) await drafts.discard();
    dirty.current = true;
  }

  const busy = preparing !== null || progress !== null;
  const room = roomFor(pages);

  // Files shared from another app, now or while the chat is open (ShareIntake).
  const addFilesNow = useRef(addFiles);
  addFilesNow.current = addFiles;
  useEffect(() => takeIncoming((files) => void addFilesNow.current(files)), []);
  useEffect(() => {
    if (busy || deferred.current.length === 0) return;
    void addFiles(deferred.current.splice(0));
  }, [busy]);
  // In the browser a sheet can also be dropped onto the screen.
  const dropping = useFileDrop((files) => void addFilesNow.current(files), droppable);

  function photosChanged() {
    // A reservation for the old photo set that was never submitted: gone, not left
    // behind as an "unvollständig" sheet (audit M-20).
    const abandoned = upload.current?.abandonedReservation;
    if (abandoned) void deleteMaterial(abandoned).catch(() => undefined);
    upload.current = null;
    setFailure(null);
    setRefused(false);
  }

  /**
   * One more page, in its place at the end: it joins the reservation and goes up right
   * away (issue #56), so "Senden" has only what is left and the submit to do. The API
   * knows nothing is on its way until she asks (`sending`), so the home stays quiet.
   */
  function pageReady(file: UploadFile) {
    setFailure(null);
    setRefused(false);
    try {
      if (upload.current) upload.current.grow(file);
      else upload.current = startUpload([file], linkNow.current);
    } catch {
      // Already sent: this page belongs to a new sheet, which the next send reserves.
      upload.current = null;
      return;
    }
    void upload.current.pushReady();
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
    // How many pages this sheet has while they are being added (the state in the closure
    // is the one from this render): what is over the cap is not uploaded either.
    let count = photos.length;
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
        const pdfName = entry.pdf;
        const standsIn = replace && i === 0 ? replace : null;
        setPages((prev) =>
          withPageAdded(prev, { uri: photo.uri, problems: photo.problems, pdf: pdfName }, standsIn),
        );
        if (standsIn) void drafts.drop([standsIn]);
        // A retake changes what is already reserved: that reservation is given up and the
        // pages start again. A new page only extends it.
        if (replace) {
          photosChanged();
        } else if (count < MAX_PHOTOS) {
          count += 1;
          pageReady({ uri: photo.uri, mime: pdfName ? 'application/pdf' : 'image/jpeg' });
        }
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
    const { entries, overLimit } = filesToTake(take, room);
    if (overLimit) toast.show(t('capture:limit', { max: MAX_PHOTOS }));
    if (entries.length > 0) await addEntries(entries);
  }

  /** Files from the files app; true when any were taken. */
  async function pickFiles(): Promise<boolean> {
    if (picking.current || busy || room <= 0) return false;
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
        return false;
      }
      if (result.canceled) return false;
      await addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType ?? null,
          size: a.size ?? null,
        })),
      );
      return true;
    } finally {
      picking.current = false;
    }
  }

  /** A photo from the camera or the system's photo picker; true when any were taken. */
  async function pick(
    source: 'camera' | 'library',
    replace: string | null = null,
  ): Promise<boolean> {
    if (picking.current || busy || (room <= 0 && !replace)) return false;
    picking.current = true;
    try {
      let result: ImagePicker.ImagePickerResult;
      try {
        if (source === 'camera') {
          // Android may kill the app meanwhile: note what the photo is for (audit M-22).
          const shot = await openCamera({
            opening: () => markCameraOpen(linkNow.current),
            closed: () => void clearCameraOpen(),
          });
          setCameraBlocked(shot === 'blocked');
          if (shot === 'blocked') return false;
          result = shot;
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
        return false;
      }
      if (result.canceled) return false;
      if (!replace && result.assets.length > room)
        toast.show(t('capture:limit', { max: MAX_PHOTOS }));
      await addPhotos(
        result.assets.slice(0, replace ? 1 : room).map((a) => a.uri),
        replace,
      );
      return true;
    } finally {
      picking.current = false;
    }
  }

  function remove(uri: string) {
    if (busy) return;
    dirty.current = true;
    setPages((prev) => withPageRemoved(prev, uri));
    void drafts.drop([uri]);
    photosChanged();
  }

  /** The first photo with a problem she has not decided about yet. */
  const review = firstToReview(pages);

  function retake(uri: string) {
    // The old photo stays until a new one is taken (cancelling keeps it), in its place.
    void pick('camera', uri);
  }

  /** "Passt schon": this photo goes along despite what the check found. */
  function keep(uri: string) {
    dirty.current = true;
    setPages((prev) => withPageKept(prev, uri));
  }

  /**
   * What a failed send says. "Deine Fotos sind noch da" only where it is true —
   * refused files are gone, and so is a page whose local file vanished
   * (lib/capture/attachments.ts).
   */
  function failureText(err: unknown): string {
    const failure = classifySend(err);
    const what = failure.page
      ? t(failure.page.key, { index: failure.page.index })
      : messageFor(err);
    return failure.kept ? `${what} ${t('capture:error.kept')}` : what;
  }

  /** Keeps these photos as the draft if the slot is free; true when they are kept. */
  async function keepIfFree(requestId: string): Promise<boolean> {
    const existing = await drafts.load();
    if (existing) return existing.requestId === requestId;
    await drafts.save({ requestId, photos: draftPhotos(), link: linkNow.current });
    return true;
  }

  async function send() {
    if (sending.current || busy || photos.length === 0) return;
    sending.current = true;
    // The pages that went up along the way are this sheet; if anything drifted apart (a
    // page taken out, a draft from before), that reservation is given up and these pages
    // start as a new one — nothing half-known is sent.
    if (upload.current && upload.current.pageCount !== photos.length) photosChanged();
    if (!upload.current) upload.current = startUpload(uploadFiles(photos, pdfs), linkNow.current);
    const current = upload.current;
    setFailure(null);
    setProgress({ step: 'reserving' });
    drafts.startSending(current.requestId);
    let delivered = false;
    let failedAway = false;
    dirty.current = true;
    // The request id goes into the draft first: after a crash the same material goes on.
    const sentFor = linkNow.current;
    await drafts.save({ requestId: current.requestId, photos: draftPhotos(), link: sentFor });
    try {
      // Keeps going if the learner leaves meanwhile: they asked for it to be sent.
      await current.send(setProgress);
      delivered = true;
      // With a PDF among them, page numbers are not photo positions (no page thumbnail).
      if (current.material)
        await drafts.sent(current.material, photos, current.requestId, !hasPdf(pages));
      void queryClient.invalidateQueries({ queryKey: keys.home });
      void queryClient.invalidateQueries({ queryKey: keys.library });
      if (mounted.current) {
        setPages(NO_PAGES);
        // The next pages are the chat's own until a place asks for others.
        setLink(CHAT_LINK);
        upload.current = null;
        sent.current?.(current.material, sentFor);
      }
    } catch (err) {
      // The files were refused (too many pages, not a PDF, too large): that material is
      // gone; with other files she starts a new one.
      const refusedFiles = classifySend(err).refused;
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
          .then((stillThere) => {
            if (failedAway)
              toast.show(t(stillThere ? 'capture:error.left_kept' : 'capture:error.left'), 'error');
          });
      }
      sending.current = false;
      setProgress(null);
    }
  }

  return {
    link,
    setLink,
    photos,
    problems,
    kept,
    pdfs,
    preparing,
    progress,
    failure,
    refused,
    cameraBlocked,
    review,
    busy,
    room,
    dropping,
    pick,
    pickFiles,
    addPhotos,
    remove,
    retake,
    keep,
    send,
    resumeDraft,
  };
}
