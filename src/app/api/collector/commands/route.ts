import { NextResponse } from 'next/server';
import { getCollectorAdmin, isCollectorAuthorized } from '@/lib/collectorServer';

export async function GET(request: Request) {
  if (!isCollectorAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = new URL(request.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
  try {
    const client = getCollectorAdmin();
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await client.from('collector_commands').update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Command timed out or agent restarted' }).eq('agent_id', agentId).eq('status', 'running').lt('started_at', staleBefore);
    const { data, error } = await client.from('collector_commands').select('id,store_id,agent_id,command_type,status,requested_at,started_at,store_configs(store_code,browser_profile_id,status,enabled)').eq('status', 'pending').order('requested_at').limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data || []).filter((command) => !command.agent_id || command.agent_id === agentId).slice(0, 1));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Collector server is not configured' }, { status: 503 });
  }
}
