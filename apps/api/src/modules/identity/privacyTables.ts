// What a domain keeps about a learner, for her export and her account's deletion (DSGVO Art.
// 15/17/20; issue #107, cut 6; docs/privacy.md §Export and deletion). The core exports and
// deletes its own tables itself (identity/privacy.ts); a domain registers its tables here at
// start-up (LearnBuddy: modules/learning/register.ts), and the core never names them. Whether
// every table with a person's id is covered is checked against the database catalogue
// (__tests__/export-completeness.int.test.ts), not against this list.

/** One of a domain's tables. Every query gets the learner's id as $1. */
export type PrivacyTable = {
  /** The table, and the key her rows stand under in her export. */
  table: string;
  /** Her rows in the export; without it, every column of the rows with her learner_id. */
  exported?: string;
  /**
   * The ctids of her rows for the deletion's content stage; without it, the rows with her
   * learner_id. Null: the table is emptied with its parent (a cascade), not on its own.
   */
  rows?: string | null;
  /** The Storage paths her rows point at, handed to the deletion queue before any row goes. */
  files?: string;
};

const registered: PrivacyTable[] = [];

/** In the order the content stage deletes them: children first. A table registered twice throws. */
export function registerPrivacyTables(...more: PrivacyTable[]): void {
  const twice = more.filter((t) => registered.some((r) => r.table === t.table)).map((t) => t.table);
  if (twice.length > 0) throw new Error(`privacy table registered twice: ${twice.join(', ')}`);
  registered.push(...more);
}

/** The domain's tables, in registration order. */
export function privacyTables(): readonly PrivacyTable[] {
  return registered;
}
