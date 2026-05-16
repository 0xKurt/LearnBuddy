// Items API. Doc 04 §DELETE /items/:id. Slice G3 needs the archive call
// for the admin material drill-in.

import { z } from 'zod';
import { Item } from '@learnbuddy/shared-types';

import { api } from './client.js';

export async function listMaterialItems(learnerId: string, materialId: string): Promise<Item[]> {
  const res = await api(`/materials/${materialId}/items`, {
    method: 'GET',
    schema: z.object({ items: z.array(Item) }),
    learnerId,
  });
  return res.items;
}

export async function archiveItem(
  learnerId: string,
  itemId: string,
): Promise<{ id: string; archived: true }> {
  return api(`/items/${itemId}`, { method: 'DELETE', learnerId }) as Promise<{
    id: string;
    archived: true;
  }>;
}
