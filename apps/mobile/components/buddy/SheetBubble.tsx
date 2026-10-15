// Her sheet as her message in the thread (issue #632): on her side, the pages she sent, and one
// quiet line under them saying where they stand — on their way, being read, read, not read. The
// page is the design's (ui_kits/app/Capture.jsx `SheetThumb`: paper with lines, "in the app this is
// the real photo"): her photo from the phone's own copy while it keeps one (a day,
// docs/privacy.md), the paper with its lines otherwise. The line is a status, like the one under
// a message that did not arrive (`FailedLine`), never a second card.
//
// What the line says is the caller's: the upload's own progress while it goes up, the server's
// stage of the sheet once it is there (CLAUDE.md rule 5). This draws.

import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { SendingSheet } from '../../lib/capture/sending.js';

import { CHAT } from '../../lib/theme/chat.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BusyIndicator } from '../lb/BusyIndicator.js';
import { Icon } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

const PAGE = CHAT.sheet;

/** busy: something is happening to it · done: read · failed: not read · quiet: a plain fact. */
export type SheetLineTone = 'busy' | 'done' | 'failed' | 'quiet';

type Props = {
  /** Her photos on the phone, page by page; fewer than `pages` (or none) draw the paper. */
  uris: readonly string[];
  pages: number;
  /** What the pages are, for a screen reader ("Du hast 2 Fotos geschickt"). */
  label: string;
  line: { text: string; tone: SheetLineTone } | null;
};

export function SheetBubble({ uris, pages, label, line }: Props) {
  const shown = Math.min(pages, PAGE.shown);
  return (
    <View style={{ alignItems: 'flex-end', gap: SPACE.xs }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={line ? `${label}. ${line.text}` : label}
        style={{ flexDirection: 'row', gap: SPACE.sm }}
      >
        {Array.from({ length: shown }, (_, i) => (
          <SheetPage key={i} uri={uris[i] ?? null} />
        ))}
      </View>
      {line ? <SheetLine {...line} /> : null}
    </View>
  );
}

/**
 * The sheet she is sending right now, from the tap on "Senden" until her stored message is there:
 * the upload's own progress, in the words the field used to show it in.
 */
export function SendingSheetBubble({ sheet }: { sheet: SendingSheet }) {
  const { t } = useTranslation('capture');
  const p = sheet.progress;
  const text =
    p === null || p.step === 'submitting'
      ? t('progress.submitting')
      : p.step === 'reserving'
        ? t('progress.reserving')
        : t('progress.uploading', { current: Math.min(p.current + 1, p.total), count: p.total });
  return (
    <SheetBubble
      uris={sheet.uris}
      pages={sheet.pages}
      label={t('sent.label', { count: sheet.pages })}
      line={{ text, tone: 'busy' }}
    />
  );
}

/** One page: the shadow outside, the clipping inside (Android, components/buddy/AttachStrip.tsx). */
function SheetPage({ uri }: { uri: string | null }) {
  const { palette } = useTheme();
  const frame = { width: PAGE.width, height: PAGE.height, borderRadius: RADIUS.md };
  return (
    <View style={[frame, { backgroundColor: palette.paper }, SHADOW.soft]}>
      <View style={[frame, { overflow: 'hidden', backgroundColor: palette.paper }]}>
        {/* The paper with its lines lies under the photo: a photo that never paints, or one the
            phone no longer keeps, is still a page and never an empty box. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ paddingHorizontal: PAGE.padX, paddingVertical: PAGE.padY, gap: PAGE.ruleGap }}
        >
          {PAGE.rules.map((width, i) => (
            <View
              key={i}
              style={{
                width,
                height: PAGE.rule,
                borderRadius: PAGE.rule,
                backgroundColor: palette.hairlineStrong,
              }}
            />
          ))}
        </View>
        {uri ? (
          <View style={{ position: 'absolute', top: 0, left: 0 }}>
            <ZoomablePhoto uri={uri}>
              <Image
                source={{ uri }}
                style={{ width: PAGE.width, height: PAGE.height }}
                contentFit="cover"
              />
            </ZoomablePhoto>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SheetLine({ text, tone }: { text: string; tone: SheetLineTone }) {
  const { palette } = useTheme();
  const ink =
    tone === 'failed' ? palette.danger : tone === 'done' ? palette.successText : palette.ink2;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: CHAT.takeBack.gap }}
    >
      {tone === 'busy' ? <BusyIndicator size="small" color={palette.ink3} /> : null}
      {tone === 'done' ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="check" size={CHAT.takeBack.icon} color={ink} />
        </View>
      ) : null}
      <Text style={[TYPE.small, { color: ink, flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}
