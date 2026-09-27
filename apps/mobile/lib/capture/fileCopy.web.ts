// In the browser a picked or dropped file is already its own (a data or blob URL); the
// draft turns it into a data URL (draftStorage.web.ts).
export async function ownCopy(uri: string, _ext: 'pdf'): Promise<string> {
  return uri;
}

export function sizeOf(_uri: string): number | null {
  return null;
}
