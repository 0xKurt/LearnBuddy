// What stands above the chat's input bar while pages go with her message (issues #82, #519): the
// pages as small squares — after a photo from the camera with "Noch ein Foto" at their end, so a
// sheet of several pages is taken one after another without a screen of its own — a page that is
// hard to read, how the sending goes, and what stands in the way (no camera allowed, a failed
// send). In the browser a sheet can be dropped onto the chat; while it hovers, a line says so.
// The logic is lib/capture/useAttachments.ts; this only draws it.

import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { pageHandler, type SendProgress } from '../../lib/capture/pages.js';
import type { useAttachments } from '../../lib/capture/useAttachments.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { Progress } from '../lb/Progress.js';
import { AttachStrip } from './AttachStrip.js';

/** How far the sending is, 0…1, for the bar under its words. */
function share(p: SendProgress): number {
  if (p.step === 'reserving') return 0;
  if (p.step === 'uploading') return (p.current - 1) / p.total;
  return 1;
}

export function ComposerPages({
  pages,
  onMore,
}: {
  pages: ReturnType<typeof useAttachments>;
  /** "Noch ein Foto": the camera again, after a photo from the camera; null: not offered. */
  onMore: (() => void) | null;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('capture');
  const { review, progress } = pages;
  // The card for a photo the check found hard to read is the checking domain's (issue #107).
  const Review = pageHandler.get()?.check.Review;
  const note = (text: string) => (
    <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
      {text}
    </Text>
  );
  return (
    <>
      {pages.dropping ? note(t('files.drop')) : null}
      {pages.preparing
        ? note(t('preparing', { current: pages.preparing.current, count: pages.preparing.total }))
        : null}
      <AttachStrip
        uris={pages.photos}
        pdfs={pages.pdfs}
        flagged={new Set(pages.photos.filter((uri) => (pages.problems[uri]?.length ?? 0) > 0))}
        disabled={pages.busy}
        onRemove={pages.remove}
        onMore={pages.room > 0 ? onMore : null}
      />
      {review && Review ? (
        <Review
          index={pages.photos.indexOf(review) + 1}
          problems={pages.problems[review] ?? []}
          disabled={pages.busy}
          onRetake={() => pages.retake(review)}
          onKeep={() => pages.keep(review)}
        />
      ) : null}
      {pages.cameraBlocked ? (
        <View accessibilityLiveRegion="polite" style={{ gap: SPACE.xs }}>
          {note(t('permission.camera'))}
          <View style={{ flexDirection: 'row' }}>
            <Btn size="sm" variant="outline" pill onPress={() => void Linking.openSettings()}>
              {t('permission.open_settings')}
            </Btn>
          </View>
        </View>
      ) : null}
      {progress ? (
        <View accessibilityLiveRegion="polite" style={{ gap: SPACE.xs }}>
          <Text style={[TYPE.small, { color: palette.ink2 }]}>
            {progress.step === 'reserving'
              ? t('progress.reserving')
              : progress.step === 'uploading'
                ? t('progress.uploading', { current: progress.current, count: progress.total })
                : t('progress.submitting')}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <Progress value={share(progress)} />
          </View>
        </View>
      ) : pages.failure ? (
        <ErrorNote text={pages.failure} />
      ) : null}
    </>
  );
}
