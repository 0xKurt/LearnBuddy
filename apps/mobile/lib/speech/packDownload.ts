import type { PronunciationPack } from './pronunciationPacks.js';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export function packNetworkAllowed(net: NetInfoState): boolean {
  return (
    net.type !== 'cellular' &&
    net.isConnected === true &&
    net.details?.isConnectionExpensive === false
  );
}

/** Background packs never spend metered data, including consent saved by older versions. */
export async function mayDownloadPack(_pack: PronunciationPack): Promise<boolean> {
  const net = await NetInfo.fetch();
  return packNetworkAllowed(net);
}
