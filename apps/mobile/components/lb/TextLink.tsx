// One quiet line of text that may open something (issue #311): no button look, the words are the
// target — the line under Buddy's head that says what she is working on (issue #160). Without
// `onPress` it is plain text for a screen reader, not a disabled button. A raw Pressable belongs
// here, in components/lb (CLAUDE.md rule 13); a press dims the words, nothing paints a surface.

import { Pressable, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  children: string;
  /** What a tap opens; without it the line is only text. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The words' look (type and colour from the theme). */
  style?: StyleProp<TextStyle>;
};

/** How far a pressed line dims. */
const PRESSED = 0.6;

export function TextLink({ children, onPress, accessibilityLabel, style }: Props) {
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? children}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Text numberOfLines={1} style={[style, { opacity: pressed ? PRESSED : 1 }]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
