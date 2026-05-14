// Drizzle + expo-sqlite client. Migrations live alongside this file in /migrations.
// Skeleton: lazily opened on first use; production wraps in an opener that
// runs pending migrations.

import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!_db) {
    const raw = openDatabaseSync('learnbuddy.db');
    _db = drizzle(raw, { schema });
  }
  return _db;
}
