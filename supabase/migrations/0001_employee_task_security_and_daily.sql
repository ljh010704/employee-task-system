-- Employee Task System: schema hardening, RLS and transactional task actions.
-- Apply this migration in the Supabase SQL editor or with `supabase db push`.

create extension if not exists pgcrypto;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;

create table if not exists public.task_daily_completions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  completion_date date not null default current_date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  operator_id uuid not null references auth.users(id) on delete restrict,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, completion_date)
);

create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);
create index if not exists tasks_created_at_idx on public.tasks(created_at desc);
create index if not exists task_logs_task_id_created_at_idx on public.task_logs(task_id, created_at desc);
create index if not exists task_daily_completions_date_idx on public.task_daily_completions(completion_date);

-- Preserve historical daily completions that were logged before the daily table existed.
insert into public.task_daily_completions (
  task_id, completion_date, status, operator_id, comment, created_at, updated_at
)
select
  l.task_id,
  (l.created_at at time zone 'Asia/Shanghai')::date,
  'done',
  l.operator_id,
  l.comment,
  l.created_at,
  l.created_at
from public.task_logs l
join public.tasks t on t.id = l.task_id
where t.is_daily = true
  and l.action like '%[已完成]%'
on conflict (task_id, completion_date) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    'employee'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tasks_select_visible on public.tasks;
create policy tasks_select_visible on public.tasks
  for select to authenticated
  using (public.is_admin() or assignee_id = auth.uid());

drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists tasks_update_visible on public.tasks;
create policy tasks_update_visible on public.tasks
  for update to authenticated
  using (public.is_admin() or assignee_id = auth.uid())
  with check (public.is_admin() or assignee_id = auth.uid());

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.is_admin());

drop policy if exists task_logs_select_visible on public.task_logs;
create policy task_logs_select_visible on public.task_logs
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_logs.task_id and t.assignee_id = auth.uid()
    )
  );

alter table public.task_daily_completions enable row level security;

drop policy if exists task_daily_completions_select_visible on public.task_daily_completions;
create policy task_daily_completions_select_visible on public.task_daily_completions
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_daily_completions.task_id and t.assignee_id = auth.uid()
    )
  );

-- All writes go through the RPCs below so permission checks and audit logging are atomic.
revoke insert, update, delete on public.tasks from authenticated;
revoke insert, update, delete on public.task_logs from authenticated;
revoke insert, update, delete on public.task_daily_completions from authenticated;

create or replace function public.create_task_with_log(
  p_title text,
  p_description text default null,
  p_priority text default 'medium',
  p_assignee_id uuid default null,
  p_due_date date default null,
  p_is_daily boolean default false
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create tasks';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Task title is required';
  end if;

  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid task priority';
  end if;

  insert into public.tasks (
    title, description, priority, assignee_id, creator_id, due_date, is_daily, status
  ) values (
    trim(p_title), nullif(trim(p_description), ''), p_priority, p_assignee_id,
    auth.uid(), p_due_date, coalesce(p_is_daily, false), 'todo'
  )
  returning * into v_task;

  insert into public.task_logs (task_id, operator_id, action, comment)
  values (
    v_task.id,
    auth.uid(),
    case when v_task.is_daily then '创建【每日打卡例行任务】' else '初始创建并分派' end,
    '新建任务'
  );

  return v_task;
end;
$$;

create or replace function public.transition_task_with_log(
  p_task_id uuid,
  p_next_status text,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_is_admin boolean := public.is_admin();
  v_current_status text;
begin
  perform set_config('timezone', 'Asia/Shanghai', true);
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;

  if not v_is_admin and v_task.assignee_id <> auth.uid() then
    raise exception 'You may only update tasks assigned to you';
  end if;

  if p_next_status not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid task status';
  end if;

  if v_task.is_daily then
    select coalesce(
      (select status from public.task_daily_completions
       where task_id = v_task.id and completion_date = current_date),
      'todo'
    ) into v_current_status;
  else
    v_current_status := v_task.status;
  end if;

  if not v_is_admin and not (
    (v_current_status = 'todo' and p_next_status = 'in_progress')
    or (v_current_status = 'in_progress' and p_next_status = 'review')
  ) then
    raise exception 'Invalid employee task transition';
  end if;

  if v_task.is_daily then
    insert into public.task_daily_completions (
      task_id, completion_date, status, operator_id, comment, updated_at
    ) values (
      v_task.id, current_date, p_next_status, auth.uid(), nullif(trim(p_comment), ''), now()
    )
    on conflict (task_id, completion_date) do update set
      status = excluded.status,
      operator_id = excluded.operator_id,
      comment = excluded.comment,
      updated_at = now();
  else
    if v_is_admin and v_task.status <> p_next_status and v_task.status = 'done' and p_next_status <> 'todo' then
      raise exception 'Completed tasks must be reset before changing status';
    end if;

    update public.tasks
    set status = p_next_status, updated_at = now()
    where id = v_task.id;
    select * into v_task from public.tasks where id = p_task_id;
  end if;

  insert into public.task_logs (task_id, operator_id, action, comment)
  values (
    v_task.id,
    auth.uid(),
    '流转至 [' || case p_next_status
      when 'todo' then '待处理'
      when 'in_progress' then '进行中'
      when 'review' then '待验收'
      when 'done' then '已完成'
    end || ']',
    nullif(trim(p_comment), '')
  );

  return v_task;
end;
$$;

create or replace function public.delete_task_with_log(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete tasks';
  end if;
  delete from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;
end;
$$;

revoke all on function public.create_task_with_log(text, text, text, uuid, date, boolean) from public;
revoke all on function public.transition_task_with_log(uuid, text, text) from public;
revoke all on function public.delete_task_with_log(uuid) from public;
grant execute on function public.create_task_with_log(text, text, text, uuid, date, boolean) to authenticated;
grant execute on function public.transition_task_with_log(uuid, text, text) to authenticated;
grant execute on function public.delete_task_with_log(uuid) to authenticated;

-- Ensure Realtime can notify clients about daily completion changes.
do $$
begin
  alter publication supabase_realtime add table public.task_daily_completions;
exception when duplicate_object then
  null;
end $$;
