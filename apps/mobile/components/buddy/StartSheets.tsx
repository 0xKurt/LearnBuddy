// The ⋯ menu on Buddy's home and the two sheets its ways to start can open (issue #174): homework
// or vocabulary — by photo or typed — and the topic sheet. Each way closes the sheet it came from
// first: two modals in one frame do not come up on iOS.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { ChoiceSheet } from '../learn/ChoiceSheet.js';
import { TopicSheet } from '../learn/TopicSheet.js';
import type { TopicKind } from '../learn/useStartTopic.js';
import { MenuSheet } from './MenuSheet.js';
import { startItems } from './startItems.js';

/** iOS can't present a sheet while another one is still sliding away. */
const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

type Props = {
  menuOpen: boolean;
  onCloseMenu: () => void;
  next: BuddyHome['next'];
  /** Says it to Buddy, as if she had written it. */
  send: (text: string) => void;
  /** Nothing new starts while Buddy is answering. */
  canStart: boolean;
};

export function StartSheets({ menuOpen, onCloseMenu, next, send, canStart }: Props) {
  const { t } = useTranslation(['buddy', 'learn']);
  const [topic, setTopic] = useState<TopicKind | null>(null);
  const [choice, setChoice] = useState<'homework' | 'vocab' | null>(null);

  /** From a choice sheet on: first let it close, then go on. */
  function fromChoice(go: () => void): void {
    setChoice(null);
    setTimeout(go, SHEET_SWAP_MS);
  }

  /** Same from the ⋯ menu: two of the ways to start open a sheet of their own (#174). */
  function fromMenu(go: () => void): void {
    onCloseMenu();
    setTimeout(go, SHEET_SWAP_MS);
  }

  return (
    <>
      <MenuSheet
        visible={menuOpen}
        // Each way to start closes the sheet first: two of them open a sheet of their
        // own, and two modals in one frame do not come up on iOS.
        start={startItems(next, t, { send, setChoice, setTopic }).map((i) => ({
          ...i,
          onPress: () => fromMenu(i.onPress),
        }))}
        canStart={canStart}
        onGo={(path) => fromMenu(() => router.push(path))}
        onClose={onCloseMenu}
      />
      <ChoiceSheet
        visible={choice !== null}
        title={t(choice === 'vocab' ? 'learn:vocab.title' : 'learn:homework.title')}
        body={t(choice === 'vocab' ? 'learn:vocab.body' : 'learn:homework.body')}
        onClose={() => setChoice(null)}
        choices={
          choice === 'vocab'
            ? [
                {
                  label: t('learn:vocab.photo'),
                  icon: 'camera',
                  onPress: () => fromChoice(() => router.push('/capture')),
                },
                {
                  label: t('learn:vocab.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('vocab')),
                },
              ]
            : [
                {
                  label: t('learn:homework.photo'),
                  icon: 'camera',
                  onPress: () =>
                    fromChoice(() =>
                      router.push({ pathname: '/capture', params: { purpose: 'homework' } }),
                    ),
                },
                {
                  label: t('learn:homework.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('help')),
                },
              ]
        }
      />
      <TopicSheet kind={topic} onClose={() => setTopic(null)} />
    </>
  );
}
