// "Tipp", "Schritt für Schritt", "Lösung zeigen", "Später": help that belongs to the question,
// not to the answer field. "Schritt für Schritt" (issue #298) is offered by the server after the
// second wrong try; while the guided example runs, its place is taken by the way out of it. They sit at the end of the conversation (issue #16) – the pinned bar
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
  /** "Zeig's mir Schritt für Schritt": a guided example of this question (issue #298). */
  onGuide?: (() => void) | undefined;
  /** "Ich mach selbst weiter": leave the guided example; the question is hers again. */
  onLeaveGuide?: (() => void) | undefined;
  /** Show the solution, skip a test question or set a homework task aside. */
  onReveal?: (() => void) | undefined;
  /** What that second chip says, when it isn't "Lösung zeigen". */
  revealLabel?: string | undefined;
  revealHint?: string | undefined;
  disabled?: boolean;
};

/** The help chips under the conversation; nothing at all when there is no help to offer. */
export function HelpChips({
  onHint,
  onGuide,
  onLeaveGuide,
  onReveal,
  revealLabel,
  revealHint,
  disabled,
}: Props) {
  const { t } = useTranslation('practice');
  if (!onHint && !onGuide && !onLeaveGuide && !onReveal) return null;

  return (
    <Rise delay={120}>
      {/* Buddy's offer to show it (issue #298) has its own row and the whole sentence: it is a
          suggestion of his, not one more tool, and three chips in one row wrapped raggedly on
          every phone (390 and 360 alike). Soft, not ghost: it is the one thing he proposes. */}
      {onGuide ? (
        <View style={{ flexDirection: 'row', marginBottom: SPACE.xs }}>
          <Btn
            variant="soft"
            size="sm"
            pill
            onPress={onGuide}
            disabled={disabled ?? false}
            accessibilityHint={t('guide.offer_hint')}
          >
            {t('guide.offer_label')}
          </Btn>
        </View>
      ) : null}
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
        {onLeaveGuide ? (
          <Btn
            variant="ghost"
            size="sm"
            pill
            onPress={onLeaveGuide}
            disabled={disabled ?? false}
            accessibilityHint={t('guide.leave_hint')}
          >
            {t('guide.leave')}
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
