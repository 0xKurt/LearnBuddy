import NetInfo from '@react-native-community/netinfo';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { packNetworkAllowed } from './packDownload.js';

/** Keep the policy attached until the native transfer has settled, before verification. */
export async function downloadPack(url: string, uri: string): Promise<void> {
  const task = createDownloadResumable(url, uri);
  let blocked = false;
  let cancellation: Promise<void> | undefined;
  const unsubscribe = NetInfo.addEventListener((net) => {
    if (packNetworkAllowed(net) || blocked) return;
    blocked = true;
    // The transfer promise remains authoritative: do not delete its file while it writes.
    cancellation = task.cancelAsync().catch(() => {});
  });
  try {
    const net = await NetInfo.fetch();
    if (blocked || !packNetworkAllowed(net)) throw new Error('model_network_changed');
    const result = await task.downloadAsync();
    if (blocked) throw new Error('model_network_changed');
    if (!result || result.status !== 200) throw new Error('model_download_failed');
  } finally {
    unsubscribe();
    await cancellation;
  }
}
