-- One platform account can discover and own many stores. Credentials stay in
-- the local browser profile; only account metadata and discovered store links
-- are stored here.

alter table public.stores drop constraint if exists stores_category_check;
alter table public.stores add constraint stores_category_check
  check (category in ('服装', '手机壳', '食品', '未分组'));

-- Keep the existing manual-store RPC compatible with the new initial category.
create or replace function public.save_store_with_config(
  p_store_code text,
  p_store_name text,
  p_browser_profile_id text,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can save stores'; end if;
  if nullif(trim(p_store_code), '') is null then raise exception 'Store code is required'; end if;
  if nullif(trim(p_store_name), '') is null then raise exception 'Store name is required'; end if;
  if nullif(trim(p_browser_profile_id), '') is null then raise exception 'Browser profile is required'; end if;
  if p_category not in ('服装', '手机壳', '食品', '未分组') then raise exception 'Invalid store category'; end if;
  insert into public.store_configs (store_code, store_name, browser_profile_id)
  values (trim(p_store_code), trim(p_store_name), trim(p_browser_profile_id))
  on conflict (store_code) do update set store_name = excluded.store_name, browser_profile_id = excluded.browser_profile_id, updated_at = now();
  insert into public.stores (store_code, store_name, category, enabled)
  values (trim(p_store_code), trim(p_store_name), p_category, true)
  on conflict (store_code) do update set store_name = excluded.store_name, category = excluded.category, enabled = true, updated_at = now();
end;
$$;

create table if not exists public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_name text not null,
  platform text not null default 'douyin' check (platform = 'douyin'),
  browser_profile_id text not null unique,
  status text not null default 'setup_required'
    check (status in ('setup_required', 'discovering', 'ready', 'reauth_required', 'failed')),
  last_discovered_at timestamptz,
  last_error text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_account_stores (
  account_id uuid not null references public.platform_accounts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  discovered_at timestamptz not null default now(),
  primary key (account_id, store_id)
);

alter table public.collector_commands alter column store_id drop not null;
alter table public.collector_commands add column if not exists account_id uuid references public.platform_accounts(id) on delete cascade;
alter table public.collector_commands drop constraint if exists collector_commands_command_type_check;
alter table public.collector_commands add constraint collector_commands_command_type_check
  check (command_type in ('login', 'collect', 'reauth', 'discover_stores'));
alter table public.collector_commands add constraint collector_commands_target_check
  check (store_id is not null or account_id is not null);

create index if not exists platform_account_stores_account_idx on public.platform_account_stores(account_id);
create index if not exists platform_account_stores_store_idx on public.platform_account_stores(store_id);
create index if not exists collector_commands_account_idx on public.collector_commands(account_id, requested_at desc);

alter table public.platform_accounts enable row level security;
alter table public.platform_account_stores enable row level security;

drop policy if exists platform_accounts_admin_all on public.platform_accounts;
create policy platform_accounts_admin_all on public.platform_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists platform_account_stores_admin_all on public.platform_account_stores;
create policy platform_account_stores_admin_all on public.platform_account_stores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.platform_accounts, public.platform_account_stores from anon;

create or replace function public.save_platform_account(
  p_account_code text,
  p_account_name text,
  p_browser_profile_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can save platform accounts'; end if;
  if nullif(trim(p_account_code), '') is null then raise exception 'Account code is required'; end if;
  if nullif(trim(p_account_name), '') is null then raise exception 'Account name is required'; end if;
  if nullif(trim(p_browser_profile_id), '') is null then raise exception 'Browser profile is required'; end if;
  insert into public.platform_accounts (account_code, account_name, browser_profile_id)
  values (trim(p_account_code), trim(p_account_name), trim(p_browser_profile_id))
  on conflict (account_code) do update set
    account_name = excluded.account_name,
    browser_profile_id = excluded.browser_profile_id,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.queue_platform_account_discovery(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command_id uuid;
begin
  if not public.is_admin() then raise exception 'Only administrators can discover stores'; end if;
  if not exists (select 1 from public.platform_accounts where id = p_account_id and enabled) then
    raise exception 'Platform account not found or disabled';
  end if;
  update public.platform_accounts set status = 'discovering', last_error = null, updated_at = now() where id = p_account_id;
  insert into public.collector_commands (account_id, command_type)
  values (p_account_id, 'discover_stores')
  returning id into v_command_id;
  return v_command_id;
end;
$$;

revoke all on function public.save_platform_account(text, text, text) from public;
revoke all on function public.queue_platform_account_discovery(uuid) from public;
grant execute on function public.save_platform_account(text, text, text) to authenticated;
grant execute on function public.queue_platform_account_discovery(uuid) to authenticated;
