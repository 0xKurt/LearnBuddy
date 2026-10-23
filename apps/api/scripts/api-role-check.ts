// Read-only deployment preflight for the connected API role (issue #862).
// The contract is infra/supabase/templates/api-role.sql, not a hard-coded role name.
import type pg from 'pg';

export async function apiRoleProblems(client: pg.Client): Promise<string[]> {
  const result = await client.query<{ problem: string }>(`
    select 'role: requires ' || a.name as problem
      from pg_roles r
      cross join lateral (values ('LOGIN', r.rolcanlogin), ('BYPASSRLS', r.rolbypassrls)) a(name, allowed)
     where r.rolname = current_user and not a.allowed
    union all
    select 'role: forbidden ' || a.name
      from pg_roles r
      cross join lateral (values ('SUPERUSER', r.rolsuper), ('CREATEDB', r.rolcreatedb),
        ('CREATEROLE', r.rolcreaterole), ('REPLICATION', r.rolreplication)) a(name, allowed)
     where r.rolname = current_user and a.allowed
    union all
    select 'public: missing usage'
     where not has_schema_privilege(current_user, 'public', 'usage')
    union all
    select n.nspname || ': forbidden ' || p.privilege
      from pg_namespace n cross join (values ('usage'), ('create')) p(privilege)
     where (n.nspname in ('auth', 'storage') or (n.nspname = 'public' and p.privilege = 'create'))
       and has_schema_privilege(current_user, n.oid, p.privilege)
    union all
    select 'public.' || c.relname || ': missing ' || p.privilege
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('select'), ('insert'), ('update'), ('delete')) p(privilege)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'f')
       and not has_table_privilege(current_user, c.oid, p.privilege)
    union all
    select 'public.' || c.relname || ': forbidden ownership'
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and pg_has_role(current_user, c.relowner, 'USAGE')
    union all
    select 'public.' || c.relname || ': missing ' || p.privilege
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('usage'), ('select'), ('update')) p(privilege)
     where n.nspname = 'public' and c.relkind = 'S'
       and not has_sequence_privilege(current_user, c.oid, p.privilege)
    union all
    select p.oid::regprocedure::text || ': missing execute'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and not has_function_privilege(current_user, p.oid, 'execute')
    union all
    select 'supabase_migrations: missing usage'
      from pg_namespace n where n.nspname = 'supabase_migrations'
       and not has_schema_privilege(current_user, n.oid, 'usage')
    union all
    select 'supabase_migrations.schema_migrations: missing select'
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations'
       and not has_table_privilege(current_user, c.oid, 'select')
    order by problem
  `);
  return result.rows.map((row) => row.problem);
}
