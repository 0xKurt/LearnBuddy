// Connector "material": the learner's read worksheets (extracted text, title,
// subject). Internal: nothing leaves the system. Every query is scoped by the
// learner id in code. ADR 0005 §Connectors.

import type { Db } from '../../../lib/db.js';
import { localParts } from '../../../lib/time.js';
import { prefixQuery } from './search.js';

export type MaterialHit = {
  title: string;
  subject: string | null;
  /** Local date the sheet was read (YYYY-MM-DD). */
  read_on: string | null;
  /** The passages that match, joined with " … "; the start of the sheet without a query. */
  excerpt: string;
};

export async function searchMaterials(
  db: Db,
  learnerId: string,
  timezone: string,
  query: string,
  limit: number,
): Promise<MaterialHit[]> {
  const q = prefixQuery(query);
  const rows = await db.query<{
    title: string | null;
    subject: string | null;
    ready_at: Date | null;
    excerpt: string;
  }>(
    q === null
      ? `select m.title, s.name as subject, m.ready_at, left(m.extracted_text, 600) as excerpt
           from materials m left join subjects s on s.id = m.subject_id
          where m.learner_id = $1 and m.status = 'ready' and m.archived_at is null
            and m.extracted_text is not null
          order by m.ready_at desc nulls last limit $2`
      : `select m.title, s.name as subject, m.ready_at,
                ts_headline('simple', m.extracted_text, to_tsquery('simple', $3),
                  'MaxWords=60, MinWords=20, MaxFragments=3, FragmentDelimiter=" … "') as excerpt
           from materials m left join subjects s on s.id = m.subject_id
          where m.learner_id = $1 and m.status = 'ready' and m.archived_at is null
            and m.extracted_text is not null
            and to_tsvector('simple', coalesce(m.title, '') || ' ' || coalesce(s.name, '') || ' ' || m.extracted_text)
                @@ to_tsquery('simple', $3)
          order by ts_rank(to_tsvector('simple', coalesce(m.title, '') || ' ' || m.extracted_text),
                           to_tsquery('simple', $3)) desc,
                   m.ready_at desc nulls last
          limit $2`,
    q === null ? [learnerId, limit] : [learnerId, limit, q],
  );
  return rows.map((r) => ({
    title: r.title ?? '',
    subject: r.subject,
    read_on: r.ready_at ? localParts(r.ready_at, timezone).date : null,
    excerpt: r.excerpt.replace(/\s+/g, ' ').trim().slice(0, 700),
  }));
}
