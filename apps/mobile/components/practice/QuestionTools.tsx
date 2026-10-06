// A small row of quiet tools under the question (never a second headline): hearing a foreign word,
// hearing a listening text (issue #210). Nothing at all when none applies. Hearing the question
// again is the conversation row's ("Nochmal vorlesen", `CheckBar`, issue #386), not a pill here. A Diktat carries its play control in its card (`DictationCard`, #242).

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { HearText } from './HearText.js';
import { ListenButton } from './ListenButton.js';

type Props = {
  item: ItemView;
  sessionId: string;
  /** A foreign vocabulary word: its own "Anhören" (its pronunciation is the point). */
  hearWord: boolean;
  heard: (ref: string | undefined) => boolean;
  markHeard: (ref: string | undefined) => void;
  disabled: boolean;
};

export function QuestionTools({ item, sessionId, hearWord, heard, markHeard, disabled }: Props) {
  const tools = [
    hearWord && item.read_aloud && item.prompt_lang ? (
      <ListenButton key={`listen-${item.id}`} text={item.prompt} lang={item.prompt_lang} />
    ) : null,
    // Hörverstehen (issue #210): the text is heard, not read, so the way to hear it stands in
    // the same row as every other "read this aloud" — and it stays after the question closes,
    // next to the words of it, because listening again while reading is how it is reviewed.
    item.listen && item.kind !== 'spelling_dictation' ? (
      <HearText
        key="hear"
        sessionId={sessionId}
        itemId={item.id}
        heard={heard(item.listen.ref)}
        onHeard={() => markHeard(item.listen?.ref)}
        disabled={disabled}
      />
    ) : null,
  ].filter((node) => node !== null);
  if (tools.length === 0) return null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>{tools}</View>;
}
