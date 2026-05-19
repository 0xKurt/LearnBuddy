// Drizzle ORM schema for the local SQLite mirror.
// Doc 03 §mobile-local-sqlite-mirror — strict subset of the server schema.
//
// `attempt_outbox` is the offline-first sync queue (Doc 05 §sync-engine):
// locally-graded attempts made while offline are persisted here and drained
// to POST /attempts/batch (idempotent, server-side) once back online.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const learners = sqliteTable('learners', {
  id: text('id').primaryKey(),
  account_id: text('account_id').notNull(),
  display_name: text('display_name').notNull(),
  birth_year: integer('birth_year'),
  grade_level: integer('grade_level').notNull(),
  ui_locale: text('ui_locale').notNull(),
  preferred_answer_mode: text('preferred_answer_mode').notNull(),
  avatar_id: integer('avatar_id').notNull(),
  archived_at: text('archived_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  learner_id: text('learner_id').notNull(),
  name: text('name').notNull(),
  subject_kind: text('subject_kind').notNull(),
  color_hex: text('color_hex').notNull(),
  icon_id: text('icon_id'),
  sort_order: integer('sort_order').notNull(),
  archived_at: text('archived_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  subject_id: text('subject_id').notNull(),
  name: text('name').notNull(),
  scheduled_for: text('scheduled_for'),
  archived_at: text('archived_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// Offline sync queue. One row per locally-graded attempt made while
// offline; `payload` is the JSON server-batch entry, replayed verbatim to
// POST /attempts/batch (idempotent on client_attempt_id) on reconnect.
export const attemptOutbox = sqliteTable('attempt_outbox', {
  client_attempt_id: text('client_attempt_id').primaryKey(),
  learner_id: text('learner_id').notNull(),
  payload: text('payload').notNull(),
  created_at: text('created_at').notNull(),
});
