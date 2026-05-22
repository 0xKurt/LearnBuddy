import { config } from 'dotenv';
config({ path: '.env.local' });

import { Env } from '../src/lib/env.js';
import { createLlmGateway } from '../src/lib/llm/factory.js';
import { drainExtractionJobs } from '../src/lib/extraction-drain.js';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const env = Env.parse({ ...process.env });
  const llm = createLlmGateway(env);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  console.log('Draining extraction jobs...');
  const result = await drainExtractionJobs({ supabase, llm, now: () => new Date() });
  console.log('Drain result:', JSON.stringify(result, null, 2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
