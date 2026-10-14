// The judged sentence with every word tappable (issue #83), at normal text spacing (#625). A word
// is as wide as it is written, so "The weather is nice today." reads as a sentence; a word
// narrower than a finger gets its touch target from an area that reaches out past it
// (`touchReach`) and overlaps its neighbours'. Where areas overlap, the tap goes to the word
// nearest to where the finger came down (`nearestWord`), never to whichever area lies on top.
// Where the finger is comes from the one tap surface (`TapSurface`, #416).

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { nearestWord, touchReach, type WordBox } from '../../lib/practice/spokenWords.js';
import { TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { TapSurface } from '../lb/TapSurface.js';
import type { SpokenWord } from './WordSheet.js';

export function SpokenWordTargets({
  words,
  written,
  label,
  onWord,
}: {
  words: readonly SpokenWord[];
  /** The word as the sentence writes it, marked or plain. */
  written: (word: SpokenWord, i: number) => ReactNode;
  /** What a screen reader says for the word's button. */
  label: (word: SpokenWord) => string;
  onWord: (word: SpokenWord) => void;
}) {
  const [boxes, setBoxes] = useState<ReadonlyArray<WordBox | undefined>>([]);
  const place = (i: number) => (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setBoxes((prev) => {
      const next = [...prev];
      next[i] = { x, y, width, height };
      return next;
    });
  };
  // `at` is measured from the area's corner; without a finger (a reader, a key) it is the word.
  const tap = (i: number, at: { x: number; y: number } | null) => {
    const box = boxes[i];
    const reach = touchReach(box, TOUCH);
    const meant =
      box && at
        ? nearestWord({ x: box.x - reach.x + at.x, y: box.y - reach.y + at.y }, boxes, i)
        : i;
    const word = words[meant] ?? words[i];
    if (word !== undefined) onWord(word);
  };
  return (
    <View testID="spoken-word-actions" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((w, i) => {
        const reach = touchReach(boxes[i], TOUCH);
        return (
          <View key={`${i}-${w.text}`} onLayout={place(i)} style={{ maxWidth: '100%' }}>
            {/* The button over it says the word; the text is what she sees. */}
            <Text aria-hidden style={TYPE.question}>
              {written(w, i)}
              {i < words.length - 1 ? ' ' : ''}
            </Text>
            <TapSurface
              accessibilityRole="button"
              accessibilityLabel={label(w)}
              onTap={(at) => tap(i, at)}
              style={{
                position: 'absolute',
                left: -reach.x,
                right: -reach.x,
                top: -reach.y,
                bottom: -reach.y,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
