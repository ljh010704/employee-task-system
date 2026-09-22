import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

type DiscoveredStore = { store_code?: string; store_name?: string; category?: string };

export async function POST(request: Request) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { account_id?: string; stores?: DiscoveredStore[] };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.account_id || !Array.isArray(body.stores)) return NextResponse.json({ error: 'account_id and stores are required' }, { status: 400 });
  try {
    const client = getCollectorAdmin();
    const { data: account, error: accountError } = await client.from('platform_accounts').select('id,browser_profile_id').eq('id', body.account_id).maybeSingle();
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
    if (!account) return NextResponse.json({ error: 'Platform account not found' }, { status: 404 });
    const normalized = body.stores
      .map((store) => ({ code: String(store.store_code || '').trim(), name: String(store.store_name || '').trim() }))
      .filter((store) => store.code && store.name)
      .filter((store, index, all) => all.findIndex((candidate) => candidate.code === store.code) === index);
    for (const store of normalized) {
      const { data: master, error: masterError } = await client.from('stores').upsert({ store_code: store.code, store_name: store.name, category: '未分组', enabled: true, updated_at: new Date().toISOString() }, { onConflict: 'store_code' }).select('id,store_code,store_name').single();
      if (masterError || !master) throw masterError || new Error('Store master upsert failed');
      const { error: configError } = await client.from('store_configs').upsert({ store_code: store.code, store_name: store.name, browser_profile_id: account.browser_profile_id }, { onConflict: 'store_code' });
      if (configError) throw configError;
      const { error: linkError } = await client.from('platform_account_stores').upsert({ account_id: body.account_id, store_id: master.id, store_code_snapshot: master.store_code, store_name_snapshot: master.store_name, discovered_at: new Date().toISOString() }, { onConflict: 'account_id,store_id' });
      if (linkError) throw linkError;
    }
    return NextResponse.json({ account_id: body.account_id, discovered: normalized.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Store discovery failed' }, { status: 500 });
  }
}
