// A question's drawing as every card shows it (issue #310, step 5): framed, tappable to open it
// large (`ZoomableFigure`), and — where the drawing can be heard — its play control beside it.
// One component for the practice card and the library's list of a material's questions, so a
// note line has its "Anhören" wherever it stands, and the walkthrough finds the drawing by the
// same name (`question-figure`).
//
// The play control stands NEXT TO the drawing, never under it (issue #275): a row under it cost
// exactly the height a question with four long answers lacked on 360×740, and a short note line
// leaves room in the width anyway. The same soft pill with the speaker as every "Anhören".

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';

import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { ZoomableFigure } from '../math/ZoomableFigure.js';
import { ListenButton } from './ListenButton.js';

type Props = {
  figure: Figure;
  /** The tallest the drawing may stand (`visualCaps`); none: its natural height. */
  maxHeight?: number;
  /** While she types: one line that opens the drawing large (`ZoomableFigure`, issue #379). */
  folded?: boolean;
};

export function QuestionFigure({ figure, maxHeight, folded = false }: Props) {
  const drawing = (
    // The tight box around the drawing itself: the walkthrough records its height.
    <View testID="question-figure" style={figure.type === 'staff' ? { flex: 1 } : null}>
      <ZoomableFigure figure={figure} maxHeight={maxHeight} folded={folded} />
    </View>
  );
  if (figure.type !== 'staff') return drawing;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      {drawing}
      <View style={{ width: TOUCH + SPACE.sm }}>
        <ListenButton source={{ tones: { bars: figure.bars, tempo: figure.tempo } }} speakerOnly />
      </View>
    </View>
  );
}
