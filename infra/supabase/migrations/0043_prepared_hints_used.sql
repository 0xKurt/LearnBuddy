-- The hint ladder counts only hints she was really shown as hints (docs/architecture.md
-- §Practice, live finding 1): hints_used counts every hint shown (prepared or written by the
-- tutor) and decides when "Tipp" may explain the solution; prepared_hints_used says which
-- prepared hint comes next. Feedback on a wrong answer is no hint and uses up neither.

alter table session_items
  add column prepared_hints_used smallint not null default 0 check (prepared_hints_used >= 0);

-- Until now every hint shown was a prepared one while any were left.
update session_items si
   set prepared_hints_used = least(si.hints_used, cardinality(i.hints))
  from items i
 where i.id = si.item_id and si.hints_used > 0;

comment on column session_items.prepared_hints_used is
  'Prepared hints (items.hints) shown so far; the next "Tipp" shows items.hints[prepared_hints_used].';
