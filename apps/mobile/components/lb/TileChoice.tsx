// One of a few, as word pills of the answer board that wrap (issue #599): the category a mark
// gets ("① Subjekt", "② Präpositionalobjekt"). A long term stays whole on a row of its own
// instead of breaking inside the word — what `Segmented`'s one track cannot give it. Each pill is
// a radio that says whether it is chosen; the chosen one carries the board's picked look, the
// same as an Option she selected.

import { View } from 'react-native';

import { WORD_ROW } from '../../lib/theme/board.js';
import { Tile } from './Tile.js';

export function TileChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={WORD_ROW}>
      {options.map((o) => (
        <Tile
          key={o.value}
          shape="word"
          dense
          state={o.value === value ? 'picked' : 'tile'}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        >
          {o.label}
        </Tile>
      ))}
    </View>
  );
}
