'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { StoreCategory } from '@/types';

type StoreStatus = 'setup_required' | 'normal' | 'reauth_required' | 'paused' | 'failed';
type Store = {
  id: string;
  store_code: string;
  store_name: string;
  browser_profile_id: string;
  status: StoreStatus;
  enabled: boolean;
  last_collected_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};
type Run = {
  id: string;
  store_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  counts: Record<string, number>;
  error: string | null;
};
type Agent = { agent_id: string; agent_name: string; status: 'online' | 'offline'; last_heartbeat_at: string | null };
type Command = { id: string; store_id: string; command_type: string; status: string; agent_id: string | null };
type MasterStore = { id: string; store_code: string; store_name: string; category: StoreCategory; notes: string | null; enabled: boolean };

const STATUS: Record<StoreStatus, { label: string; className: string }> = {
  setup_required: { label: '待首次登录', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  normal: { label: '正常', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  reauth_required: { label: '需要重新登录', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  paused: { label: '已暂停', className: 'bg-stone-100 text-stone-600 border-stone-200' },
  failed: { label: '采集失败', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '暂无';
}

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [masterStores, setMasterStores] = useState<MasterStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ store_code: '', store_name: '', browser_profile_id: '', category: '服装' as StoreCategory });
  const [masterCategoryFilter, setMasterCategoryFilter] = useState<'all' | StoreCategory>('all');

  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data: storeData, error: storeError }, { data: runData, error: runError }, { data: agentData, error: agentError }, { data: commandData, error: commandError }, { data: masterStoreData, error: masterStoreError }] = await Promise.all([
      supabase.from('store_configs').select('id,store_code,store_name,browser_profile_id,status,enabled,last_collected_at,last_success_at,last_error').order('store_code'),
      supabase.from('collection_runs').select('id,store_id,status,started_at,finished_at,counts,error').order('started_at', { ascending: false }).limit(30),
      supabase.from('collector_agents').select('agent_id,agent_name,status,last_heartbeat_at').order('last_heartbeat_at', { ascending: false }),
      supabase.from('collector_commands').select('id,store_id,command_type,status,agent_id').in('status', ['pending', 'running']).order('requested_at', { ascending: false }),
      supabase.from('stores').select('id,store_code,store_name,category,notes,enabled').order('category').order('store_name'),
    ]);
    if (storeError || runError || agentError || commandError || masterStoreError) setError(storeError?.message || runError?.message || agentError?.message || commandError?.message || masterStoreError?.message || '店铺数据加载失败');
    setStores((storeData || []) as Store[]);
    setRuns((runData || []) as Run[]);
    setAgents((agentData || []) as Agent[]);
    setCommands((commandData || []) as Command[]);
    setMasterStores((masterStoreData || []) as MasterStore[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const createStore = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.store_code.trim() || !form.store_name.trim() || !form.browser_profile_id.trim() || saving) return;
    setSaving(true);
    const { error: insertError } = await supabase.from('store_configs').insert({
      store_code: form.store_code.trim(),
      store_name: form.store_name.trim(),
      browser_profile_id: form.browser_profile_id.trim(),
    });
    if (insertError) setError(insertError.message);
    else {
      const { error: masterError } = await supabase.from('stores').insert({ store_code: form.store_code.trim(), store_name: form.store_name.trim(), category: form.category });
      if (masterError) setError(masterError.message);
      setForm({ store_code: '', store_name: '', browser_profile_id: '', category: '服装' });
      await load();
    }
    setSaving(false);
  };

  const toggleMasterStore = async (store: MasterStore) => {
    const { error: updateError } = await supabase.from('stores').update({ enabled: !store.enabled, updated_at: new Date().toISOString() }).eq('id', store.id);
    if (updateError) setError(updateError.message); else await load();
  };

  const toggleStore = async (store: Store) => {
    const paused = store.status !== 'paused';
    const { error: updateError } = await supabase.from('store_configs').update({ enabled: !paused, status: paused ? 'paused' : (store.last_success_at ? 'normal' : 'setup_required'), updated_at: new Date().toISOString() }).eq('id', store.id);
    if (updateError) setError(updateError.message);
    else await load();
  };

  const queueCommand = async (storeId: string, commandType: 'login' | 'collect' | 'reauth') => {
    const { error: commandError } = await supabase.from('collector_commands').insert({ store_id: storeId, command_type: commandType });
    if (commandError) setError(commandError.message);
    else await load();
  };

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-stone-800 p-5 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">← 返回任务看板</Link>
            <h1 className="text-2xl font-bold text-stone-900 mt-2">多店采集管理</h1>
            <p className="text-sm text-stone-500 mt-1">登录态保留在本地浏览器；这里管理店铺状态和采集结果。</p>
          </div>
          <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-xl border border-stone-300 bg-white text-sm font-semibold hover:bg-stone-50">刷新状态</button>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          采集代理：{agents.filter((agent) => agent.status === 'online' && agent.last_heartbeat_at && Date.now() - new Date(agent.last_heartbeat_at).getTime() < 120000).length} 个在线
        </div>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className="bg-white rounded-2xl border border-stone-200 p-5">
          <h2 className="font-bold text-stone-900">添加店铺配置</h2>
          <form onSubmit={createStore} className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            <input value={form.store_code} onChange={(e) => setForm({ ...form, store_code: e.target.value })} placeholder="店铺编号，如 store-001" className="px-3 py-2.5 rounded-xl border border-stone-300 text-sm" />
            <input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} placeholder="店铺名称" className="px-3 py-2.5 rounded-xl border border-stone-300 text-sm" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as StoreCategory })} className="px-3 py-2.5 rounded-xl border border-stone-300 text-sm bg-white">
              <option value="服装">服装</option><option value="手机壳">手机壳</option><option value="食品">食品</option>
            </select>
            <input value={form.browser_profile_id} onChange={(e) => setForm({ ...form, browser_profile_id: e.target.value })} placeholder="本地浏览器配置标识" className="px-3 py-2.5 rounded-xl border border-stone-300 text-sm" />
            <button disabled={saving} className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold disabled:opacity-50">{saving ? '保存中…' : '保存店铺'}</button>
          </form>
          <p className="text-xs text-stone-500 mt-3">保存时同时建立店铺主数据和本地采集配置；停用店铺只影响新任务选择，不删除历史任务快照。</p>
        </section>

        <section className="bg-white rounded-2xl border border-stone-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-stone-900">店铺主数据</h2><p className="text-xs text-stone-500 mt-1">管理员维护品类和启用状态，任务会保存店铺名称快照。</p></div>
            <select value={masterCategoryFilter} onChange={(e) => setMasterCategoryFilter(e.target.value as 'all' | StoreCategory)} className="px-3 py-2 rounded-xl border border-stone-300 text-sm bg-white">
              <option value="all">全部品类</option><option value="服装">服装</option><option value="手机壳">手机壳</option><option value="食品">食品</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-4">
            {masterStores.filter((store) => masterCategoryFilter === 'all' || store.category === masterCategoryFilter).map((store) => (
              <div key={store.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                <div><div className="font-semibold text-sm text-stone-800">{store.store_name}</div><div className="text-xs text-stone-500">{store.store_code} · {store.category}</div></div>
                <button type="button" onClick={() => void toggleMasterStore(store)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${store.enabled ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-stone-500 border-stone-200 bg-stone-50'}`}>{store.enabled ? '启用' : '已停用'}</button>
              </div>
            ))}
            {!masterStores.length && <div className="text-sm text-stone-500">暂无店铺主数据</div>}
          </div>
        </section>

        {loading ? <div className="text-sm text-stone-500">加载中…</div> : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {stores.map((store) => {
              const status = STATUS[store.status] || STATUS.failed;
              return <article key={store.id} className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-bold text-stone-900">{store.store_name}</h2><p className="text-xs text-stone-500 font-mono mt-1">{store.store_code}</p></div>
                  <span className={`px-2 py-1 rounded-lg border text-xs font-semibold ${status.className}`}>{status.label}</span>
                </div>
                <div className="text-xs text-stone-500 space-y-1"><div>浏览器配置：<span className="text-stone-800">{store.browser_profile_id}</span></div><div>最近采集：<span className="text-stone-800">{formatDate(store.last_collected_at)}</span></div><div>最近成功：<span className="text-stone-800">{formatDate(store.last_success_at)}</span></div></div>
                {store.last_error && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg p-2 whitespace-pre-wrap">{store.last_error}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => void queueCommand(store.id, 'login')} className="px-2.5 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold">首次登录</button>
                  <button type="button" onClick={() => void queueCommand(store.id, 'collect')} className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">立即采集</button>
                  <button type="button" onClick={() => void queueCommand(store.id, 'reauth')} className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-semibold">重新登录</button>
                  <button type="button" onClick={() => void toggleStore(store)} className="px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 text-xs font-semibold">{store.status === 'paused' ? '恢复采集' : '暂停采集'}</button>
                </div>
                {commands.filter((command) => command.store_id === store.id).map((command) => <div key={command.id} className="text-xs text-blue-700">当前命令：{command.command_type} · {command.status}</div>)}
              </article>;
            })}
            {!stores.length && <div className="md:col-span-2 xl:col-span-3 text-sm text-stone-500 bg-white rounded-2xl border border-dashed border-stone-300 p-8 text-center">暂无店铺配置，请先添加一个测试店铺。</div>}
          </section>
        )}

        <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="p-5 border-b border-stone-100"><h2 className="font-bold text-stone-900">最近采集批次</h2></div>
          <div className="divide-y divide-stone-100">
            {runs.map((run) => <div key={run.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm"><div><div className="font-semibold text-stone-800">{stores.find((store) => store.id === run.store_id)?.store_name || run.store_id}</div><div className="text-xs text-stone-500 mt-1">{formatDate(run.started_at)} · {run.status}</div></div><div className="text-xs text-stone-600">成功 {run.counts?.products || 0} 商品 / {run.counts?.orders || 0} 订单 / {run.counts?.after_sales || 0} 售后，错误 {run.counts?.errors || 0}</div></div>)}
            {!runs.length && <div className="p-8 text-center text-sm text-stone-500">暂无采集记录</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
