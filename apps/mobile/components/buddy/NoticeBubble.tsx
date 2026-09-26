// Something Buddy tells at the end of the conversation, with the buttons to
// answer it — photos not sent yet, a page that could not be read. Said in the
// chat like everything else, so nothing on home is pushed around (UX §31–32).

import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';

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
              backgroundColor: '#fff',
              borderRadius: 22,
              borderBottomLeftRadius: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
            },
            SHADOW.soft,
          ]}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              accessible={false}
              style={{ width: 32, height: 42, borderRadius: 6 }}
              contentFit="cover"
            />
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
