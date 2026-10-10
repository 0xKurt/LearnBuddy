// One run of a model-written text, drawn (issue #107): its **bold** and *italic*, and the notation
// a domain draws — the learning domain's $…$ math (MathText), given once at app start
// (lib/learning/register.tsx). Without a domain the run is plain text, its markers gone
// (lib/buddy/markdown.ts withoutMarkers). Buddy's replies (RichText) and result lists use it.

import type { ComponentType } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { withoutMarkers } from '../../lib/buddy/markdown.js';
import { slot } from '../../lib/registry.js';

export type InlineTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Put the run into the accessibility tree as one element (default true). */
  accessible?: boolean;
};

/** How a domain draws a run with its notation. */
export const inlineNotation = slot<ComponentType<InlineTextProps>>('Notation zeichnen');

export function InlineText({ text, style, accessible = true }: InlineTextProps) {
  const Drawn = inlineNotation.get();
  if (Drawn) return <Drawn text={text} style={style} accessible={accessible} />;
  return (
    <Text style={style} accessible={accessible}>
      {withoutMarkers(text)}
    </Text>
  );
}
