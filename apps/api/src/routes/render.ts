// GET /render/latex — public, cacheable. Doc 04 §math-rendering.
import { Hono } from 'hono';
import { notImplemented } from '../lib/errors.js';

export const renderRoutes = new Hono();

renderRoutes.get('/latex', (c) => {
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  return notImplemented(c, 'GET /render/latex');
});
