// The sheets the learning domain's ways to start open from the ⋯ menu (issue #174): homework or
// vocabulary — by photo or typed — and the topic sheet. The menu and which sheet is up are the
// core's (components/buddy/StartSheets.tsx, issue #107); a sheet is named "homework", "vocab" or
// "topic:<kind>". Each way closes the sheet it came from first: two modals in one frame do not
// come up on iOS.

import { StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { askAttach } from '../../lib/capture/attachRequest.js';
import type { StartMenu } from '../buddy/extensions.js';
import { SHEET_SWAP_MS } from '../buddy/StartSheets.js';
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

export const LearnStartSheets: StartMenu['Sheets'] = ({ open, onOpen }) => {
  const { t } = useTranslation(['buddy', 'learn']);
  const choice = open === 'homework' || open === 'vocab' ? open : null;

  /** From a choice sheet on: first let it close, then go on. */
  function fromChoice(go: () => void): void {
    onOpen(null);
    setTimeout(go, SHEET_SWAP_MS);
  }

  return (
    <>
      <ChoiceSheet
        visible={choice !== null}
        title={t(choice === 'vocab' ? 'learn:vocab.title' : 'learn:homework.title')}
        body={t(choice === 'vocab' ? 'learn:vocab.body' : 'learn:homework.body')}
        onClose={() => onOpen(null)}
        choices={
          choice === 'vocab'
            ? [
                {
                  label: t('learn:vocab.photo'),
                  icon: 'camera',
                  // The camera at once; the page lands in the chat's bar (issue #519).
                  onPress: () => fromChoice(() => askAttach({ open: 'camera' })),
                },
                {
                  label: t('learn:vocab.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => onOpen(topicSheet('vocab'))),
                },
              ]
            : [
                {
                  label: t('learn:homework.photo'),
                  icon: 'camera',
                  onPress: () =>
                    fromChoice(() => askAttach({ open: 'camera', link: { purpose: 'homework' } })),
                },
                {
                  label: t('learn:homework.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => onOpen(topicSheet('help'))),
                },
              ]
        }
      />
      <TopicSheet kind={topicOf(open)} onClose={() => onOpen(null)} />
    </>
  );
};
