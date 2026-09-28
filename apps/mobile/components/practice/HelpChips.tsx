// "Tipp", "Lösung zeigen", "Später": help that belongs to the question, not to the
// answer field. They sit at the end of the conversation (issue #16) – the pinned bar
// under them keeps the one action she is here for ("Prüfen"), so on a small phone with
// the keyboard open the question itself still has room.

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { Rise } from '../lb/Motion.js';

type Props = {
  /** Ask for the next prepared hint. */
  onHint?: (() => void) | undefined;
  /** Show the solution, skip a test question or set a homework task aside. */
  onReveal?: (() => void) | undefined;
  /** What that second chip says, when it isn't "Lösung zeigen". */
  revealLabel?: string | undefined;
  revealHint?: string | undefined;
  disabled?: boolean;
};

/** The help chips under the conversation; nothing at all when there is no help to offer. */
export function HelpChips({ onHint, onReveal, revealLabel, revealHint, disabled }: Props) {
  const { t } = useTranslation('practice');
  if (!onHint && !onReveal) return null;

  return (
    <Rise delay={120}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs }}>
        {onHint ? (
          <Btn
            variant="ghost"
            size="sm"
            pill
            onPress={onHint}
            disabled={disabled ?? false}
            accessibilityLabel={t('hint_label')}
          >
            {t('hint')}
          </Btn>
        ) : null}
        {onReveal ? (
          <Btn
            variant="ghost"
            size="sm"
            pill
            onPress={onReveal}
            disabled={disabled ?? false}
            {...(revealHint ? { accessibilityHint: revealHint } : {})}
          >
            {revealLabel ?? t('show_solution')}
          </Btn>
        ) : null}
      </View>
    </Rise>
  );
}
