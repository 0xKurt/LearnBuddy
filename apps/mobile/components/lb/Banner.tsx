// What the system has to say in one line (design components/core/States.jsx `Banner`): 600 13/18
// on a soft tint. As a `bar` it is the design's banner under the head — offline, saving — from
// edge to edge, at least 36 high, its words in the middle. Without it, it is the same line as a
// note inside a sheet or beside a card, where an edge-to-edge bar cannot stand: rounded, as it was.

import { Text, View } from 'react-native';
import type { Palette } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { BANNER } from '../../lib/theme/states.js';
import { fontFace } from '../../lib/theme/type.js';

type Tone = 'gray' | 'warning' | 'info' | 'danger';

// Built from the palette the component is rendering with: a module-scope map froze the
// start palette (issue #84). `gray` is the design's "offline" (canvas, ink), `info` its "sync"
// (primary-lt, accent text); `warning` and `danger` are the app's own and stay as they were.
const tones = (p: Palette): Record<Tone, { bg: string; color: string }> => ({
  gray: { bg: p.canvas, color: p.ink },
  warning: { bg: p.butter, color: p.warningText },
  info: { bg: p.primaryLt, color: p.primaryDk },
  danger: { bg: p.blush, color: p.ink },
});

type Props = {
  children: string;
  tone?: Tone;
  /** The banner under the head: edge to edge, no corner, its words centred. */
  bar?: boolean;
};

export function Banner({ children, tone = 'gray', bar = false }: Props) {
  const { palette } = useTheme();
  const t = tones(palette)[tone];
  return (
    <View
      style={[
        { backgroundColor: t.bg, justifyContent: 'center' },
        bar
          ? {
              minHeight: BANNER.minHeight,
              paddingVertical: BANNER.padY,
              paddingHorizontal: BANNER.padX,
              alignItems: 'center',
            }
          : {
              paddingVertical: SPACE.md,
              paddingHorizontal: SPACE.lg,
              borderRadius: RADIUS.note,
            },
      ]}
    >
      <Text
        style={[
          fontFace('600'),
          BANNER.words,
          { color: t.color },
          bar ? { textAlign: 'center' } : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
