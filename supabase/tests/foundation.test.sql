begin;

select plan(4);

select ok(
  exists (
    select 1
    from pg_extension
    where extname = 'pgcrypto'
  ),
  'pgcrypto extension is available for future UUID boundaries'
);

select ok(
  exists (
    select 1
    from pg_type as types
    join pg_namespace as namespaces on namespaces.oid = types.typnamespace
    where namespaces.nspname = 'public'
      and types.typname = 'match_status'
      and types.typtype = 'e'
  ),
  'match_status enum exists in the public schema'
);

select results_eq(
  $$
    select enumlabel::text
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'match_status'
    order by enumsortorder
  $$,
  $$ values
    ('scheduled'::text),
    ('live'::text),
    ('finished'::text),
    ('postponed'::text),
    ('canceled'::text)
  $$,
  'match_status values match the provider contract'
);

select ok(
  not exists (
    select 1
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p', 'v', 'm', 'f')
  ),
  'foundation does not expose product tables or views early'
);

select * from finish();
rollback;
