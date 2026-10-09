// Hands the data export (DSGVO Art. 15/20) over as a file, never as share
// text: a real account's export is megabytes, which an Android share Intent
// cannot carry (Binder limit, M-11).
// - iOS: a JSON file in the cache, offered through the share sheet (Files,
//   AirDrop, mail …), removed again afterwards;
// - Android: the parents pick a folder (Storage Access Framework) and the file
//   is written there.
// requires live verification on a device (share sheet, folder picker).

import { Directory, File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

export type ExportDelivery = 'shared' | 'saved' | 'cancelled';

const EXPORT_FILE_NAME = 'learnbuddy-export.json';

export async function deliverExport(json: string, title: string): Promise<ExportDelivery> {
  if (Platform.OS === 'android') {
    // Closing the picker without a folder rejects: nothing was saved.
    const folder = await Directory.pickDirectoryAsync().catch(() => null);
    if (!folder) return 'cancelled';
    const file = folder.createFile(EXPORT_FILE_NAME, 'application/json');
    file.write(json);
    return 'saved';
  }
  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  try {
    const result = await Share.share({ url: file.uri, title });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } finally {
    // The receiving app has its copy; nothing of the export stays on the phone.
    if (file.exists) file.delete();
  }
}
