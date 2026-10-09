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
//
// What happens to a page (preparing, the draft, the upload) lives in
// lib/capture/useAttachments.ts — this screen and the chat composer share it (issue #82).

import { Uuid } from '@learnbuddy/shared-types/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CaptureTips } from '../components/capture/CaptureTips.js';
import { PhotoCheckCard } from '../components/capture/PhotoCheckCard.js';
import { PhotoStrip } from '../components/capture/PhotoStrip.js';
import { SendBar } from '../components/capture/SendBar.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { IconDisc } from '../components/lb/IconDisc.js';
import { Screen } from '../components/lb/Screen.js';
import { Section } from '../components/lb/Section.js';
import { toast } from '../components/lb/Toast.js';
import { keys, queryClient } from '../lib/api/queries.js';
import { MAX_PHOTOS, type MaterialPurpose } from '../lib/capture/upload.js';
import { useAttachments } from '../lib/capture/useAttachments.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { RHYTHM, SPACE } from '../lib/theme/space.js';

/** The camera's and the drop hint's disc, and the glyph in it. */
const HINT_DISC = 72;
const HINT_ICON = 32;

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

/** A route param as one id; anything that is not a UUID is ignored. */
function idParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v !== undefined && Uuid.safeParse(v).success ? v : null;
}

export default function CaptureScreen() {
  const { palette } = useTheme();
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
  const a = useAttachments({
    initialLink: {
      stepId: idParam(params.stepId),
      goalId: idParam(params.goalId),
      purpose: purposeParam(params.purpose),
      completes: idParam(params.completes),
      pages: pagesParam(params.pages),
      add: params.add === '1',
    },
    resume,
    pending,
    // This screen is the one that takes what was left behind and what other apps share.
    intake: true,
    onSent: (_material, link) => {
      if (link.add && link.completes && router.canGoBack()) {
        // A page added to a sheet: back to that sheet, with a word that it is on its way
        // there (p2-J-06). Its questions join the sheet once read.
        void queryClient.invalidateQueries({ queryKey: keys.material(link.completes) });
        // The word is for the sheet she goes back to, so it holds across the back() (issue #91).
        toast.show(t('capture:again.added'), 'info', { survivesNavigation: true });
        router.back();
      } else if (fromTalk && router.canGoBack()) {
        // Shown to Buddy while talking: back to talk mode, which says it is being read.
        router.back();
      } else {
        // Back to Buddy's home, which now shows the reading (opens it if it isn't in the stack).
        router.dismissTo('/buddy');
      }
    },
  });
  const { link, photos, problems, pdfs, preparing, progress, failure, refused } = a;
  const { cameraBlocked, leftover, loaded, review, busy, room, dropping } = a;
  const homework = link.purpose === 'homework';
  const completes = link.completes;
  const missingPages = link.pages;

  // Came from the + menu: open that picker once, as if she had tapped it here (issue #82).
  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || !straightTo || opened.current || leftover) return;
    opened.current = true;
    if (straightTo === 'files') void a.pickFiles();
    else void a.pick(straightTo);
  }, [loaded, straightTo, leftover, a]);

  return (
    <Screen back>
      <ScrollView
        contentContainerStyle={{
          padding: SPACE.lg,
          paddingBottom: SPACE.xl,
          gap: RHYTHM.sections,
        }}
      >
        <View style={{ gap: SPACE.sm, paddingHorizontal: SPACE.xs }}>
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
            <Text style={[TYPE.body, { color: palette.ink2 }]}>
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
              onRemove={a.remove}
              onRetake={a.retake}
            />
          </Section>
        ) : null}

        {review ? (
          <PhotoCheckCard
            index={photos.indexOf(review) + 1}
            problems={problems[review] ?? []}
            disabled={busy}
            onRetake={() => a.retake(review)}
            onKeep={() => a.keep(review)}
          />
        ) : null}

        {preparing ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: RHYTHM.parts,
            }}
          >
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={[TYPE.body, { flex: 1 }]}>
              {t('capture:preparing', { current: preparing.current, count: preparing.total })}
            </Text>
          </View>
        ) : null}

        {cameraBlocked ? (
          <View accessibilityLiveRegion="polite">
            <Card tone="butter" padding={SPACE.lg}>
              <View style={{ gap: SPACE.md }}>
                <Text style={TYPE.body}>{t('capture:permission.camera')}</Text>
                <Btn size="sm" variant="outline" pill onPress={() => void Linking.openSettings()}>
                  {t('capture:permission.open_settings')}
                </Btn>
              </View>
            </Card>
          </View>
        ) : null}

        {leftover && photos.length === 0 ? (
          <Card tone="butter" padding={SPACE.lg}>
            <View style={{ gap: RHYTHM.parts }}>
              <Text accessibilityRole="header" style={TYPE.title}>
                {t('capture:draft.title')}
              </Text>
              <Text style={TYPE.body}>
                {t('capture:draft.body', { count: leftover.photos.length })}
              </Text>
              <Btn pill full onPress={a.continueLeftover}>
                {t('capture:draft.resume')}
              </Btn>
              <Btn pill full variant="ghost" onPress={() => void a.discardLeftover()}>
                {t('capture:draft.discard')}
              </Btn>
            </View>
          </Card>
        ) : review ? null : room > 0 ? (
          // First the camera is the one main action; once there are photos, sending is.
          <Card padding={SPACE.lg}>
            <View style={{ gap: RHYTHM.parts }}>
              {photos.length === 0 ? (
                <IconDisc
                  name="camera"
                  size={HINT_DISC}
                  iconSize={HINT_ICON}
                  tone="lavender"
                  style={{ alignSelf: 'center', marginBottom: SPACE.sm }}
                />
              ) : null}
              <Btn
                size="lg"
                variant={photos.length === 0 ? 'primary' : 'soft'}
                pill
                full
                icon="camera"
                disabled={busy}
                onPress={() => void a.pick('camera')}
              >
                {photos.length === 0 ? t('capture:camera') : t('capture:camera_more')}
              </Btn>
              {/* One row, two quiet choices: a photo from the gallery, or a file (PDF too). */}
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <View style={{ flex: 1 }}>
                  <Btn
                    variant="ghost"
                    pill
                    full
                    disabled={busy}
                    onPress={() => void a.pick('library')}
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
                    onPress={() => void a.pickFiles()}
                    accessibilityLabel={t('capture:files.pick_label')}
                  >
                    {t('capture:files.pick')}
                  </Btn>
                </View>
              </View>
            </View>
          </Card>
        ) : (
          <Text style={[TYPE.body, { color: palette.ink2, textAlign: 'center' }]}>
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
        onSend={() => void a.send()}
      />

      {dropping ? (
        // The browser: files dragged over the page. A hint only; the drop works anywhere.
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: SPACE.md,
            left: SPACE.md,
            right: SPACE.md,
            bottom: SPACE.md,
            borderRadius: 28, // token-exempt: the drop frame, a step rounder than a card
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: palette.primary,
            backgroundColor: palette.veil,
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.md,
            padding: SPACE.xl,
          }}
        >
          <IconDisc name="file" size={HINT_DISC} iconSize={HINT_ICON} tone="lavender" />
          <Text style={[TYPE.title, { textAlign: 'center', maxWidth: 260 }]}>
            {t('capture:files.drop')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
