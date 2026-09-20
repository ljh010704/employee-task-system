import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

export const runtime = 'nodejs';

type CollectionRow = Record<string, unknown>;
type IngestBody = {
  store_code?: string;
  source?: string;
  auth_status?: 'normal' | 'reauth_required';
  collected_at?: string;
  products?: CollectionRow[];
  orders?: CollectionRow[];
  after_sales?: CollectionRow[];
  supplier_items?: CollectionRow[];
};

function text(row: CollectionRow, key: string) {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function raw(row: CollectionRow) {
  return row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : row;
}

async function createOrUpdateTask(client: ReturnType<typeof getCollectorAdmin>, storeId: string, entityType: string, entityId: string, title: string, description: string) {
  const { data: existing, error: findError } = await client
    .from('tasks')
    .select('id,status')
    .eq('source_store_id', storeId)
    .eq('source_entity_type', entityType)
    .eq('source_entity_id', entityId)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (existing.status === 'done') {
      const { error } = await client.from('tasks').update({ title, description, status: 'todo', updated_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) throw error;
    }
    return { id: existing.id, created: false };
  }
  const { data: task, error: insertError } = await client
    .from('tasks')
    .insert({ title, description, priority: 'medium', status: 'todo', source_store_id: storeId, source_entity_type: entityType, source_entity_id: entityId })
    .select('id')
    .single();
  if (insertError?.code === '23505') return { id: null, created: false };
  if (insertError) throw insertError;
  return { id: task.id, created: true };
}

export async function POST(request: Request) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: IngestBody;
  try {
    body = await request.json() as IngestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.store_code) return NextResponse.json({ error: 'store_code is required' }, { status: 400 });

  const collectionKeys = ['products', 'orders', 'after_sales', 'supplier_items'] as const;
  for (const key of collectionKeys) {
    const rows = body[key];
    if (rows !== undefined && (!Array.isArray(rows) || rows.length > 500 || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) {
      return NextResponse.json({ error: `${key} must be an array of at most 500 objects` }, { status: 400 });
    }
  }
  if (body.collected_at && Number.isNaN(Date.parse(body.collected_at))) {
    return NextResponse.json({ error: 'collected_at must be an ISO date-time' }, { status: 400 });
  }

  let client: ReturnType<typeof getCollectorAdmin>;
  try {
    client = getCollectorAdmin();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Collector server is not configured' }, { status: 503 });
  }
  const now = body.collected_at || new Date().toISOString();
  const { data: store, error: storeError } = await client.from('store_configs').select('id,status,enabled').eq('store_code', body.store_code).maybeSingle();
  if (storeError) return NextResponse.json({ error: storeError.message }, { status: 500 });
  if (!store) return NextResponse.json({ error: 'Unknown store_code' }, { status: 404 });
  if (!store.enabled || store.status === 'paused') return NextResponse.json({ error: 'Store is paused' }, { status: 409 });

  const { data: run, error: runError } = await client.from('collection_runs').insert({ store_id: store.id, status: body.auth_status === 'reauth_required' ? 'reauth_required' : 'running', source: body.source || 'local-browser', started_at: now }).select('id').single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  if (body.auth_status === 'reauth_required') {
    await client.from('store_configs').update({ status: 'reauth_required', last_collected_at: now, last_error: 'Browser session requires login', updated_at: now }).eq('id', store.id);
    await client.from('collection_runs').update({ finished_at: now, error: 'Browser session requires login' }).eq('id', run.id);
    return NextResponse.json({ run_id: run.id, status: 'reauth_required' });
  }

  const counts: Record<string, number> = { products: 0, orders: 0, after_sales: 0, supplier_items: 0, tasks_created: 0, errors: 0 };
  const errors: string[] = [];
  const ingestRows = async (rows: CollectionRow[] | undefined, table: string, idKey: string, extra: (row: CollectionRow) => CollectionRow = () => ({})) => {
    for (const row of rows || []) {
      const platformId = text(row, idKey);
      if (!platformId) { counts.errors++; errors.push(`${table}: missing ${idKey}`); continue; }
      try {
        const payload = { store_id: store.id, [idKey]: platformId, ...extra(row), source_url: text(row, 'source_url'), raw_data: raw(row), collected_at: now, updated_at: now };
        const { error } = await client.from(table).upsert(payload, { onConflict: `store_id,${idKey}` });
        if (error) throw error;
        counts[table === 'store_products' ? 'products' : table === 'store_orders' ? 'orders' : table === 'store_after_sales' ? 'after_sales' : 'supplier_items']++;
      } catch (error) { counts.errors++; errors.push(`${table}/${platformId}: ${error instanceof Error ? error.message : 'write failed'}`); }
    }
  };

  await ingestRows(body.products, 'store_products', 'platform_product_id', (row) => ({ name: text(row, 'name'), status: text(row, 'status') }));
  await ingestRows(body.orders, 'store_orders', 'platform_order_id', (row) => ({ status: text(row, 'status'), amount: typeof row.amount === 'number' ? row.amount : null }));
  await ingestRows(body.after_sales, 'store_after_sales', 'platform_after_sale_id', (row) => ({ platform_order_id: text(row, 'platform_order_id'), status: text(row, 'status') }));
  await ingestRows(body.supplier_items, 'supplier_items', 'platform_product_id', (row) => ({ supplier_name: text(row, 'supplier_name'), source_url: text(row, 'source_url'), cost_price: typeof row.cost_price === 'number' ? row.cost_price : null, notes: text(row, 'notes') }));

  for (const order of body.orders || []) {
    const orderId = text(order, 'platform_order_id');
    if (!orderId) continue;
    const status = text(order, 'status') || '待履约';
    if (!['completed', 'cancelled', '已完成', '已取消'].includes(status)) {
      for (const taskSpec of [
        { type: 'purchase', title: `订单待采购：${orderId}` },
        { type: 'fulfillment', title: `订单待发货：${orderId}` },
      ]) {
        try {
          const task = await createOrUpdateTask(client, store.id, taskSpec.type, orderId, taskSpec.title, `店铺 ${body.store_code} 的订单当前状态为“${status}”。`);
          if (task.created) counts.tasks_created++;
        } catch (error) { counts.errors++; errors.push(`task/${taskSpec.type}/${orderId}: ${error instanceof Error ? error.message : 'task failed'}`); }
      }
    }
    const logisticsStatus = text(order, 'logistics_status') || '';
    if (/异常|超时|滞留|退回/.test(logisticsStatus)) {
      try {
        const task = await createOrUpdateTask(client, store.id, 'logistics', orderId, `物流异常：${orderId}`, `店铺 ${body.store_code} 的订单物流状态为“${logisticsStatus}”。`);
        if (task.created) counts.tasks_created++;
      } catch (error) { counts.errors++; errors.push(`task/logistics/${orderId}: ${error instanceof Error ? error.message : 'task failed'}`); }
    }
  }

  for (const item of body.after_sales || []) {
    const afterSaleId = text(item, 'platform_after_sale_id');
    const status = text(item, 'status') || '待处理';
    if (!afterSaleId || ['completed', 'closed', '已完成', '已关闭'].includes(status)) continue;
    try {
      const task = await createOrUpdateTask(client, store.id, 'after_sale', afterSaleId, `售后待处理：${afterSaleId}`, `店铺 ${body.store_code} 的售后单当前状态为“${status}”。`);
      if (task.created) counts.tasks_created++;
    } catch (error) { counts.errors++; errors.push(`task/after_sale/${afterSaleId}: ${error instanceof Error ? error.message : 'task failed'}`); }
  }

  for (const product of body.products || []) {
    const productId = text(product, 'platform_product_id');
    const status = text(product, 'status') || '';
    if (!productId || !/异常|违规|封禁|停售|下架/.test(status)) continue;
    try {
      const task = await createOrUpdateTask(client, store.id, 'product', productId, `商品异常：${productId}`, `店铺 ${body.store_code} 的商品状态为“${status}”。`);
      if (task.created) counts.tasks_created++;
    } catch (error) { counts.errors++; errors.push(`task/product/${productId}: ${error instanceof Error ? error.message : 'task failed'}`); }
  }

  const runStatus = counts.errors ? (counts.products + counts.orders + counts.after_sales + counts.supplier_items ? 'partial' : 'failed') : 'success';
  const errorText = errors.slice(0, 20).join('\n') || null;
  if (counts.errors) {
    try {
      const task = await createOrUpdateTask(client, store.id, 'collector', 'health', `采集失败：${body.store_code}`, errorText || '采集出现未知错误，请检查采集日志。');
      if (task.created) counts.tasks_created++;
    } catch (error) { errors.push(`task/collector: ${error instanceof Error ? error.message : 'task failed'}`); }
  }
  await client.from('collection_runs').update({ status: runStatus, finished_at: new Date().toISOString(), counts, error: errorText }).eq('id', run.id);
  await client.from('collection_run_logs').insert({ run_id: run.id, level: counts.errors ? 'warning' : 'info', message: counts.errors ? 'Collection completed with errors' : 'Collection completed', details: { source: body.source || 'local-browser', errors } });
  await client.from('store_configs').update({ status: counts.errors ? 'failed' : 'normal', last_collected_at: now, last_success_at: counts.errors ? undefined : now, last_error: errorText, updated_at: now }).eq('id', store.id);

  return NextResponse.json({ run_id: run.id, status: runStatus, counts, errors });
}
