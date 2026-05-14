// RevenueCat webhook. Doc 04 §webhooks, doc 08 §grants.
import { Hono } from 'hono';
import { notImplemented } from '../lib/errors.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/revenuecat', (c) => notImplemented(c, 'POST /webhooks/revenuecat'));
