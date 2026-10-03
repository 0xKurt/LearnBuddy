// The concept image of a question in a session view (issue #50): signed once per crop, left out
// when Storage is down. Split out of service.ts (max-lines, issue #313,
// docs/engineering-guards.md).

import type { ItemView } from '@learnbuddy/shared-types/contracts';

import type { StorageGateway } from '../../storage/gateway.js';

/** How long a signed concept-image URL lives; every session fetch signs afresh (issue #50). */
const IMAGE_URL_TTL_SECONDS = 1800;

export type ItemImageRow = {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_label: string | null;
};

/**
 * Signed URLs for the concept images of a view, one sign per distinct crop. A Storage
 * outage never breaks loading the session: the image is simply left out (null).
 */
export async function signImageUrls(
  storage: StorageGateway,
  rows: ItemImageRow[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const path of new Set(rows.map((r) => r.image_path).filter((p): p is string => !!p))) {
    try {
      urls.set(path, await storage.createDownloadUrl(path, IMAGE_URL_TTL_SECONDS));
    } catch {
      // Left out; the next fetch tries again.
    }
  }
  return urls;
}

/** The crop that goes with the question, or null (contract: ItemImage). */
export function imageOf(row: ItemImageRow, urls: Map<string, string>): ItemView['image'] {
  const url = row.image_path ? urls.get(row.image_path) : undefined;
  if (!url || !row.image_width || !row.image_height) return null;
  return { url, width: row.image_width, height: row.image_height, label: row.image_label ?? '' };
}
