begin;

select plan(10);

select ok(
  exists (
    select 1
    from pg_extension
    join pg_namespace on pg_namespace.oid = pg_extension.extnamespace
    where extname = 'pgcrypto'
      and pg_namespace.nspname = 'extensions'
  ),
  'pgcrypto is installed in the extensions schema'
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
      and pg_class.relkind in ('r', 'p')
      and not pg_class.relrowsecurity
  ),
  'every public table has row level security enabled'
);

select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    cross join lateral aclexplode(
      coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))
    ) as privileges
    where pg_namespace.nspname = 'public'
      and privileges.grantee = 0
      and privileges.privilege_type = 'EXECUTE'
  ),
  'public schema functions do not grant execute to PUBLIC'
);

select * from finish();
rollback;
