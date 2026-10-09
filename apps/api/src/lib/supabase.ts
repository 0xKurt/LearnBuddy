// The API's own Supabase client (issue #311): the service role, and no session of its own to keep
// or refresh — every call stands alone. Auth checks tokens with it, Storage signs and reads.

import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config.js';

export function serviceClient(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
