-- Slice 3: secure invite lifecycle, join requests, private Demo proof history,
-- durable upload throttling, and narrowly scoped authenticated RPCs.
-- Approval, rejection, and membership mutations intentionally remain Slice 4.

do $$
begin
  create type public.invite_status as enum ('active', 'revoked');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.join_request_status as enum (
    'pending_proof',
    'pending_approval',
    'approved',
    'rejected'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.invite_links (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  token_hash text not null,
  status public.invite_status not null default 'active',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint invite_links_token_hash_key unique (token_hash),
  constraint invite_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invite_links_expiry_range_check check (
    expires_at >= created_at + interval '1 day'
    and expires_at <= created_at + interval '30 days'
  ),
  constraint invite_links_lifecycle_check check (
    (status = 'active' and revoked_at is null)
    or (
      status = 'revoked'
      and revoked_at is not null
      and revoked_at >= created_at
    )
  )
);

create unique index invite_links_one_active_per_league_idx
  on public.invite_links (league_id)
  where status = 'active';

create index invite_links_league_created_idx
  on public.invite_links (league_id, created_at desc, id desc);

create table public.join_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.join_request_status not null default 'pending_proof',
  rejection_reason text,
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint join_requests_decision_lifecycle_check check (
    (
      status in ('pending_proof', 'pending_approval')
      and rejection_reason is null
      and decided_by is null
      and decided_at is null
    )
    or (
      status = 'approved'
      and rejection_reason is null
      and decided_by is not null
      and decided_at is not null
    )
    or (
      status = 'rejected'
      and rejection_reason is not null
      and rejection_reason = btrim(rejection_reason)
      and char_length(rejection_reason) between 3 and 300
      and decided_by is not null
      and decided_at is not null
    )
  )
);

create unique index join_requests_one_active_per_user_league_idx
  on public.join_requests (league_id, user_id)
  where status in ('pending_proof', 'pending_approval', 'approved');

create index join_requests_league_status_created_idx
  on public.join_requests (league_id, status, created_at);

create index join_requests_user_created_idx
  on public.join_requests (user_id, created_at desc, id desc);

create table public.payment_proofs (
  id uuid primary key,
  join_request_id uuid not null references public.join_requests(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null,
  mime_type text not null default 'image/webp',
  size_bytes integer not null,
  sha256 text not null,
  upload_idempotency_key uuid not null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payment_proofs_storage_path_key unique (storage_path),
  constraint payment_proofs_request_idempotency_key
    unique (join_request_id, upload_idempotency_key),
  constraint payment_proofs_storage_path_check check (
    storage_path ~ '^league/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/request/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  ),
  constraint payment_proofs_mime_type_check check (mime_type = 'image/webp'),
  constraint payment_proofs_size_bytes_check check (size_bytes between 1 and 4000000),
  constraint payment_proofs_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint payment_proofs_deleted_at_check check (
    deleted_at is null or deleted_at >= uploaded_at
  )
);

create index payment_proofs_request_uploaded_idx
  on public.payment_proofs (join_request_id, uploaded_at desc, id desc);

create table public.rate_limit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  join_request_id uuid not null references public.join_requests(id) on delete restrict,
  action text not null default 'proof_upload',
  created_at timestamptz not null default now(),
  constraint rate_limit_events_action_check check (action = 'proof_upload')
);

create index rate_limit_events_user_request_action_created_idx
  on public.rate_limit_events (user_id, join_request_id, action, created_at desc);

create index rate_limit_events_user_action_created_idx
  on public.rate_limit_events (user_id, action, created_at desc);

create table public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (
    action = btrim(action) and char_length(action) between 3 and 100
  ),
  constraint audit_logs_entity_type_check check (
    entity_type = btrim(entity_type)
    and entity_type ~ '^[a-z][a-z0-9_]{1,49}$'
  ),
  constraint audit_logs_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

comment on table public.invite_links is
  'Hashed private-league invite tokens. Raw tokens are generated and returned once by an RPC and are never stored.';
comment on table public.join_requests is
  'Append-preserved join request history. Slice 3 creates pending states only.';
comment on table public.payment_proofs is
  'Private Demo-only sanitized WebP proof metadata. Storage paths are not granted to user roles.';
comment on table public.rate_limit_events is
  'Durable proof-upload attempt events. No direct Data API access.';
comment on table public.audit_logs is
  'Append-only security audit metadata without tokens, proof paths, signed URLs, or file content.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  4000000,
  array['image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.invite_links enable row level security;
alter table public.join_requests enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.invite_links,
  public.join_requests,
  public.payment_proofs,
  public.rate_limit_events,
  public.audit_logs
from public, anon, authenticated, service_role;

grant select on table public.join_requests to authenticated;
grant select (
  id,
  join_request_id,
  mime_type,
  size_bytes,
  uploaded_at,
  deleted_at
) on table public.payment_proofs to authenticated;
grant select (id, storage_path, deleted_at)
  on table public.payment_proofs to service_role;

create policy join_requests_authorized_read
  on public.join_requests
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_league_manager(league_id)
  );

create policy payment_proofs_authorized_read
  on public.payment_proofs
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      uploaded_by = (select auth.uid())
      or exists (
        select 1
        from public.join_requests as request
        where request.id = payment_proofs.join_request_id
          and private.is_league_manager(request.league_id)
      )
    )
  );

create function private.touch_slice3_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The shared Slice 2 trigger uses transaction-start time. Slice 3 operations
  -- can wait on security locks, so their lifecycle timestamp must be current.
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.touch_slice3_updated_at()
  from public, anon, authenticated, service_role;

create trigger invite_links_touch_updated_at
before update on public.invite_links
for each row execute function private.touch_slice3_updated_at();

create trigger join_requests_touch_updated_at
before update on public.join_requests
for each row execute function private.touch_slice3_updated_at();

create function private.invite_token_hash_is_valid(p_token_hash text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_token_hash is not null and p_token_hash ~ '^[0-9a-f]{64}$';
$$;

create function private.hash_invite_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create function private.league_accepts_new_requests(
  p_status public.league_status,
  p_allow_late_join boolean,
  p_joins_close_at timestamptz,
  p_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
    p_status = 'open'
    or (p_status = 'active' and p_allow_late_join)
  )
  and (p_joins_close_at is null or p_at < p_joins_close_at);
$$;

create function private.join_request_eligibility(
  p_token_hash text,
  p_actor_id uuid,
  p_at timestamptz,
  p_allow_existing_on_inactive_invite boolean
)
returns table (
  invite_available boolean,
  league_id uuid,
  viewer_state text,
  join_request_id uuid,
  join_request_status public.join_request_status,
  request_created_at timestamptz,
  request_updated_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_invite public.invite_links%rowtype;
  v_league public.leagues%rowtype;
  v_request public.join_requests%rowtype;
  v_has_request boolean := false;
  v_invite_available boolean := false;
  v_viewer_state text := 'unavailable';
begin
  if not private.invite_token_hash_is_valid(p_token_hash) then
    return query
    select false, null::uuid, 'unavailable'::text, null::uuid,
      null::public.join_request_status, null::timestamptz, null::timestamptz;
    return;
  end if;

  select invite.*
    into v_invite
    from public.invite_links as invite
    where invite.token_hash = p_token_hash;

  if not found then
    return query
    select false, null::uuid, 'unavailable'::text, null::uuid,
      null::public.join_request_status, null::timestamptz, null::timestamptz;
    return;
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = v_invite.league_id;

  if not found then
    return query
    select false, null::uuid, 'unavailable'::text, null::uuid,
      null::public.join_request_status, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_invite_available :=
    v_invite.status = 'active' and v_invite.expires_at > p_at;

  if p_actor_id is not null then
    select request.*
      into v_request
      from public.join_requests as request
      where request.league_id = v_league.id
        and request.user_id = p_actor_id
      order by
        case
          when request.status in ('pending_proof', 'pending_approval', 'approved')
            then 0
          else 1
        end,
        request.created_at desc,
        request.id desc
      limit 1;
    v_has_request := found;
  end if;

  if p_actor_id is null then
    v_viewer_state := case
      when private.league_accepts_new_requests(
        v_league.status,
        v_league.allow_late_join,
        v_league.joins_close_at,
        p_at
      ) then 'guest'
      else 'closed'
    end;
  elsif v_league.manager_id = p_actor_id then
    v_viewer_state := 'manager';
  elsif v_has_request
        and v_request.status in ('pending_proof', 'pending_approval', 'approved') then
    v_viewer_state := v_request.status::text;
  elsif exists (
    select 1
    from public.league_members as member
    where member.league_id = v_league.id
      and member.user_id = p_actor_id
      and member.status = 'active'
  ) then
    v_viewer_state := 'active_member';
  elsif not private.league_accepts_new_requests(
    v_league.status,
    v_league.allow_late_join,
    v_league.joins_close_at,
    p_at
  ) then
    v_viewer_state := 'closed';
  elsif v_has_request and v_request.status = 'rejected' then
    v_viewer_state := 'rejected';
  else
    v_viewer_state := 'eligible';
  end if;

  if not v_invite_available
     and not (
       p_allow_existing_on_inactive_invite
       and v_viewer_state in ('pending_proof', 'pending_approval', 'approved')
     ) then
    return query
    select false, null::uuid, 'unavailable'::text, null::uuid,
      null::public.join_request_status, null::timestamptz, null::timestamptz;
    return;
  end if;

  return query
  select
    v_invite_available,
    v_league.id,
    v_viewer_state,
    case when v_has_request then v_request.id else null::uuid end,
    case
      when v_has_request then v_request.status
      else null::public.join_request_status
    end,
    case when v_has_request then v_request.created_at else null::timestamptz end,
    case when v_has_request then v_request.updated_at else null::timestamptz end;
end;
$$;

create function private.payment_proof_summaries(p_join_request_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', proof.id,
        'mime_type', proof.mime_type,
        'size_bytes', proof.size_bytes,
        'uploaded_at', proof.uploaded_at
      )
      order by proof.uploaded_at desc, proof.id desc
    ),
    '[]'::jsonb
  )
  from public.payment_proofs as proof
  where proof.join_request_id = p_join_request_id
    and proof.deleted_at is null;
$$;

revoke all on function private.invite_token_hash_is_valid(text)
  from public, anon, authenticated, service_role;
revoke all on function private.hash_invite_token(text)
  from public, anon, authenticated, service_role;
revoke all on function private.league_accepts_new_requests(
  public.league_status, boolean, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function private.join_request_eligibility(
  text, uuid, timestamptz, boolean
) from public, anon, authenticated, service_role;
revoke all on function private.payment_proof_summaries(uuid)
  from public, anon, authenticated, service_role;

create function public.create_or_rotate_invite(p_league_id uuid)
returns table (
  invite_id uuid,
  status public.invite_status,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  raw_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_league public.leagues%rowtype;
  v_previous_invite_id uuid;
  v_invite_id uuid;
  v_inserted_invite_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_insert_attempts integer := 0;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = p_league_id
      and league.manager_id = v_actor_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- A transaction can begin before a competing rotation and then wait for this
  -- league lock. Capture fresh database time only after serialization so the
  -- event cannot predate the invite that this call is about to revoke.
  v_at := clock_timestamp();

  if v_league.status = 'draft' then
    if v_league.joins_close_at is not null
       and v_at >= v_league.joins_close_at then
      raise exception using errcode = 'P0001', message = 'JOIN_CLOSED';
    end if;
  elsif not private.league_accepts_new_requests(
    v_league.status,
    v_league.allow_late_join,
    v_league.joins_close_at,
    v_at
  ) then
    raise exception using errcode = 'P0001', message = 'JOIN_CLOSED';
  end if;

  select invite.id
    into v_previous_invite_id
    from public.invite_links as invite
    where invite.league_id = p_league_id
      and invite.status = 'active'
    for update;

  if v_previous_invite_id is not null then
    update public.invite_links as invite
    set status = 'revoked',
        revoked_at = v_at
    where invite.id = v_previous_invite_id;
  end if;

  loop
    v_insert_attempts := v_insert_attempts + 1;

    if v_insert_attempts > 8 then
      raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
    end if;

    v_raw_token := rtrim(
      translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
      '='
    );
    v_token_hash := private.hash_invite_token(v_raw_token);
    v_invite_id := extensions.gen_random_uuid();
    v_inserted_invite_id := null;

    begin
      insert into public.invite_links (
        id,
        league_id,
        token_hash,
        status,
        expires_at,
        created_by,
        created_at,
        updated_at
      )
      values (
        v_invite_id,
        p_league_id,
        v_token_hash,
        'active',
        v_at + interval '7 days',
        v_actor_id,
        v_at,
        v_at
      )
      on conflict (token_hash) do nothing
      returning id into v_inserted_invite_id;
    exception
      when unique_violation then
        -- A concurrent caller may have inserted its active invite after this
        -- statement began and while we waited on the league row. The partial
        -- unique index is the arbiter; lock/revoke that winner and retry so
        -- both callers receive a successful, serializable rotation result.
        select invite.id
          into v_previous_invite_id
          from public.invite_links as invite
          where invite.league_id = p_league_id
            and invite.status = 'active'
          for update;

        if v_previous_invite_id is not null then
          v_at := clock_timestamp();

          update public.invite_links as invite
          set status = 'revoked',
              revoked_at = v_at
          where invite.id = v_previous_invite_id;
        end if;

        continue;
    end;

    exit when v_inserted_invite_id is not null;
  end loop;

  if v_league.status = 'draft' then
    update public.leagues as league
    set status = 'open'
    where league.id = p_league_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_actor_id,
    case
      when v_previous_invite_id is null then 'invite.created'
      else 'invite.rotated'
    end,
    'invite_link',
    v_invite_id,
    case
      when v_previous_invite_id is null
        then jsonb_build_object('league_id', p_league_id)
      else jsonb_build_object(
        'league_id', p_league_id,
        'replaced_invite_id', v_previous_invite_id
      )
    end,
    v_at
  );

  return query
  select
    invite.id,
    invite.status,
    invite.created_at,
    invite.expires_at,
    invite.revoked_at,
    v_raw_token
  from public.invite_links as invite
  where invite.id = v_invite_id;
end;
$$;

create function public.get_league_invite_metadata(p_league_id uuid)
returns table (
  invite_id uuid,
  status public.invite_status,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  is_expired boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and league.manager_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return query
  select
    invite.id,
    invite.status,
    invite.created_at,
    invite.expires_at,
    invite.revoked_at,
    invite.expires_at <= now()
  from public.invite_links as invite
  where invite.league_id = p_league_id
  order by
    (invite.status = 'active') desc,
    invite.created_at desc,
    invite.id desc
  limit 1;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns table (
  invite_id uuid,
  status public.invite_status,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_league_id uuid;
  v_manager_id uuid;
  v_invite public.invite_links%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select invite.league_id
    into v_league_id
    from public.invite_links as invite
    where invite.id = p_invite_id;

  if v_league_id is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select league.manager_id
    into v_manager_id
    from public.leagues as league
    where league.id = v_league_id
      and league.manager_id = v_actor_id
    for update;

  if v_manager_id is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select invite.*
    into v_invite
    from public.invite_links as invite
    where invite.id = p_invite_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  v_at := clock_timestamp();

  if v_invite.status = 'active' then
    update public.invite_links as invite
    set status = 'revoked',
        revoked_at = v_at
    where invite.id = p_invite_id
    returning invite.* into v_invite;

    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata,
      created_at
    )
    values (
      v_actor_id,
      'invite.revoked',
      'invite_link',
      p_invite_id,
      jsonb_build_object('league_id', v_league_id),
      v_at
    );
  end if;

  return query
  select
    v_invite.id,
    v_invite.status,
    v_invite.created_at,
    v_invite.expires_at,
    v_invite.revoked_at;
end;
$$;

create function public.resolve_invite(p_token_hash text)
returns table (
  available boolean,
  league_name text,
  demo_entry_fee_agorot integer,
  demo_payment_instructions text,
  joins_close_at timestamptz,
  viewer_state text,
  join_request_id uuid,
  join_request_status public.join_request_status,
  request_created_at timestamptz,
  request_updated_at timestamptz,
  proofs jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz := now();
  v_league public.leagues%rowtype;
  v_eligibility record;
  v_proofs jsonb := '[]'::jsonb;
begin
  select eligibility.*
    into v_eligibility
    from private.join_request_eligibility(
      p_token_hash,
      v_actor_id,
      v_at,
      false
    ) as eligibility;

  if not v_eligibility.invite_available then
    return query
    select
      false,
      null::text,
      null::integer,
      null::text,
      null::timestamptz,
      null::text,
      null::uuid,
      null::public.join_request_status,
      null::timestamptz,
      null::timestamptz,
      '[]'::jsonb;
    return;
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = v_eligibility.league_id;

  if v_eligibility.join_request_id is not null then
    v_proofs := private.payment_proof_summaries(
      v_eligibility.join_request_id
    );
  end if;

  return query
  select
    true,
    v_league.name,
    v_league.demo_entry_fee_agorot,
    v_league.demo_payment_instructions,
    v_league.joins_close_at,
    v_eligibility.viewer_state,
    v_eligibility.join_request_id,
    v_eligibility.join_request_status,
    v_eligibility.request_created_at,
    v_eligibility.request_updated_at,
    v_proofs;
end;
$$;

create function public.submit_join_request(p_token_hash text)
returns table (
  request_id uuid,
  status public.join_request_status,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz := now();
  v_league public.leagues%rowtype;
  v_request public.join_requests%rowtype;
  v_eligibility record;
  v_created boolean := false;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select eligibility.*
    into v_eligibility
    from private.join_request_eligibility(
      p_token_hash,
      v_actor_id,
      v_at,
      true
    ) as eligibility;

  if v_eligibility.league_id is null then
    raise exception using errcode = 'P0001', message = 'INVITE_UNAVAILABLE';
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = v_eligibility.league_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVITE_UNAVAILABLE';
  end if;

  -- Re-evaluate every admission rule while holding the league lock so a close,
  -- rotation, membership change, or competing request cannot use stale state.
  -- PostgreSQL now() is fixed at transaction start, so refresh the database
  -- event time after the lock before evaluating expiry/close boundaries.
  v_at := clock_timestamp();

  select eligibility.*
    into v_eligibility
    from private.join_request_eligibility(
      p_token_hash,
      v_actor_id,
      v_at,
      true
    ) as eligibility;

  if v_eligibility.viewer_state in (
    'pending_proof', 'pending_approval', 'approved'
  ) then
    return query
    select
      v_eligibility.join_request_id,
      v_eligibility.join_request_status,
      v_eligibility.request_created_at,
      v_eligibility.request_updated_at;
    return;
  end if;

  if v_eligibility.viewer_state in ('manager', 'active_member') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if not v_eligibility.invite_available then
    raise exception using errcode = 'P0001', message = 'INVITE_UNAVAILABLE';
  end if;

  if v_eligibility.viewer_state = 'closed' then
    raise exception using errcode = 'P0001', message = 'JOIN_CLOSED';
  end if;

  if v_eligibility.viewer_state not in ('eligible', 'rejected') then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  begin
    insert into public.join_requests (
      league_id,
      user_id,
      status,
      created_at,
      updated_at
    )
    values (
      v_league.id,
      v_actor_id,
      'pending_proof',
      v_at,
      v_at
    )
    returning * into v_request;
    v_created := true;
  exception
    when unique_violation then
    select request.*
      into v_request
      from public.join_requests as request
      where request.league_id = v_league.id
        and request.user_id = v_actor_id
        and request.status in ('pending_proof', 'pending_approval', 'approved')
      order by request.created_at desc, request.id desc
      limit 1;
  end;

  if v_request.id is null then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  if v_created then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata,
      created_at
    )
    values (
      v_actor_id,
      'join_request.created',
      'join_request',
      v_request.id,
      jsonb_build_object('league_id', v_league.id),
      v_at
    );
  end if;

  return query
  select
    v_request.id,
    v_request.status,
    v_request.created_at,
    v_request.updated_at;
end;
$$;

create function public.get_my_join_requests()
returns table (
  request_id uuid,
  league_name text,
  status public.join_request_status,
  created_at timestamptz,
  updated_at timestamptz,
  proofs jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  return query
  select
    request.id,
    league.name,
    request.status,
    request.created_at,
    request.updated_at,
    private.payment_proof_summaries(request.id)
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.user_id = v_actor_id
  order by request.created_at desc, request.id desc
  limit 100;
end;
$$;

create function public.get_join_request_upload_context(p_request_id uuid)
returns table (
  request_id uuid,
  league_id uuid,
  status public.join_request_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select request.*
    into v_request
    from public.join_requests as request
    where request.id = p_request_id
      and request.user_id = v_actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_request.status not in ('pending_proof', 'pending_approval') then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_UPLOADABLE';
  end if;

  return query
  select v_request.id, v_request.league_id, v_request.status;
end;
$$;

create function public.consume_proof_upload_rate_limit(p_request_id uuid)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_request public.join_requests%rowtype;
  v_attempts_15m integer;
  v_attempts_24h integer;
  v_oldest_15m timestamptz;
  v_oldest_24h timestamptz;
  v_retry_after integer := 0;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  -- A profile row exists for every Auth user and provides one durable lock per
  -- actor, so attempts across multiple requests cannot race the 24-hour quota.
  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select request.*
    into v_request
    from public.join_requests as request
    where request.id = p_request_id
      and request.user_id = v_actor_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- Both durable quota locks are now held. Use the current database time for
  -- the window decision and the event written by this serialized attempt.
  v_at := clock_timestamp();

  if v_request.status not in ('pending_proof', 'pending_approval') then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_UPLOADABLE';
  end if;

  select count(*)::integer, min(event.created_at)
    into v_attempts_15m, v_oldest_15m
    from public.rate_limit_events as event
    where event.user_id = v_actor_id
      and event.join_request_id = p_request_id
      and event.action = 'proof_upload'
      and event.created_at > v_at - interval '15 minutes';

  select count(*)::integer, min(event.created_at)
    into v_attempts_24h, v_oldest_24h
    from public.rate_limit_events as event
    where event.user_id = v_actor_id
      and event.action = 'proof_upload'
      and event.created_at > v_at - interval '24 hours';

  if v_attempts_15m >= 5 then
    v_retry_after := greatest(
      v_retry_after,
      greatest(
        1,
        ceil(extract(epoch from (
          v_oldest_15m + interval '15 minutes' - v_at
        )))::integer
      )
    );
  end if;

  if v_attempts_24h >= 20 then
    v_retry_after := greatest(
      v_retry_after,
      greatest(
        1,
        ceil(extract(epoch from (
          v_oldest_24h + interval '24 hours' - v_at
        )))::integer
      )
    );
  end if;

  if v_retry_after > 0 then
    return query select false, v_retry_after;
    return;
  end if;

  insert into public.rate_limit_events (
    user_id,
    join_request_id,
    action,
    created_at
  )
  values (
    v_actor_id,
    p_request_id,
    'proof_upload',
    v_at
  );

  return query select true, 0;
end;
$$;

create function public.finalize_payment_proof(
  p_request_id uuid,
  p_proof_id uuid,
  p_idempotency_key uuid,
  p_sha256 text,
  p_size_bytes integer
)
returns table (
  proof_id uuid,
  request_id uuid,
  status public.join_request_status,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_request public.join_requests%rowtype;
  v_existing_proof public.payment_proofs%rowtype;
  v_storage_path text;
  v_storage_metadata jsonb;
  v_proof_count integer;
  v_result_status public.join_request_status;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_proof_id is null
     or p_idempotency_key is null
     or p_sha256 is null
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_size_bytes is null
     or p_size_bytes not between 1 and 4000000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select request.*
    into v_request
    from public.join_requests as request
    where request.id = p_request_id
      and request.user_id = v_actor_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- The request lock serializes proof history/status changes. Timestamp the
  -- resulting proof lifecycle only after that serialization point.
  v_at := clock_timestamp();

  select proof.*
    into v_existing_proof
    from public.payment_proofs as proof
    where proof.join_request_id = p_request_id
      and proof.upload_idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_existing_proof.deleted_at is null
       and v_existing_proof.sha256 = p_sha256
       and v_existing_proof.size_bytes = p_size_bytes then
      return query
      select
        v_existing_proof.id,
        v_request.id,
        v_request.status,
        true;
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'PROOF_IDEMPOTENCY_CONFLICT';
  end if;

  if v_request.status not in ('pending_proof', 'pending_approval') then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_UPLOADABLE';
  end if;

  if exists (
    select 1
    from public.payment_proofs as proof
    where proof.id = p_proof_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROOF_IDEMPOTENCY_CONFLICT';
  end if;

  select count(*)::integer
    into v_proof_count
    from public.payment_proofs as proof
    where proof.join_request_id = p_request_id;

  if v_proof_count >= 5 then
    raise exception using errcode = 'P0001', message = 'PROOF_LIMIT_REACHED';
  end if;

  v_storage_path := format(
    'league/%s/request/%s/%s.webp',
    v_request.league_id,
    v_request.id,
    p_proof_id
  );

  select object.metadata
    into v_storage_metadata
    from storage.objects as object
    where object.bucket_id = 'payment-proofs'
      and object.name = v_storage_path;

  if not found
     or v_storage_metadata is null
     or v_storage_metadata ->> 'mimetype' <> 'image/webp'
     or coalesce(v_storage_metadata ->> 'size', '') !~ '^[0-9]+$' then
    raise exception using errcode = 'P0001', message = 'PROOF_OBJECT_MISSING';
  end if;

  if (v_storage_metadata ->> 'size')::bigint <> p_size_bytes then
    raise exception using errcode = 'P0001', message = 'PROOF_OBJECT_MISSING';
  end if;

  insert into public.payment_proofs (
    id,
    join_request_id,
    uploaded_by,
    storage_path,
    mime_type,
    size_bytes,
    sha256,
    upload_idempotency_key,
    uploaded_at
  )
  values (
    p_proof_id,
    v_request.id,
    v_actor_id,
    v_storage_path,
    'image/webp',
    p_size_bytes,
    p_sha256,
    p_idempotency_key,
    v_at
  );

  update public.join_requests as request
  set status = 'pending_approval',
      updated_at = v_at
  where request.id = v_request.id
  returning request.status into v_result_status;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_actor_id,
    'payment_proof.created',
    'payment_proof',
    p_proof_id,
    jsonb_build_object(
      'join_request_id', v_request.id,
      'league_id', v_request.league_id
    ),
    v_at
  );

  return query
  select p_proof_id, v_request.id, v_result_status, false;
end;
$$;

create function public.authorize_payment_proof_access(p_proof_id uuid)
returns table (
  proof_id uuid,
  request_id uuid,
  league_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  return query
  select proof.id, request.id, request.league_id
  from public.payment_proofs as proof
  join public.join_requests as request on request.id = proof.join_request_id
  join public.leagues as league on league.id = request.league_id
  where proof.id = p_proof_id
    and proof.deleted_at is null
    and (
      proof.uploaded_by = v_actor_id
      or league.manager_id = v_actor_id
    );
end;
$$;

revoke all on function public.create_or_rotate_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_league_invite_metadata(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_join_request(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_join_requests()
  from public, anon, authenticated, service_role;
revoke all on function public.get_join_request_upload_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_proof_upload_rate_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_payment_proof(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_payment_proof_access(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.resolve_invite(text) to anon, authenticated;
grant execute on function public.create_or_rotate_invite(uuid) to authenticated;
grant execute on function public.get_league_invite_metadata(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.submit_join_request(text) to authenticated;
grant execute on function public.get_my_join_requests() to authenticated;
grant execute on function public.get_join_request_upload_context(uuid) to authenticated;
grant execute on function public.consume_proof_upload_rate_limit(uuid) to authenticated;
grant execute on function public.finalize_payment_proof(uuid, uuid, uuid, text, integer)
  to authenticated;
grant execute on function public.authorize_payment_proof_access(uuid) to authenticated;
