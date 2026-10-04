// The result of a finished run (docs/architecture.md §Practice): what she did, in words, and the
// one way on — more of what did not sit (or of what did), its words as cards where the run was all
// vocabulary (issue #147), and back to Buddy. A run never ends in a dead end (issue #47).

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { Appear } from '../lb/Motion.js';
import { Screen } from '../lb/Screen.js';
import { AgainButton } from './AgainButton.js';
import { BottomBar } from '../lb/BottomBar.js';
import { SessionSummary } from './SessionSummary.js';

type Props = {
  session: SessionView;
  /** The run's result (only a finished run has one). */
  summary: NonNullable<SessionView['summary']>;
  title: string;
  /** She was there when it ended: the result arrives with a little celebration. */
  celebrate: boolean;
  busy: boolean;
  onCards: () => void;
  onBack: () => void;
};

export function RunResult({ session, summary, title, celebrate, busy, onCards, onBack }: Props) {
  const { t } = useTranslation(['practice', 'common']);
  // What more practice would be about: what did not sit, else what did, else the
  // topics of the questions she just worked on.
  const againTopics =
    summary.shaky_topics.length > 0
      ? summary.shaky_topics
      : summary.secure_topics.length > 0
        ? summary.secure_topics
        : [
            ...new Set(
              session.items
                .map((i) => i.item.topic?.trim())
                .filter((t): t is string => t !== undefined && t.length > 0),
            ),
          ];
  return (
    <Screen title={title}>
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SPACE.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <SessionSummary
          celebrate={celebrate}
          summary={summary}
          mode={session.mode}
          review={session.mode === 'test' ? session.items : null}
          // The time ran out (issue #241): how far she got, open questions not answered.
          ranOut={session.timer?.ran_out === true}
        />
      </ScrollView>
      <BottomBar>
        <Appear delay={celebrate ? 900 : 0} style={{ gap: SPACE.sm }}>
          {/* Weiterüben ist immer einen Tipp entfernt (issue #47): das Wacklige zuerst,
              sonst mehr vom Sitzenden — und wenn die Zusammenfassung keine Themen kennt,
              die der Fragen selbst. Eine Übung endet nie in einer Sackgasse. */}
          {/* Lernkarten statt tippen (issue #147): wo die Wiederholung ganz aus Vokabeln
              besteht, geht sie als Karten durch — nicht NEBEN „nochmal üben", sondern an
              seiner Stelle. Zwei Wege zum selben Ziel wären genau die Wahl, die die App
              ihr abnehmen soll (Regel 16), und für zwanzig Wörter auf dem Handy ist
              Tippen das, worüber der Owner sich beschwert hat. Der Server entscheidet,
              wann das gilt (practice/cards.ts offersCardPass). */}
          {session.card_pass_offered ? (
            <Btn
              size="lg"
              variant="soft"
              pill
              icon="practice"
              full
              busy={busy}
              onPress={onCards}
              accessibilityHint={t('practice:cards.offer_hint')}
            >
              {t('practice:cards.offer')}
            </Btn>
          ) : session.mode !== 'help' && againTopics.length > 0 ? (
            <AgainButton
              {...(summary.shaky_topics.length > 0 ? {} : { kind: 'harder' as const })}
              title={session.title}
              topics={againTopics}
              sessionId={session.id}
            />
          ) : null}
          <Btn size="lg" pill full onPress={onBack}>
            {t('practice:back_to_buddy')}
          </Btn>
        </Appear>
      </BottomBar>
    </Screen>
  );
}
