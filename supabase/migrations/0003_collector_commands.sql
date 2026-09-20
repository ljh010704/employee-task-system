-- Local browser-agent scheduling and heartbeat state.

alter table public.store_configs drop constraint if exists store_configs_status_check;
alter table public.store_configs add constraint store_configs_status_check
  check (status in ('setup_required', 'normal', 'reauth_required', 'paused', 'failed'));
alter table public.store_configs alter column status set default 'setup_required';
update public.store_configs set status = 'setup_required' where last_success_at is null and status = 'normal';

create table if not exists public.collector_agents (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null unique,
  agent_name text not null,
  status text not null default 'offline' check (status in ('online', 'offline')),
  last_heartbeat_at timestamptz,
  version text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collector_commands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_configs(id) on delete cascade,
  agent_id text,
  command_type text not null check (command_type in ('login', 'collect', 'reauth')),
  status text not null default 'pending' check (status in ('pending', 'running', 'success', 'failed', 'reauth_required')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  result jsonb not null default '{}'::jsonb
);

create index if not exists collector_commands_pending_idx
  on public.collector_commands(status, requested_at);
create index if not exists collector_commands_store_idx
  on public.collector_commands(store_id, requested_at desc);
create index if not exists collector_agents_heartbeat_idx
  on public.collector_agents(last_heartbeat_at desc);

alter table public.collector_agents enable row level security;
alter table public.collector_commands enable row level security;

drop policy if exists collector_agents_admin_all on public.collector_agents;
create policy collector_agents_admin_all on public.collector_agents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists collector_commands_admin_all on public.collector_commands;
create policy collector_commands_admin_all on public.collector_commands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.collector_agents, public.collector_commands from anon;
