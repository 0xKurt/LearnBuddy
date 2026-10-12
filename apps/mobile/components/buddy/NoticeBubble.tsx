// Something Buddy tells at the end of the conversation, with the buttons to
// answer it — photos not sent yet, a page that could not be read. Said in the
// chat like everything else, so nothing on home is pushed around (UX §31–32).

import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { CHAT } from '../../lib/theme/chat.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

type Props = {
  text: string;
  /** Small text under it (e.g. which page and why). */
  detail?: string | null;
  /** A photo, so she recognises the sheet. */
  thumb?: string | null;
  /** The answers: <Btn size="sm"> buttons. */
  children?: ReactNode;
};

export function NoticeBubble({ text, detail = null, thumb = null, children }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  return (
    // sm between the bubble and its buttons: the same air answer chips get under a
    // message (Conversation, issue #51).
    <View style={{ alignItems: 'flex-start', gap: SPACE.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: SPACE.sm,
          maxWidth: CHAT.buddyWidth,
          width: CHAT.buddyWidth,
        }}
      >
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={[text, detail].filter(Boolean).join(' ')}
          style={[
            {
              flex: 1,
              padding: CARD_PAD.base,
              borderRadius: RADIUS.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              backgroundColor: palette.paper,
            },
            SHADOW.soft,
          ]}
        >
          {thumb ? (
            <ZoomablePhoto uri={thumb}>
              <Image
                source={{ uri: thumb }}
                // The picture of her page is a thing on the screen, so it carries a name —
                // an <img> without one is invisible to a screen reader and axe says so
                // (image-alt, issue #73). expo-image maps this to `alt` on the web.
                accessible
                accessibilityLabel={t('common:zoom.photo')}
                // token-exempt: thumbnail of a page, its corner small like paper's
                style={{
                  width: CHAT.notice.thumbWidth,
                  height: CHAT.notice.thumbHeight,
                  borderRadius: RADIUS.sm,
                }}
                contentFit="cover"
              />
            </ZoomablePhoto>
          ) : null}
          {/* token-exempt: two points, the line heights carry the air between text and detail. */}
          <View style={{ flexShrink: 1, gap: CHAT.titleGap }}>
            <Text style={[TYPE.body, { color: palette.ink }]}>{text}</Text>
            {detail ? <Text style={TYPE.meta}>{detail}</Text> : null}
          </View>
        </View>
      </View>
      {children ? (
        // Flush with the bubble's left edge — like cards under a message.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>{children}</View>
      ) : null}
    </View>
  );
}
