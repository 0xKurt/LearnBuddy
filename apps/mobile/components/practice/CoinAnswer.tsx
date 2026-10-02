// The coins she lays (issue #254: „Leg 3,45 €" — Münzen antippen). Two rows of the same
// pieces: the purse below, what she has laid above. A tap on a piece in the purse lays it, a tap
// on a laid one takes it back ("rückgängig statt bestätigen", docs/UX-PRINCIPLES.md).
//
// No running sum is shown: adding the pieces up IS the exercise. The server compares the SUM of
// what she laid with the amount (`practice/visual.ts`), so every right way to lay it is right.
//
// The pieces are drawn with the same `Piece` as the money above a counting question, so a 2-€
// coin looks the same wherever she meets it. Each is a button with its name; the smallest coins
// are smaller than 44 pt as drawings, so their button is 44 pt around them.

import { renderCoins, type Denomination } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Svg from 'react-native-svg';

import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Piece, pieceSize, pieceText } from '../math/VisualFigures.js';

/** More pieces than this is not laying an amount any more, it is emptying the purse. */
export const LAID_MAX = 20;

/** The pieces in the answer text ("200 100 20"), or an empty list. */
export function laidOf(text: string): number[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((x) => /^\d+$/.test(x))
    .map(Number);
}

/** What the thread shows while the server reads it: "2 € + 1 € + 20 ct". */
export function laidWords(pieces: readonly number[]): string {
  return [...pieces]
    .sort((a, b) => b - a)
    .map(pieceText)
    .join(' + ');
}

function PieceButton({
  cents,
  label,
  disabled,
  onPress,
  scale = 1,
}: {
  cents: number;
  label: string;
  disabled: boolean;
  onPress: () => void;
  scale?: number;
}) {
  const { palette } = useTheme();
  const { w, h } = pieceSize(cents);
  return (
    // A piece is part of the picture she builds, not a CTA — the CTA is "Prüfen" (rule 13); its
    // pressed tint sits on the inner View.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ minWidth: TOUCH, minHeight: TOUCH }}
    >
      {({ pressed }) => (
        <View
          style={{
            minWidth: TOUCH,
            minHeight: TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            backgroundColor: pressed ? palette.lavender : 'transparent',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`}>
            <Piece cents={cents} />
          </Svg>
        </View>
      )}
    </Pressable>
  );
}

type Props = {
  offer: readonly Denomination[];
  /** What she has laid ("200 100 20"), or ''. */
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
};

export function CoinAnswer({ offer, value, disabled, onChange }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const laid = laidOf(value).sort((a, b) => b - a);
  const full = laid.length >= LAID_MAX;
  return (
    <View style={{ gap: SPACE.sm }}>
      <View
        accessibilityLabel={t('coins.table')}
        style={{
          // Two rows of coins without growing: the screen does not jump while she lays.
          minHeight: 112,
          alignContent: 'center',
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: laid.length === 0 ? 'dashed' : 'solid',
          borderColor: palette.hairline,
          backgroundColor: palette.canvas,
          padding: SPACE.xs,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {laid.length === 0 ? (
          <Text style={[TYPE.small, { color: palette.ink2, textAlign: 'center' }]}>
            {t('coins.empty')}
          </Text>
        ) : (
          laid.map((cents, i) => (
            <PieceButton
              key={`${i}:${cents}`}
              cents={cents}
              scale={0.78}
              disabled={disabled}
              label={t('coins.take_back', { piece: pieceText(cents) })}
              onPress={() => {
                const rest = [...laid];
                rest.splice(i, 1);
                onChange(rest.length > 0 ? renderCoins(rest) : '');
              }}
            />
          ))
        )}
      </View>
      <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('coins.how')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          columnGap: SPACE.xs,
        }}
      >
        {offer.map((cents) => (
          <PieceButton
            key={cents}
            cents={cents}
            disabled={disabled || full}
            // The purse a little smaller than the drawing: all eight coins in two rows.
            scale={0.87}
            label={t('coins.lay', { piece: pieceText(cents) })}
            onPress={() => onChange(renderCoins([...laid, cents]))}
          />
        ))}
      </View>
    </View>
  );
}
