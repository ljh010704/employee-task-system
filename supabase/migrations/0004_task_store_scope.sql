-- Store master data and immutable task-to-store snapshots.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  store_name text not null,
  category text not null check (category in ('服装', '手机壳', '食品')),
  notes text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists store_scope_type text not null default 'none'
  check (store_scope_type in ('none', 'single', 'multiple', 'category'));
alter table public.tasks add column if not exists store_category text;

create table if not exists public.task_stores (
  task_id uuid not null references public.tasks(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  store_code_snapshot text not null,
  store_name_snapshot text not null,
  category_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (task_id, store_code_snapshot)
);

create index if not exists stores_category_enabled_idx on public.stores(category, enabled, store_name);
create index if not exists task_stores_store_id_idx on public.task_stores(store_id);
create index if not exists task_stores_task_id_idx on public.task_stores(task_id);

alter table public.stores enable row level security;
alter table public.task_stores enable row level security;

drop policy if exists stores_select_visible on public.stores;
create policy stores_select_visible on public.stores
  for select to authenticated
  using (enabled or public.is_admin());

drop policy if exists stores_admin_write on public.stores;
create policy stores_admin_write on public.stores
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists task_stores_select_visible on public.task_stores;
create policy task_stores_select_visible on public.task_stores
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.tasks t where t.id = task_stores.task_id and t.assignee_id = auth.uid())
  );

revoke all on public.stores, public.task_stores from anon;
revoke insert, update, delete on public.stores, public.task_stores from authenticated;

create or replace function public.create_task_with_stores(
  p_title text,
  p_description text default null,
  p_priority text default 'medium',
  p_assignee_id uuid default null,
  p_due_date date default null,
  p_is_daily boolean default false,
  p_store_scope_type text default 'none',
  p_store_category text default null,
  p_store_ids uuid[] default '{}'
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_store record;
  v_store_ids uuid[] := coalesce(p_store_ids, '{}');
  v_count integer;
begin
  if not public.is_admin() then raise exception 'Only administrators can create tasks'; end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'Task title is required'; end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid task priority'; end if;
  if p_store_scope_type not in ('none', 'single', 'multiple', 'category') then raise exception 'Invalid store scope'; end if;
  if p_store_scope_type = 'category' and p_store_category not in ('服装', '手机壳', '食品') then raise exception 'A valid store category is required'; end if;
  if p_store_scope_type = 'single' and cardinality(v_store_ids) <> 1 then raise exception 'Single-store tasks require exactly one store'; end if;
  if p_store_scope_type = 'multiple' and cardinality(v_store_ids) < 1 then raise exception 'Multi-store tasks require at least one store'; end if;

  if p_store_scope_type = 'category' then
    select count(*) into v_count from public.stores where enabled and category = p_store_category;
    if v_count = 0 then raise exception 'No enabled stores exist in this category'; end if;
  elsif p_store_scope_type in ('single', 'multiple') then
    select count(*) into v_count from public.stores where enabled and id = any(v_store_ids);
    if v_count <> cardinality(v_store_ids) then raise exception 'All selected stores must be enabled'; end if;
  end if;

  insert into public.tasks (title, description, priority, assignee_id, creator_id, due_date, is_daily, status, store_scope_type, store_category)
  values (trim(p_title), nullif(trim(p_description), ''), p_priority, p_assignee_id, auth.uid(), p_due_date, coalesce(p_is_daily, false), 'todo', p_store_scope_type, nullif(trim(p_store_category), ''))
  returning * into v_task;

  if p_store_scope_type = 'category' then
    insert into public.task_stores (task_id, store_id, store_code_snapshot, store_name_snapshot, category_snapshot)
    select v_task.id, s.id, s.store_code, s.store_name, s.category from public.stores s where s.enabled and s.category = p_store_category;
  elsif p_store_scope_type in ('single', 'multiple') then
    insert into public.task_stores (task_id, store_id, store_code_snapshot, store_name_snapshot, category_snapshot)
    select v_task.id, s.id, s.store_code, s.store_name, s.category from public.stores s where s.id = any(v_store_ids);
  end if;

  insert into public.task_logs (task_id, operator_id, action, comment)
  values (v_task.id, auth.uid(), case when v_task.is_daily then '创建【每日打卡例行任务】' else '初始创建并分派' end, '新建任务');
  return v_task;
end;
$$;

revoke all on function public.create_task_with_stores(text, text, text, uuid, date, boolean, text, text, uuid[]) from public;
grant execute on function public.create_task_with_stores(text, text, text, uuid, date, boolean, text, text, uuid[]) to authenticated;
