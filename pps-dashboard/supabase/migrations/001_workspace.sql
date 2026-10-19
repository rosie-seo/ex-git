-- Run in Supabase SQL editor. No business data is seeded into the repository.
create table if not exists public.pps_state (
  id text primary key check (id = 'workspace'),
  version bigint not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pps_state enable row level security;
revoke all on public.pps_state from anon, authenticated;
grant select, update on public.pps_state to service_role;
insert into public.pps_state(id) values ('workspace') on conflict do nothing;
create or replace function public.pps_commit(expected_version bigint, payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.pps_state set data=payload, version=version+1, updated_at=now()
    where id='workspace' and version=expected_version;
  return found;
end;
$$;
revoke all on function public.pps_commit(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.pps_commit(bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values ('pps-private','pps-private',false,10485760)
on conflict(id) do update set public=false;
-- Deliberately no anon/authenticated storage policies. All files pass through
-- the authenticated server route; service_role is stored ONLY on the server.
