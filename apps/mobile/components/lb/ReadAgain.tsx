// "Nochmal vorlesen" without a button (issue #434): while Vorlesen is on, a tap on the question
// itself — the question card's prompt, a Kopfrechnen task, a card's front — reads it again. No new
// control on screen (owner on #386: no new icons, no new ways); off, the question is plain text.
//
// For a screen reader the target is "Nochmal vorlesen", as the issue asks: it exists only while
// Vorlesen is on, when Buddy reads the question itself (a hint would be lost on the web, which has
// no attribute for it). A raw Pressable belongs here, in components/lb (CLAUDE.md rule 13);
// nothing paints on it.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { readsAloud, useVoiceMode } from '../../lib/speech/voiceMode.js';

type Props = {
  /** Reads the question again; without it (it must not be heard) the text is never a target. */
  onRead?: () => void;
  /** The question. */
  children: ReactNode;
};

export function ReadAgain({ onRead, children }: Props) {
  const { t } = useTranslation('common');
  const on = useVoiceMode(readsAloud);
  if (!on || !onRead) return <>{children}</>;
  return (
    <Pressable
      onPress={onRead}
      accessibilityRole="button"
      accessibilityLabel={t('voice.read_again')}
      testID="read-again"
    >
      {children}
    </Pressable>
  );
}
