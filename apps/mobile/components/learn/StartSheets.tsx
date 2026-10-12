// The sheets the learning domain's ways to start open from the ⋯ menu (issue #174): homework or
// vocabulary — by photo or typed — and the topic sheet. The menu and which sheet is up are the
// core's (components/buddy/StartSheets.tsx, issue #107); a sheet is named "homework", "vocab" or
// "topic:<kind>". Each way closes the sheet it came from first: two modals in one frame do not
// come up on iOS.

import { StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { askAttach } from '../../lib/capture/attachRequest.js';
import type { StartMenu } from '../buddy/extensions.js';
import { useSheetHandoff } from '../navigation/useSheetHandoff.js';
import { ChoiceSheet } from './ChoiceSheet.js';
import { TopicSheet } from './TopicSheet.js';
import type { TopicKind } from './useStartTopic.js';

const TOPIC = 'topic:';

/** The name of the topic sheet for this kind. */
export function topicSheet(kind: TopicKind): string {
  return `${TOPIC}${kind}`;
}

/** The kind a topic sheet's name stands for; null for any other sheet. */
function topicOf(sheet: string | null): TopicKind | null {
  if (!sheet?.startsWith(TOPIC)) return null;
  const kind = StartTopicRequest.shape.kind.safeParse(sheet.slice(TOPIC.length));
  return kind.success ? kind.data : null;
}

export const LearnStartSheets: StartMenu['Sheets'] = ({ open, onOpen, active = true, onBack }) => {
  const { t } = useTranslation(['buddy', 'learn']);
  const handoff = useSheetHandoff({
    enabled: active,
    visible: open === 'homework' || open === 'vocab',
    onClose: () => onOpen(null),
  });
  const choice = open === 'homework' || open === 'vocab' ? open : null;

  return (
    <>
      <ChoiceSheet
        visible={choice !== null}
        title={t(choice === 'vocab' ? 'learn:vocab.title' : 'learn:homework.title')}
        body={t(choice === 'vocab' ? 'learn:vocab.body' : 'learn:homework.body')}
        onClose={() => {
          if (onBack) handoff.begin(onBack);
          else {
            handoff.cancel();
            onOpen(null);
          }
        }}
        onClosed={handoff.closed}
        choices={
          choice === 'vocab'
            ? [
                {
                  label: t('learn:vocab.photo'),
                  icon: 'camera',
                  tone: 'sky',
                  // The camera at once; the page lands in the chat's bar (issue #519).
                  onPress: () => handoff.begin(() => askAttach({ open: 'camera' })),
                },
                {
                  label: t('learn:vocab.type'),
                  icon: 'keyboard',
                  tone: 'lavender',
                  onPress: () => handoff.begin(() => onOpen(topicSheet('vocab'))),
                },
              ]
            : [
                {
                  label: t('learn:homework.photo'),
                  icon: 'camera',
                  tone: 'sky',
                  onPress: () =>
                    handoff.begin(() =>
                      askAttach({ open: 'camera', link: { purpose: 'homework' } }),
                    ),
                },
                {
                  label: t('learn:homework.type'),
                  icon: 'keyboard',
                  tone: 'lavender',
                  onPress: () => handoff.begin(() => onOpen(topicSheet('help'))),
                },
              ]
        }
      />
      <TopicSheet kind={topicOf(open)} onClose={() => onOpen(null)} onBack={onBack} />
    </>
  );
};
