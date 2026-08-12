begin;

select plan(9);

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

select is(
  (select count(*)::integer from pg_enum
   join pg_type on pg_type.oid = pg_enum.enumtypid
   join pg_namespace on pg_namespace.oid = pg_type.typnamespace
   where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'),
  5,
  'match_status contains exactly five values'
);

select ok(exists (select 1 from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'
    and enumsortorder = 1 and enumlabel = 'scheduled'), 'scheduled is first');
select ok(exists (select 1 from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'
    and enumsortorder = 2 and enumlabel = 'live'), 'live is second');
select ok(exists (select 1 from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'
    and enumsortorder = 3 and enumlabel = 'finished'), 'finished is third');
select ok(exists (select 1 from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'
    and enumsortorder = 4 and enumlabel = 'postponed'), 'postponed is fourth');
select ok(exists (select 1 from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public' and pg_type.typname = 'match_status'
    and enumsortorder = 5 and enumlabel = 'canceled'), 'canceled is fifth');

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
