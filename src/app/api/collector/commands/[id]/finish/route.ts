import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

type FinishBody = { status?: 'success' | 'failed' | 'reauth_required'; error?: string; result?: Record<string, unknown> };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  let body: FinishBody;
  try { body = await request.json() as FinishBody; } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.status || !['success', 'failed', 'reauth_required'].includes(body.status)) return NextResponse.json({ error: 'Invalid command status' }, { status: 400 });
  try {
    const client = getCollectorAdmin();
    const { data: command, error: findError } = await client.from('collector_commands').select('id,store_id,command_type').eq('id', id).maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!command) return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    const finishedAt = new Date().toISOString();
    const { error } = await client.from('collector_commands').update({ status: body.status, finished_at: finishedAt, error: body.error || null, result: body.result || {} }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.status === 'reauth_required') {
      await client.from('store_configs').update({ status: 'reauth_required', last_error: body.error || 'Browser session requires login', updated_at: finishedAt }).eq('id', command.store_id);
    } else if (body.status === 'success') {
      await client.from('store_configs').update({ status: 'normal', last_success_at: finishedAt, last_error: null, updated_at: finishedAt }).eq('id', command.store_id);
    }
    return NextResponse.json({ id, status: body.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Collector server is not configured' }, { status: 503 });
  }
}
