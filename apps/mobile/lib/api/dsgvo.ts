// DSGVO endpoints. Doc 04 §dsgvo + Doc 09 §account-holder-rights.

import { z } from 'zod';

import { api } from './client.js';

const ExportResponse = z.object({ queued: z.literal(true), request_id: z.string().uuid() });
const DeleteResponse = z.object({
  queued: z.literal(true),
  request_id: z.string().uuid(),
  execute_at: z.string(),
});

export async function requestDsgvoExport(): Promise<z.infer<typeof ExportResponse>> {
  return api('/dsgvo/export', { method: 'POST', schema: ExportResponse });
}

export async function requestDsgvoDelete(): Promise<z.infer<typeof DeleteResponse>> {
  return api('/dsgvo/delete-account', { method: 'POST', schema: DeleteResponse });
}

export async function cancelDsgvoDelete(request_id: string): Promise<{ cancelled: true }> {
  return api(`/dsgvo/delete-account/${request_id}/cancel`, {
    method: 'POST',
  }) as Promise<{ cancelled: true }>;
}
