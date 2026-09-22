import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = request.headers.get('x-collector-agent-id');
  const { id } = await context.params;
  if (!agentId) return NextResponse.json({ error: 'x-collector-agent-id is required' }, { status: 400 });
  try {
    const client = getCollectorAdmin();
    const { data, error } = await client.from('collector_commands').update({ status: 'running', agent_id: agentId, started_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending').select('id,store_id,account_id,command_type,status').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Command is no longer pending' }, { status: 409 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Collector server is not configured' }, { status: 503 });
  }
}
