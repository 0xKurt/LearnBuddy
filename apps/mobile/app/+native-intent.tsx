// Links the system hands to the app before the router sees them. The iOS share extension
// opens "learnbuddy://dataUrl=learnbuddyShareKey": that is not a screen — the shared files
// are taken by components/capture/ShareIntake.tsx, which opens the capture screen itself.
// Warm: no navigation (''); cold: the start screen (the gate), then ShareIntake.
import { getShareExtensionKey } from 'expo-share-intent';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return initial ? '/' : '';
    return path;
  } catch {
    return path;
  }
}
