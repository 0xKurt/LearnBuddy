// Buddy's reply with its little Markdown: paragraphs, bulleted and numbered
// lists, line breaks; **bold**, *italic* and $…$ math inside (InlineText draws
// them). Blocks come from lib/buddy/markdown.ts — nothing else is interpreted,
// no HTML, no links. Silent for screen readers: the bubble around it speaks
// the whole reply (markdownPlain).

import { useMemo } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { markdownBlocks } from '../../lib/buddy/markdown.js';
import { InlineText } from '../lb/InlineText.js';
import { SPACE } from '../../lib/theme/space.js';

export function RichText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const blocks = useMemo(() => markdownBlocks(text), [text]);
  if (blocks.length === 1 && blocks[0]?.type === 'para')
    return <InlineText text={blocks[0].text} accessible={false} style={style} />;
  return (
    <View accessible={false} style={{ gap: SPACE.sm, flexShrink: 1 }}>
      {blocks.map((b, i) =>
        b.type === 'para' ? (
          <InlineText key={i} text={b.text} accessible={false} style={style} />
        ) : (
          <View key={i} style={{ gap: SPACE.xs }}>
            {b.items.map((item, j) => (
              <View
                key={j}
                style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}
              >
                <Text
                  style={[
                    style,
                    b.ordered
                      ? { minWidth: 18, fontWeight: '600' }
                      : { width: 12, textAlign: 'center' },
                  ]}
                >
                  {item.marker}
                </Text>
                <View style={{ flex: 1, flexShrink: 1 }}>
                  <InlineText text={item.text} accessible={false} style={style} />
                </View>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
