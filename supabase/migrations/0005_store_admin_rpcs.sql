-- Keep store master data and collector configuration in sync.

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
  on conflict (store_code) do update set
    store_name = excluded.store_name,
    browser_profile_id = excluded.browser_profile_id,
    updated_at = now();

  insert into public.stores (store_code, store_name, category, enabled)
  values (trim(p_store_code), trim(p_store_name), p_category, true)
  on conflict (store_code) do update set
    store_name = excluded.store_name,
    category = excluded.category,
    enabled = true,
    updated_at = now();
end;
$$;

create or replace function public.delete_store_with_config(p_store_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean := false;
begin
  if not public.is_admin() then raise exception 'Only administrators can delete stores'; end if;

  delete from public.stores where store_code = trim(p_store_code);
  v_deleted := found;

  delete from public.store_configs where store_code = trim(p_store_code);
  v_deleted := v_deleted or found;

  if not v_deleted then raise exception 'Store not found'; end if;
end;
$$;

revoke all on function public.save_store_with_config(text, text, text, text) from public;
revoke all on function public.delete_store_with_config(text) from public;
grant execute on function public.save_store_with_config(text, text, text, text) to authenticated;
grant execute on function public.delete_store_with_config(text) to authenticated;
