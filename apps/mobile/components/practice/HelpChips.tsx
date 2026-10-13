// "Tipp", "Lösung zeigen", "Später": help that belongs to the question, not to the
// answer field. They sit at the end of the conversation (issue #16) – the pinned bar
// under them keeps the one action she is here for ("Prüfen"), so on a small phone with
// the keyboard open the question itself still has room.

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { Chip } from '../lb/Chip.js';
import { DURATION } from '../../lib/theme/motion.js';
import { Rise } from '../lb/Motion.js';

const CHIP_ROW = PRACTICE_SCREEN.chipRow;

type Props = {
  /** Ask for the next prepared hint. */
  onHint?: (() => void) | undefined;
  /**
   * "Tipp" stands out: she missed twice and took no hint yet (`hint_offered`, report #388 §5.5).
   * The one quiet offer — the same chip in the soft skin, nothing pushed, nothing said.
   */
  hintOffered?: boolean;
  /** Show the solution, skip a test question or set a homework task aside. */
  onReveal?: (() => void) | undefined;
  /** What that second chip says, when it isn't "Lösung zeigen". */
  revealLabel?: string | undefined;
  revealHint?: string | undefined;
  disabled?: boolean;
};

/** The help chips above the Composer; nothing at all when there is no help to offer. */
export function HelpChips({
  onHint,
  hintOffered = false,
  onReveal,
  revealLabel,
  revealHint,
  disabled,
}: Props) {
  const { t } = useTranslation('practice');
  if (!onHint && !onReveal) return null;

  return (
    <Rise delay={DURATION.quick}>
      <View testID="help-chips" style={[{ flexDirection: 'row', flexWrap: 'wrap' }, CHIP_ROW]}>
        {onHint && hintOffered ? (
          <Chip
            selected
            onPress={onHint}
            disabled={disabled ?? false}
            accessibilityLabel={t('hint_label')}
          >
            {t('hint')}
          </Chip>
        ) : onHint ? (
          <Chip onPress={onHint} disabled={disabled ?? false} accessibilityLabel={t('hint_label')}>
            {t('hint')}
          </Chip>
        ) : null}
        {onReveal ? (
          <Chip
            onPress={onReveal}
            disabled={disabled ?? false}
            {...(revealHint ? { accessibilityHint: revealHint } : {})}
          >
            {revealLabel ?? t('show_solution')}
          </Chip>
        ) : null}
      </View>
    </Rise>
  );
}
