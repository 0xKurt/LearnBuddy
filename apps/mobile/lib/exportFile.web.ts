// The data export in the browser: a JSON file download (M-11).
import type { ExportDelivery } from './exportFile.js';

export const EXPORT_FILE_NAME = 'learnbuddy-export.json';

export async function deliverExport(json: string, _title: string): Promise<ExportDelivery> {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = EXPORT_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before the URL goes.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'saved';
}
