// One question of a material: its text with math set properly (a part of a task with its letter
// and, above the first, its material), its figure and choices, how it went the last time (in
// words, never only a colour) and ⋯ for what can be done with it — never a button of its own in
// the card (implementation/MIGRATION.md §5). The solution is never part of this view
// (docs/architecture.md §Material).

import type { ItemResult, MaterialItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { UI } from '../../lib/theme/components.js';
import { MATERIAL_DETAIL } from '../../lib/theme/materialDetail.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { IconBtn } from '../lb/IconBtn.js';
import { MathText } from '../math/MathText.js';
import { lettered } from '../practice/PartStem.js';
import { QuestionFigure } from '../practice/QuestionFigure.js';

const RESULT_TONE: Record<ItemResult, 'success' | 'primary' | 'gray'> = {
  first_try: 'success',
  with_help: 'primary',
  not_known: 'gray',
  never_asked: 'gray',
};

type Props = {
  item: MaterialItemView;
  /** 1-based, as listed. */
  number: number;
  disabled: boolean;
  /** Opens what can be done with this question. */
  onMenu: () => void;
};

export function MaterialItemCard({ item, number, disabled, onMenu }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('library');
  const choices = item.kind === 'multiple_choice' && item.choices ? item.choices : null;
  const part = item.task_part;
  return (
    <Card>
      <View style={{ gap: RHYTHM.stack }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
          <View
            style={{
              flex: 1,
              minHeight: MATERIAL_DETAIL.menu.row,
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <Text style={TYPE.label}>{t('items.question_label', { number })}</Text>
            {item.topic ? <Chip>{item.topic}</Chip> : null}
            <Chip tone={RESULT_TONE[item.result]}>{t(`items.result.${item.result}`)}</Chip>
          </View>
          {/* A full touch target whose sign sits on the card's edge line, level with the label. */}
          <View
            style={{
              margin: MATERIAL_DETAIL.menu.margin,
              marginRight: MATERIAL_DETAIL.menu.marginRight,
            }}
          >
            <IconBtn
              tone="plain"
              icon="more"
              disabled={disabled}
              onPress={onMenu}
              accessibilityLabel={t('items.more_label', { number })}
            />
          </View>
        </View>
        {/* A task in parts (#297): its material once, above its first part, as the sheet prints
            it — and every part with its letter. */}
        {part && part.part === part.letters[0] ? (
          <MathText text={part.stem} inlineFractions style={[TYPE.body, { color: palette.ink2 }]} />
        ) : null}
        <MathText text={lettered(item.prompt, part)} style={TYPE.body} />
        {item.figure ? <QuestionFigure figure={item.figure} /> : null}
        {choices ? (
          <View style={{ gap: UI.field.labelGap }}>
            <Text style={TYPE.label}>{t('items.choices')}</Text>
            {choices.map((choice, index) => (
              <View
                key={index}
                style={{ flexDirection: 'row', gap: RHYTHM.parts, alignItems: 'flex-start' }}
              >
                <View
                  style={{
                    // min sizes: large system text grows the letter's circle instead of
                    // clipping it in a fixed box (audit M-84, issue #73).
                    minWidth: MATERIAL_DETAIL.choiceBadge,
                    minHeight: MATERIAL_DETAIL.choiceBadge,
                    borderRadius: RADIUS.round,
                    backgroundColor: palette.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[TYPE.label, { color: palette.primaryDk }]}
                  >
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <MathText text={choice} style={TYPE.meta} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
