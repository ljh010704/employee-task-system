import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function isCollectorAuthorized(request: Request) {
  const expected = process.env.COLLECTOR_INGEST_TOKEN || '';
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function getCollectorAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Collector server credentials are not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
