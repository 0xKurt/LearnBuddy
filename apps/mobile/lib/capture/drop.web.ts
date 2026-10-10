// In the browser a worksheet can be dragged onto the chat (photos or a PDF from
// the desktop, the downloads, the school platform's tab). Returns whether files are being
// dragged over the page right now, for the drop hint.
import { useEffect, useRef, useState } from 'react';

import type { IncomingFile } from './files.js';

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function useFileDrop(onFiles: (files: IncomingFile[]) => void, enabled: boolean): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setOver(false);
      return;
    }
    // Enter/leave fire for every child element: count them, so the hint does not flicker.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const overPage = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Without this the browser opens the file instead of handing it to the page.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).map((f) => ({
        uri: URL.createObjectURL(f),
        name: f.name || null,
        mimeType: f.type || null,
        size: f.size,
      }));
      if (files.length > 0) latest.current(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overPage);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overPage);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [enabled]);

  return over;
}
