// A long press on a message: a small sheet with "Kopieren" and, for Buddy's
// messages, "Vorlesen". Copied text is the message as she reads it (no
// Markdown stars, math as written); a toast says "Kopiert". Closable with its
// own button (CLAUDE.md rule 14). Screen readers reach the same through the
// bubble's actions (Conversation.tsx).

import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

import { markdownPlain } from '../../lib/buddy/markdown.js';
import { haptic } from '../../lib/haptics.js';
import { useSceneLanguage } from '../../lib/buddy/useSceneLanguage.js';
import { messageListen } from './extensions.js';
import { View } from 'react-native';
import { SPACE } from '../../lib/theme/space.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { useSay } from '../../lib/speech/say.js';
import { spokenText } from '../../lib/speech/spoken.js';

export type MenuMessage = { text: string; role: 'learner' | 'buddy' };

/** Copies a message; says so (or that it did not work). */
async function copyMessage(text: string, said: { copied: string; failed: string }): Promise<void> {
  try {
    await Clipboard.setStringAsync(markdownPlain(text));
    haptic.tap();
    toast.show(said.copied);
  } catch {
    haptic.soft();
    toast.show(said.failed, 'error');
  }
}

export function MessageMenu({
  message,
  onClose,
}: {
  message: MenuMessage | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  const say = useSay();
  const sceneLang = useSceneLanguage();
  const ListenButton = messageListen.get();
  return (
    <Sheet
      visible={message !== null}
      title={
        message?.role === 'buddy' ? t('buddy:message.title_buddy') : t('buddy:message.title_mine')
      }
      closeLabel={t('common:actions.close')}
      onClose={onClose}
    >
      {message?.role === 'buddy' && ListenButton ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <ListenButton
            key={message.text}
            source={{ text: spokenText(message.text, say), lang: sceneLang }}
            slow
          />
        </View>
      ) : null}
      <ListGroup>
        <Row
          icon="file"
          title={t('buddy:message.copy')}
          chevron={false}
          onPress={() => {
            const m = message;
            onClose();
            if (m)
              void copyMessage(m.text, {
                copied: t('buddy:message.copied'),
                failed: t('buddy:message.copy_failed'),
              });
          }}
        />
      </ListGroup>
    </Sheet>
  );
}
