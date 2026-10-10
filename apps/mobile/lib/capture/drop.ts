// Dropping files onto the chat works only in the browser (drop.web.ts).
import type { IncomingFile } from './files.js';

export function useFileDrop(_onFiles: (files: IncomingFile[]) => void, _enabled: boolean): boolean {
  return false;
}
