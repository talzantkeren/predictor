-- Predictor1 local-only seed entry point.
-- The dedicated Sync principal has no known password and cannot be used by the
-- UI. Hosted environments provision their own principal outside migrations.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '70000000-0000-4000-8000-000000000007',
  'authenticated',
  'authenticated',
  'slice7-sync-system@local.invalid',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"מערכת סנכרון מקומית"}',
  clock_timestamp(),
  clock_timestamp()
)
on conflict (id) do nothing;

insert into public.system_admins (user_id, granted_by)
values (
  '70000000-0000-4000-8000-000000000007',
  '70000000-0000-4000-8000-000000000007'
)
on conflict (user_id) do nothing;

insert into private.slice9_system_actor_bindings (
  binding_name,
  actor_id
) values (
  'business_boundary_activation',
  '70000000-0000-4000-8000-000000000007'
)
on conflict (binding_name) do nothing;
