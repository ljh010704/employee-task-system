-- Multi-store collection foundation. The collector never receives or stores a
-- platform password; browser profiles remain on the local Windows machine.

create table if not exists public.store_configs (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  store_name text not null,
  browser_profile_id text not null,
  status text not null default 'normal' check (status in ('normal', 'reauth_required', 'paused', 'failed')),
  enabled boolean not null default true,
  enabled_data_types text[] not null default array['products', 'orders', 'after_sales']::text[],
  collection_scope jsonb not null default '{}'::jsonb,
  last_collected_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_configs(id) on delete cascade,
  platform_product_id text not null,
  name text,
  status text,
  source_url text,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, platform_product_id)
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_configs(id) on delete cascade,
  platform_order_id text not null,
  status text,
  amount numeric,
  source_url text,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, platform_order_id)
);

create table if not exists public.store_after_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_configs(id) on delete cascade,
  platform_after_sale_id text not null,
  platform_order_id text,
  status text,
  source_url text,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, platform_after_sale_id)
);

-- Supplier information is intentionally manual/optional in v1. The collector
-- stores only explicitly supplied values and never infers a purchase price.
create table if not exists public.supplier_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.store_configs(id) on delete set null,
  platform_product_id text,
  supplier_name text,
  source_url text,
  cost_price numeric,
  notes text,
  raw_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists supplier_items_store_product_unique_idx
  on public.supplier_items(store_id, platform_product_id);

create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_configs(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'partial', 'failed', 'reauth_required')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text,
  counts jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.collection_run_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.collection_runs(id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  page_url text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists source_store_id uuid references public.store_configs(id) on delete set null;
alter table public.tasks add column if not exists source_entity_type text;
alter table public.tasks add column if not exists source_entity_id text;

create unique index if not exists tasks_source_entity_unique_idx
  on public.tasks(source_store_id, source_entity_type, source_entity_id);
create index if not exists store_orders_store_status_idx on public.store_orders(store_id, status);
create index if not exists store_after_sales_store_status_idx on public.store_after_sales(store_id, status);
create index if not exists collection_runs_store_started_idx on public.collection_runs(store_id, started_at desc);
create index if not exists collection_run_logs_run_created_idx on public.collection_run_logs(run_id, created_at desc);

alter table public.store_configs enable row level security;
alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_after_sales enable row level security;
alter table public.supplier_items enable row level security;
alter table public.collection_runs enable row level security;
alter table public.collection_run_logs enable row level security;

drop policy if exists store_configs_admin_all on public.store_configs;
create policy store_configs_admin_all on public.store_configs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists store_products_admin_select on public.store_products;
create policy store_products_admin_select on public.store_products
  for select to authenticated using (public.is_admin());
drop policy if exists store_orders_admin_select on public.store_orders;
create policy store_orders_admin_select on public.store_orders
  for select to authenticated using (public.is_admin());
drop policy if exists store_after_sales_admin_select on public.store_after_sales;
create policy store_after_sales_admin_select on public.store_after_sales
  for select to authenticated using (public.is_admin());
drop policy if exists supplier_items_admin_all on public.supplier_items;
create policy supplier_items_admin_all on public.supplier_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists collection_runs_admin_select on public.collection_runs;
create policy collection_runs_admin_select on public.collection_runs
  for select to authenticated using (public.is_admin());
drop policy if exists collection_run_logs_admin_select on public.collection_run_logs;
create policy collection_run_logs_admin_select on public.collection_run_logs
  for select to authenticated using (public.is_admin());

revoke all on public.store_configs, public.store_products, public.store_orders,
  public.store_after_sales, public.supplier_items, public.collection_runs,
  public.collection_run_logs from anon;
