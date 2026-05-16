// Local dev server. Runs the same Hono app on @hono/node-server.
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`[api] listening on http://localhost:${port}`);
});
