// The tile an answer is tapped on (issue #310): white paper with the tile's corners and a soft
// shadow, around the button that answers. Before this the multiple-choice options built the card
// by hand twice (text and pictures), each with its own idea of what a tried option looks like;
// now there is one, and a new form that answers by tapping a tile takes this one.
//
// The tile is the look, the `<Btn>` inside it is the action (a Btn clips what is inside it, so the
// shadow has to sit around it). A tried option — answered, and not it — steps back: it loses its
// shadow, and the text in it says so in words (never colour alone). A tile with a picture keeps
// its white ground then and gets a hairline instead: a drawing on grey looked like a box in a box
// (issue #231).

import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

type Props = {
  /** Answered already, and not it: the tile steps back. */
  tried?: boolean;
  /** It shows a picture: tried, it stays white and takes a hairline. */
  picture?: boolean;
  /** Where the tile stands in its row (a grid's share); never its look. */
  style?: StyleProp<ViewStyle>;
  /** The `<Btn>` that answers. */
  children: ReactNode;
};

export function AnswerTile({ tried = false, picture = false, style, children }: Props) {
  const { palette } = useTheme();
  const look: ViewStyle = tried
    ? picture
      ? { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.hairline }
      : { backgroundColor: palette.canvas }
    : { backgroundColor: palette.paper, ...SHADOW.soft };
  return <View style={[{ borderRadius: RADIUS.tile }, look, style]}>{children}</View>;
}
