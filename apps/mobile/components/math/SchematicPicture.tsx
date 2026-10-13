// A labelled picture that is a real image (issue #599; design `components/figures/Drawn.jsx ›
// Schematic`): the image of the picture library below — unchanged, in its own colours, on a light
// paper card in every look —, and over it with react-native-svg the numbers of the parts asked
// for, each joined to its part by a leader line that ends in a dot. The number that is asked
// ("Wie heißt Teil 3?") is filled in the accent. Nothing here decides anything: which parts carry
// numbers is the question's (`n`), where they stand is the anchor data the server checked the
// question with (`schematicAnchors.data.ts`, `pictureLayout`). The image and the anchors come
// with the first picture (`useSchematicPictures`); until they and the names are there the picture
// keeps its room and draws nothing.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { Image } from 'expo-image';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import type { SchematicImageId } from '../../../../packages/shared-math/src/schematics.js';
import { pictureLayout } from '../../lib/math/schematicLayout.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { useSchematicPictures } from '../../lib/math/useSchematicPictures.js';
import { FIGURE_PICTURE } from '../../lib/theme/figurePicture.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY } from './figureText.js';

type PictureFigure = Extract<Figure, { type: 'schematic' }> & { d: SchematicImageId };

const { radius, leader, badge } = FIGURE_PICTURE;

export function SchematicPicture({ figure, width }: { figure: PictureFigure; width: number }) {
  const { palette } = useTheme();
  // The picture's own colours, the same in every look: light paper, its ink, the accent on it.
  const { figurePaper: paper, figureInk: ink, figureAccent, onFigureAccent } = palette;
  const pictures = useSchematicPictures()?.SCHEMATIC_PICTURES;
  const names = useFigureNames(figure);
  const loaded = pictures && names ? { anchors: pictures.anchors[figure.d], names } : null;
  const { k, height, badges } = pictureLayout(figure, width, loaded);
  return (
    <View
      testID="schematic-picture"
      style={{ width, height, backgroundColor: paper, borderRadius: radius, overflow: 'hidden' }}
    >
      {loaded && pictures ? (
        <>
          <Image
            source={pictures.images[figure.d]}
            // The frame says what it shows (`describeSchematic`); the image adds no second voice:
            // decorative, also as the browser's <img> (expo-image writes this label as its `alt`;
            // a missing one is read by the file's name, axe `image-alt`).
            accessible={false}
            accessibilityLabel=""
            contentFit="contain"
            style={{ width, height }}
          />
          <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
            {badges.map(({ from, at }, i) => {
              const asked = i + 1 === figure.ask;
              const line = asked ? figureAccent : ink;
              // A number that stands on its part (a row picture's cell) needs no line to it.
              const apart =
                Math.abs(at[0] - from[0]) + Math.abs(at[1] - from[1]) > leader.least * k;
              return (
                <G key={i}>
                  {apart ? (
                    <Line
                      x1={from[0]}
                      y1={from[1]}
                      x2={at[0]}
                      y2={at[1]}
                      stroke={line}
                      strokeWidth={leader.width}
                    />
                  ) : null}
                  <Circle cx={from[0]} cy={from[1]} r={leader.dot * k} fill={ink} />
                  <Circle
                    cx={at[0]}
                    cy={at[1]}
                    r={badge.radius * k}
                    fill={asked ? figureAccent : paper}
                    stroke={line}
                    strokeWidth={badge.stroke}
                  />
                  <SvgText
                    x={at[0]}
                    y={at[1] + badge.baseline * k}
                    fontFamily={FAMILY}
                    fontSize={badge.fontSize * k}
                    fontWeight={badge.fontWeight}
                    fill={asked ? onFigureAccent : ink}
                    textAnchor="middle"
                  >
                    {String(i + 1)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </>
      ) : null}
    </View>
  );
}
