import type { PronunciationPack } from './pronunciationPacks.js';
import NetInfo from '@react-native-community/netinfo';

/** Background packs never spend metered data, including consent saved by older versions. */
export async function mayDownloadPack(_pack: PronunciationPack): Promise<boolean> {
  const net = await NetInfo.fetch();
  return net.isConnected === true && net.details?.isConnectionExpensive === false;
}
