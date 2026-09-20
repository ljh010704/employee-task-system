import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

export async function POST(request: Request) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { agent_id?: string; agent_name?: string; version?: string; status?: 'online' | 'offline'; last_error?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.agent_id || !body.agent_name) return NextResponse.json({ error: 'agent_id and agent_name are required' }, { status: 400 });
  try {
    const client = getCollectorAdmin();
    const now = new Date().toISOString();
    const { error } = await client.from('collector_agents').upsert({ agent_id: body.agent_id, agent_name: body.agent_name, status: body.status || 'online', last_heartbeat_at: now, version: body.version || null, last_error: body.last_error || null, updated_at: now }, { onConflict: 'agent_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ agent_id: body.agent_id, status: 'accepted', last_heartbeat_at: now });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Collector server is not configured' }, { status: 503 });
  }
}
