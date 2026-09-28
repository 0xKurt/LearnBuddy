// Something Buddy tells at the end of the conversation, with the buttons to
// answer it — photos not sent yet, a page that could not be read. Said in the
// chat like everything else, so nothing on home is pushed around (UX §31–32).

import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
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
  const { t } = useTranslation('common');
  return (
    <View style={{ alignItems: 'flex-start', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}>
        <BuddyOrb size={26} />
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={[text, detail].filter(Boolean).join(' ')}
          style={[
            {
              flexShrink: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: LB.paper,
              borderRadius: 22,
              borderBottomLeftRadius: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
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
                style={{ width: 32, height: 42, borderRadius: 6 }}
                contentFit="cover"
              />
            </ZoomablePhoto>
          ) : null}
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={[TYPE.body, { color: LB.ink }]}>{text}</Text>
            {detail ? <Text style={TYPE.small}>{detail}</Text> : null}
          </View>
        </View>
      </View>
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 34 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
