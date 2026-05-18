import { z } from 'zod';

import { api } from './client.js';

const VersionResponse = z.object({
  api_version: z.string(),
  min_app_version: z.string(),
});

export async function fetchVersionInfo() {
  return api('/version', { method: 'GET', schema: VersionResponse, authOverride: null });
}
