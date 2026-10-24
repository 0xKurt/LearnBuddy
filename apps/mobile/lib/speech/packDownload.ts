import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import { readItem, writeItem } from '../api/outboxStorage.js';
import { i18n } from '../i18n/index.js';
import type { PronunciationPack } from './pronunciationPacks.js';

/** One answer per archive, shared across mounts. A refusal never prompts again in this run. */
const answers = new Map<string, Promise<boolean>>();
export async function mayDownloadPack(pack: PronunciationPack): Promise<boolean> {
  const net = await NetInfo.fetch();
  if (net.isConnected !== true) return false;
  if (net.details?.isConnectionExpensive === false) return true;
  const key = `lb.pronunciation.download.${pack.sha256}`;
  if ((await readItem(key)) === 'yes') return true;
  let answer = answers.get(key);
  if (!answer) {
    answer = new Promise<boolean>((resolve) => {
      Alert.alert(
        i18n.t('practice:speak.pack_download'),
        i18n.t('practice:speak.pack_metered', { mb: Math.ceil(pack.bytes / 1_000_000) }),
        [
          {
            text: i18n.t('practice:speak.pack_wait'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          { text: i18n.t('practice:speak.pack_allow'), onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    }).then(async (allowed) => {
      if (allowed) await writeItem(key, 'yes');
      return allowed;
    });
    answers.set(key, answer);
  }
  return answer;
}
