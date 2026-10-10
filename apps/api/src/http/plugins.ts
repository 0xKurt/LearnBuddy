// Routes a domain adds to the API (issue #107): the domain registers them at start-up
// (modules/learning/register.ts) and createApp mounts them after the core's own, in the order
// they were registered. The core never names them. A plugin under `/buddy` stands behind Buddy's
// guards (`mountBuddy`); every other base brings its own.

import type { Hono } from 'hono';

import type { AppEnv } from './context.js';

export type RoutePlugin = { base: string; routes: Hono<AppEnv> };

const plugins: RoutePlugin[] = [];

export function registerRoutes(...more: RoutePlugin[]): void {
  plugins.push(...more);
}

/** What createApp mounts after the core's routes, in registration order. */
export function routePlugins(): readonly RoutePlugin[] {
  return plugins;
}
