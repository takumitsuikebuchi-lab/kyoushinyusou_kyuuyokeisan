create table if not exists public.app_state (
  id text primary key,
  version integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  data jsonb
);

revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;
