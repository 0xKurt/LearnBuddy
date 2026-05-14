import { Hono } from 'hono';
import { notImplemented } from '../lib/errors.js';

export const authRoutes = new Hono();

authRoutes.post('/account/signup', (c) => notImplemented(c, 'POST /auth/account/signup'));
authRoutes.post('/account/consent', (c) => notImplemented(c, 'POST /auth/account/consent'));
