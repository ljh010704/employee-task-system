'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DailyCompletion, Profile, Store, StoreCategory, StoreScopeType, Task, TaskLog, TaskPriority, TaskStatus } from '@/types';

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; badge: string; border: string }> = {
  todo: { label: '待处理', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700', border: 'border-l-slate-400' },
  in_progress: { label: '进行中', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border border-blue-200', border: 'border-l-blue-500' },
  review: { label: '待验收', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 border border-amber-200', border: 'border-l-amber-500' },
  done: { label: '已完成', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200', border: 'border-l-emerald-500' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; badge: string; bar: string }> = {
  low: { label: '低优先级', badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
  medium: { label: '中等', badge: 'bg-blue-50 text-blue-700 border border-blue-100', bar: 'bg-blue-400' },
  high: { label: '重要', badge: 'bg-amber-50 text-amber-800 border border-amber-200', bar: 'bg-amber-500' },
  urgent: { label: '紧急', badge: 'bg-red-50 text-red-700 border border-red-200 font-semibold', bar: 'bg-red-500' },
};

function getAvatarInfo(name?: string | null) {
  if (!name) return { initial: '?', bg: 'bg-stone-500' };
  const initial = name.trim().slice(0, 1).toUpperCase();
  const colors = [
    'bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 
    'bg-amber-600', 'bg-rose-600', 'bg-teal-600', 'bg-cyan-600'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return { initial, bg: colors[Math.abs(hash) % colors.length] };
}

function getDueStatus(dueDateStr?: string | null) {
  if (!dueDateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `逾期 ${Math.abs(diffDays)} 天`, className: 'bg-rose-50 text-rose-700 border border-rose-200 font-medium' };
  } else if (diffDays === 0) {
    return { text: '今日截止', className: 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold' };
  } else if (diffDays === 1) {
    return { text: '明日截止', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  } else {
    return { text: `剩 ${diffDays} 天`, className: 'bg-slate-100 text-slate-600' };
  }
}

function getTodayDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'task';
  title?: string;
  message: string;
  taskId?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const currentUserRef = useRef<Profile | null>(null);
  currentUserRef.current = currentUser;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // 手机端默认折叠侧边栏
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [navTab, setNavTab] = useState<'all' | 'mine' | 'daily' | 'review' | 'done'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'daily' | 'once'>('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | StoreCategory>('all');

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' | 'task' = 'success', title?: string, taskId?: string) => {
    const id = Math.random().toString(36).substring(2, 8);
    setToasts((prev) => [...prev, { id, type, title, message, taskId }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const selectedTaskRef = useRef<Task | null>(null);
  selectedTaskRef.current = selectedTask;
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [dailyCompletions, setDailyCompletions] = useState<DailyCompletion[]>([]);
  const [detailLoadError, setDetailLoadError] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

  // 新建任务：支持选择每日重复任务
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newIsDaily, setNewIsDaily] = useState(false);
  const [newStoreScope, setNewStoreScope] = useState<StoreScopeType>('none');
  const [newStoreCategory, setNewStoreCategory] = useState<'all' | StoreCategory>('all');
  const [newStoreIds, setNewStoreIds] = useState<string[]>([]);
  const [storeSearch, setStoreSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [transitioningTaskId, setTransitioningTaskId] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setErrorMessage('');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,role,created_at')
        .eq('id', user.id)
        .single();
      if (profileError || !profile) throw profileError || new Error('当前账号没有员工档案');
      setCurrentUser(profile);

      const { data: profileList, error: profileListError } = await supabase
        .from('profiles')
        .select('id,full_name,role,created_at')
        .order('full_name');
      if (profileListError) throw profileListError;
      setEmployees(profileList || []);

      const { data: storeList, error: storeError } = await supabase
        .from('stores')
        .select('*')
        .eq('enabled', true)
        .order('category')
        .order('store_name');
      if (storeError) throw storeError;
      setStores((storeList || []) as Store[]);

      const { data: taskList, error: taskError } = await supabase
        .from('tasks')
        .select('*, task_stores(*)')
        .order('created_at', { ascending: false });
      if (taskError) throw taskError;

      const today = getTodayDate();
      const dailyTaskIds = (taskList || []).filter((task) => task.is_daily).map((task) => task.id);
      const dailyStatus = new Map<string, TaskStatus>();
      if (dailyTaskIds.length > 0) {
        const { data: completions, error: completionError } = await supabase
          .from('task_daily_completions')
          .select('task_id,status')
          .eq('completion_date', today)
          .in('task_id', dailyTaskIds);
        if (completionError) throw completionError;
        completions?.forEach((completion) => dailyStatus.set(completion.task_id, completion.status as TaskStatus));
      }

      setTasks((taskList || []).map((task) => {
        if (!task.is_daily) return task;
        const todayStatus = dailyStatus.get(task.id) || 'todo';
        return { ...task, daily_status_today: todayStatus, daily_completed_today: todayStatus === 'done' };
      }));
    } catch (error) {
      console.error('Failed to load dashboard data', error);
      setErrorMessage(error instanceof Error ? error.message : '数据加载失败，请稍后重试');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }

    const channel = supabase
      .channel('realtime-tasks-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const myId = currentUserRef.current?.id;
          const isAdmin = currentUserRef.current?.role === 'admin';

          if (payload.eventType === 'INSERT') {
            const newTask = payload.new as Task;
            if (newTask.assignee_id === myId) {
              playChime();
              triggerToast(
                `主管给您指派了新任务：【${newTask.title}】`,
                'task',
                '🔔 收到新任务派发！',
                newTask.id
              );
            } else if (isAdmin && newTask.creator_id !== myId) {
              triggerToast(`团队有新任务创建：【${newTask.title}】`, 'info');
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as Task;
            if (isAdmin && updatedTask.status === 'review') {
              playChime();
              triggerToast(
                `任务【${updatedTask.title}】已提交验收，请复核！`,
                'task',
                '📋 待验收审批提醒',
                updatedTask.id
              );
            } else if (updatedTask.assignee_id === myId) {
              triggerToast(`您负责的任务【${updatedTask.title}】状态已更新`, 'info');
            }
          }

          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_daily_completions' },
        (payload) => {
          void loadData(true);
          const changedTaskId = (payload.new as { task_id?: string }).task_id || (payload.old as { task_id?: string }).task_id;
          if (selectedTaskRef.current?.id === changedTaskId) void openDetailDrawer(selectedTaskRef.current);
        },
      )
      .subscribe();

    const timer = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const openDetailDrawer = async (task: Task) => {
    setSelectedTask(task);
    setStatusComment('');
    setDetailLoadError('');
    setTaskLogs([]);
    setDailyCompletions([]);
    const [{ data: logs, error: logsError }, { data: completions, error: completionsError }] = await Promise.all([
      supabase.from('task_logs').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
      supabase.from('task_daily_completions').select('*').eq('task_id', task.id).order('completion_date', { ascending: false }),
    ]);
    if (logsError) triggerToast(`历史记录加载失败：${logsError.message}`, 'error');
    if (completionsError && task.is_daily) triggerToast(`每日完成记录加载失败：${completionsError.message}`, 'error');
    if (logsError || (task.is_daily && completionsError)) setDetailLoadError('部分详情记录加载失败，请稍后重试。');
    setTaskLogs(logs || []);
    setDailyCompletions(completions || []);
    if (task.is_daily && !completionsError) {
      const todayStatus = (completions || []).find((completion) => completion.completion_date === getTodayDate())?.status || 'todo';
      setSelectedTask((current) => current?.id === task.id ? { ...current, daily_status_today: todayStatus } : current);
    }
  };

  const handleUpdateStatus = async (taskId: string, nextStatus: TaskStatus, comment: string) => {
    if (!currentUser) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || (currentUser.role !== 'admin' && task.assignee_id !== currentUser.id)) {
      triggerToast('你没有权限操作这个任务', 'error');
      return;
    }
    if (transitioningTaskId) return;

    setTransitioningTaskId(taskId);
    try {
      const { error } = await supabase.rpc('transition_task_with_log', {
        p_task_id: taskId,
        p_next_status: nextStatus,
        p_comment: comment.trim() || null,
      });
      if (error) throw error;
      triggerToast(`任务已成功流转至【${STATUS_CONFIG[nextStatus].label}】`, 'success');
      setSelectedTask(null);
      await loadData(true);
    } catch (error) {
      triggerToast(`更新状态失败：${error instanceof Error ? error.message : '请稍后重试'}`, 'error');
    } finally {
      setTransitioningTaskId(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || currentUser.role !== 'admin' || !newTitle.trim() || submitting) return;
    const selectedStoreIds = newStoreScope === 'category'
      ? stores.filter((store) => store.category === newStoreCategory && store.enabled).map((store) => store.id)
      : newStoreIds;
    if (newStoreScope === 'single' && selectedStoreIds.length !== 1) {
      triggerToast('单店任务必须选择一家店铺', 'error');
      return;
    }
    if (newStoreScope === 'multiple' && selectedStoreIds.length === 0) {
      triggerToast('多店任务至少选择一家店铺', 'error');
      return;
    }
    if (newStoreScope === 'category' && newStoreCategory === 'all') {
      triggerToast('请选择任务品类', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('create_task_with_stores', {
        p_title: newTitle.trim(),
        p_description: newDesc.trim() || null,
        p_priority: newPriority,
        p_assignee_id: newAssignee || null,
        p_due_date: newDueDate || null,
        p_is_daily: newIsDaily,
        p_store_scope_type: newStoreScope,
        p_store_category: newStoreCategory === 'all' ? null : newStoreCategory,
        p_store_ids: selectedStoreIds,
      });
      if (error) throw error;
      triggerToast('任务发布成功！', 'success');
      setShowCreateDrawer(false);
      setNewTitle('');
      setNewDesc('');
      setNewDueDate('');
      setNewAssignee('');
      setNewPriority('medium');
      setNewIsDaily(false);
      setNewStoreScope('none');
      setNewStoreCategory('all');
      setNewStoreIds([]);
      setStoreSearch('');
      await loadData(true);
    } catch (error) {
      triggerToast(`创建任务失败：${error instanceof Error ? error.message : '请稍后重试'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (currentUser?.role !== 'admin' || !confirm('确定彻底删除此任务？关联的流转记录也将被清除。')) return;
    try {
      const { error } = await supabase.rpc('delete_task_with_log', { p_task_id: taskId });
      if (error) throw error;
      triggerToast('任务已删除', 'info');
      setSelectedTask(null);
      await loadData(true);
    } catch (error) {
      triggerToast(`删除失败：${error instanceof Error ? error.message : '请稍后重试'}`, 'error');
    }
  };

  const getEmpName = (id?: string | null) => {
    if (!id) return '未指定';
    const match = employees.find((e) => e.id === id);
    return match ? match.full_name : '员工';
  };

  const getTaskStores = (task: Task) => task.task_stores || [];

  const getDisplayStatus = (task: Task): TaskStatus => task.is_daily ? (task.daily_status_today || 'todo') : task.status;

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (navTab === 'mine' && t.assignee_id !== currentUser?.id) return false;
      if (navTab === 'daily' && !t.is_daily) return false;
      if (navTab === 'review' && getDisplayStatus(t) !== 'review') return false;
      if (navTab === 'done' && (t.is_daily || t.status !== 'done')) return false;

      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (typeFilter === 'daily' && !t.is_daily) return false;
      if (typeFilter === 'once' && t.is_daily) return false;

      const taskStores = getTaskStores(t);
      if (storeFilter !== 'all' && !taskStores.some((store) => store.store_id === storeFilter)) return false;
      if (categoryFilter !== 'all' && !taskStores.some((store) => store.category_snapshot === categoryFilter)) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(query);
        const descMatch = t.description?.toLowerCase().includes(query);
        const nameMatch = getEmpName(t.assignee_id).toLowerCase().includes(query);
        const storeMatch = taskStores.some((store) => `${store.store_name_snapshot} ${store.store_code_snapshot} ${store.category_snapshot}`.toLowerCase().includes(query));
        if (!titleMatch && !descMatch && !nameMatch && !storeMatch) return false;
      }

      return true;
    });
  }, [tasks, navTab, priorityFilter, typeFilter, searchQuery, currentUser, storeFilter, categoryFilter]);

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-stone-800 flex flex-col lg:flex-row antialiased selection:bg-stone-200 text-sm relative">
      {/* 实时新任务浮动提醒 */}
      <div className="fixed top-5 right-5 z-[999] flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => {
              if (toast.taskId) {
                const target = tasks.find((t) => t.id === toast.taskId);
                if (target) openDetailDrawer(target);
              }
            }}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border text-sm backdrop-blur-md transition-all animate-in slide-in-from-top-4 cursor-pointer ${
              toast.type === 'task'
                ? 'bg-amber-50/95 border-amber-300 text-amber-950 ring-2 ring-amber-400/50'
                : toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : 'bg-stone-900/90 border-stone-800 text-white'
            }`}
          >
            {toast.title && <div className="font-bold text-sm mb-1">{toast.title}</div>}
            <div className="text-xs font-medium leading-relaxed">{toast.message}</div>
            {toast.taskId && (
              <div className="mt-2 text-[11px] font-bold text-amber-800 underline underline-offset-2">
                点击卡片直接查看详情 →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 手机端遮罩层 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* 侧边栏：手机端为抽屉，电脑端为常驻侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#f7f6f3] border-r border-[#e9e8e4] flex flex-col transition-all duration-300 ease-in-out w-72 2xl:w-80 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-r-0'
        }`}
      >
        <div className="p-5 flex items-center justify-between border-b border-[#eae9e5]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              T
            </div>
            <div className="truncate">
              <div className="text-sm font-bold text-stone-800 truncate">TaskHub 团队工作区</div>
              <div className="text-xs text-stone-500 font-mono">Mobile & PC</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭侧边栏"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-stone-200 text-stone-500"
          >
            ✕
          </button>
        </div>

        <div className="p-4 m-3.5 rounded-xl bg-white border border-[#eae9e5] shadow-xs flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${getAvatarInfo(currentUser?.full_name).bg} text-white flex items-center justify-center font-semibold text-sm shrink-0 shadow-inner`}>
            {getAvatarInfo(currentUser?.full_name).initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-stone-800 truncate">{currentUser?.full_name || '用户'}</div>
            <div className="text-xs text-stone-500 truncate mt-0.5">
              {currentUser?.role === 'admin' ? '主管 / 管理员' : '团队成员'}
            </div>
          </div>
        </div>

        {currentUser?.role === 'admin' && (
          <div className="px-3.5 pb-2">
            <button
              onClick={() => { setShowCreateDrawer(true); if (window.innerWidth < 1024) setSidebarOpen(false); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium shadow-sm transition hover:scale-[0.99] active:scale-[0.97]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              发布新任务
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto text-sm">
          <button
            onClick={() => { setNavTab('all'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              navTab === 'all' ? 'bg-[#eae8e1] text-stone-900 font-bold' : 'text-stone-600 hover:bg-[#eeebe3]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              全部任务看板
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-semibold">{tasks.length}</span>
          </button>

          <button
            onClick={() => { setNavTab('mine'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              navTab === 'mine' ? 'bg-[#eae8e1] text-stone-900 font-bold' : 'text-stone-600 hover:bg-[#eeebe3]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              指派给我的任务
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-semibold">
              {tasks.filter((t) => t.assignee_id === currentUser?.id).length}
            </span>
          </button>

          <button
            onClick={() => { setNavTab('daily'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              navTab === 'daily' ? 'bg-[#eae8e1] text-stone-900 font-bold' : 'text-stone-600 hover:bg-[#eeebe3]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              🔄 每日打卡例行
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
              {tasks.filter((t) => t.is_daily).length}
            </span>
          </button>

          {currentUser?.role === 'admin' && (
            <a
              href="/stores"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:bg-[#eeebe3]"
            >
              <span className="w-4 text-center text-blue-600">▦</span>
              多店采集管理
            </a>
          )}

          <button
            onClick={() => { setNavTab('review'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              navTab === 'review' ? 'bg-[#eae8e1] text-stone-900 font-bold' : 'text-stone-600 hover:bg-[#eeebe3]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              待验收审批
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
              {tasks.filter((t) => getDisplayStatus(t) === 'review').length}
            </span>
          </button>

          <button
            onClick={() => { setNavTab('done'); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              navTab === 'done' ? 'bg-[#eae8e1] text-stone-900 font-bold' : 'text-stone-600 hover:bg-[#eeebe3]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              已归档完成
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-semibold">
              {tasks.filter((t) => !t.is_daily && t.status === 'done').length}
            </span>
          </button>
        </nav>

        <div className="p-3.5 border-t border-[#eae9e5]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-sm text-stone-500 hover:text-stone-900 hover:bg-[#eeebe3] transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            退出系统登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="min-h-16 border-b border-[#eae9e5] bg-white/80 backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="切换侧边栏"
              className="p-2 rounded-lg hover:bg-stone-100 text-stone-600 transition shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-sm text-stone-400 shrink-0">/</span>
            <h2 className="text-sm sm:text-base font-bold text-stone-800 truncate">
              {navTab === 'all' && '全部任务看板'}
              {navTab === 'mine' && '指派给我的任务'}
              {navTab === 'daily' && '🔄 每日打卡例行任务'}
              {navTab === 'review' && '待主管审核验收'}
              {navTab === 'done' && '已完成任务存档'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-stone-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索任务或成员..."
                className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-stone-100/80 hover:bg-stone-100 focus:bg-white rounded-xl border border-transparent focus:border-stone-300 focus:outline-none transition"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'daily' | 'once')}
              className="bg-stone-100/80 hover:bg-stone-100 border border-stone-200/80 text-stone-700 text-xs sm:text-sm rounded-xl px-2.5 py-1.5 sm:py-2 focus:outline-none"
            >
              <option value="all">所有类型</option>
              <option value="daily">🔄 每日打卡</option>
              <option value="once">单次任务</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-stone-100/80 hover:bg-stone-100 border border-stone-200/80 text-stone-700 text-xs sm:text-sm rounded-xl px-2.5 py-1.5 sm:py-2 focus:outline-none"
            >
              <option value="all">全部优先级</option>
              <option value="urgent">🔴 紧急</option>
              <option value="high">🟠 重要</option>
              <option value="medium">🔵 中等</option>
              <option value="low">⚪ 低</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | StoreCategory)}
              className="bg-stone-100/80 hover:bg-stone-100 border border-stone-200/80 text-stone-700 text-xs sm:text-sm rounded-xl px-2.5 py-1.5 sm:py-2 focus:outline-none"
            >
              <option value="all">全部品类</option>
              <option value="服装">服装</option>
              <option value="手机壳">手机壳</option>
              <option value="食品">食品</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="bg-stone-100/80 hover:bg-stone-100 border border-stone-200/80 text-stone-700 text-xs sm:text-sm rounded-xl px-2.5 py-1.5 sm:py-2 focus:outline-none max-w-40"
            >
              <option value="all">全部店铺</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
            </select>

            <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200/60 text-xs sm:text-sm shrink-0">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-lg transition ${
                  viewMode === 'kanban' ? 'bg-white text-stone-900 font-bold shadow-xs' : 'text-stone-500'
                }`}
              >
                看板
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-lg transition ${
                  viewMode === 'list' ? 'bg-white text-stone-900 font-bold shadow-xs' : 'text-stone-500'
                }`}
              >
                表格
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
          {errorMessage && !loading ? (
            <div className="max-w-2xl mx-auto p-5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
              <div className="font-semibold">数据加载失败</div>
              <div className="mt-1 text-sm break-words">{errorMessage}</div>
              <button
                type="button"
                onClick={() => { void loadData(); }}
                className="mt-4 px-4 py-2 rounded-xl bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800"
              >
                重新加载
              </button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 animate-pulse">
              {['col1', 'col2', 'col3', 'col4'].map((col) => (
                <div key={col} className="bg-stone-100/70 rounded-2xl p-5 h-96 border border-stone-200/60 space-y-4">
                  <div className="h-5 bg-stone-200 rounded-md w-28"></div>
                  <div className="h-28 bg-white rounded-xl p-4 shadow-xs space-y-3">
                    <div className="h-4 bg-stone-200 rounded w-3/4"></div>
                    <div className="h-3 bg-stone-100 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'kanban' ? (
            /* 手机端支持平滑横向滑动（snap-x），大屏自适应 4 列 */
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-6 lg:grid lg:grid-cols-4 items-start scroll-smooth">
              {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((status) => {
                const columnTasks = filteredTasks.filter((t) => getDisplayStatus(t) === status);
                return (
                  <div
                    key={status}
                    className="w-[84vw] sm:w-[320px] lg:w-auto shrink-0 snap-center bg-[#f7f6f3]/80 rounded-2xl p-4 border border-[#eae9e5] flex flex-col min-h-[580px]"
                  >
                    <div className="flex items-center justify-between pb-3 px-1 mb-2.5 border-b border-stone-200/60">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[status].dot}`}></span>
                        <span className="font-bold text-sm sm:text-base text-stone-800">{STATUS_CONFIG[status].label}</span>
                      </div>
                      <span className="text-xs font-mono text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-md font-semibold">
                        {columnTasks.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1">
                      {columnTasks.map((task) => {
                        const dueStatus = getDueStatus(task.due_date);
                        const empName = getEmpName(task.assignee_id);
                        const avatar = getAvatarInfo(empName);
                        return (
                          <div
                            key={task.id}
                            onClick={() => openDetailDrawer(task)}
                            className={`bg-white rounded-xl p-4 border border-stone-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer relative overflow-hidden border-l-4 ${
                              PRIORITY_CONFIG[task.priority].bar
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_CONFIG[task.priority].badge}`}>
                                  {PRIORITY_CONFIG[task.priority].label}
                                </span>
                                {task.is_daily && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                                    🔄 每日打卡
                                  </span>
                                )}
                              </div>
                              {dueStatus && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${dueStatus.className}`}>
                                  {dueStatus.text}
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm sm:text-base font-bold text-stone-900 line-clamp-2 leading-relaxed mb-2">
                              {task.title}
                            </h4>

                            {task.description && (
                              <p className="text-xs text-stone-500 line-clamp-2 mb-3.5 leading-normal">
                                {task.description}
                              </p>
                            )}

                            {task.task_stores && task.task_stores.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mb-3 text-[11px] text-stone-500">
                                <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                                  {task.task_stores[0].category_snapshot}
                                </span>
                                <span>{task.task_stores.length} 家店</span>
                                <span className="truncate max-w-[180px]">{task.task_stores.slice(0, 2).map((store) => store.store_name_snapshot).join('、')}{task.task_stores.length > 2 ? '…' : ''}</span>
                              </div>
                            )}

                            <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full ${avatar.bg} text-white flex items-center justify-center text-xs font-bold shadow-xs`}>
                                  {avatar.initial}
                                </div>
                                <span className="text-xs font-medium text-stone-700 truncate max-w-[100px]">
                                  {empName}
                                </span>
                              </div>
                              <span className="text-xs text-stone-400 font-mono">
                                {new Date(task.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {columnTasks.length === 0 && (
                        <div className="h-32 flex flex-col items-center justify-center text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                          <span>暂无卡片</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xs border border-[#eae9e5] overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-700 border-collapse min-w-[640px]">
                <thead className="bg-[#f7f6f3] border-b border-[#eae9e5] text-stone-500 font-medium">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">任务标题</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">类型</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">流转状态</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">优先级</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">责任成员</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">截止日期</th>
                    <th className="px-5 py-4 font-semibold text-xs uppercase tracking-wider text-right">查看</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredTasks.map((task) => {
                    const empName = getEmpName(task.assignee_id);
                    const avatar = getAvatarInfo(empName);
                    const dueStatus = getDueStatus(task.due_date);
                    return (
                      <tr
                        key={task.id}
                        onClick={() => openDetailDrawer(task)}
                        className="hover:bg-blue-50/40 even:bg-stone-50/40 transition cursor-pointer"
                      >
                        <td className="px-6 py-4 font-bold text-stone-900 flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[getDisplayStatus(task)].dot}`}></span>
                          {task.title}
                        </td>
                        <td className="px-5 py-4">
                          {task.is_daily ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                              🔄 每日
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">单次</span>
                          )}
                          {task.task_stores && task.task_stores.length > 0 && (
                            <div className="text-[11px] text-stone-500 mt-1">{task.task_stores.length} 家店 · {task.task_stores[0].category_snapshot}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${STATUS_CONFIG[getDisplayStatus(task)].badge}`}>
                            {STATUS_CONFIG[getDisplayStatus(task)].label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded text-xs ${PRIORITY_CONFIG[task.priority].badge}`}>
                            {PRIORITY_CONFIG[task.priority].label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full ${avatar.bg} text-white flex items-center justify-center text-xs font-bold`}>
                              {avatar.initial}
                            </div>
                            <span className="font-medium text-stone-800">{empName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {dueStatus ? (
                            <span className={`px-2 py-0.5 rounded-md text-xs ${dueStatus.className}`}>
                              {task.due_date} ({dueStatus.text})
                            </span>
                          ) : (
                            <span className="text-stone-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-blue-600 hover:text-blue-800 text-sm">
                          详情 →
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTasks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-stone-400 text-sm">
                        未检索到匹配的任务
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 详情抽屉：手机端全屏自适应 */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedTask(null)}
          ></div>

          <div className="fixed inset-y-0 right-0 max-w-xl w-full bg-white shadow-2xl flex flex-col border-l border-stone-200 z-50 animate-in slide-in-from-right duration-300">
            <div className="p-5 sm:p-6 border-b border-stone-100 flex items-center justify-between bg-[#fbfbfa]">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[getDisplayStatus(selectedTask)].dot}`}></span>
                <span className="text-sm font-bold text-stone-800">
                  {selectedTask.is_daily ? `今日状态：${STATUS_CONFIG[getDisplayStatus(selectedTask)].label}` : STATUS_CONFIG[selectedTask.status].label}
                </span>
                {selectedTask.is_daily && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                    🔄 每日例行任务
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="关闭任务详情"
                onClick={() => setSelectedTask(null)}
                className="p-2 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {detailLoadError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {detailLoadError}
                </div>
              )}

              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">{selectedTask.title}</h3>
              </div>

              <div className="bg-stone-50/80 rounded-2xl p-4 sm:p-5 border border-stone-200/70 space-y-3 text-sm">
                <div className="flex items-center">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium">执行成员</span>
                  <div className="flex items-center gap-2 text-stone-800 font-semibold">
                    <div className={`w-6 h-6 rounded-full ${getAvatarInfo(getEmpName(selectedTask.assignee_id)).bg} text-white flex items-center justify-center text-xs`}>
                      {getAvatarInfo(getEmpName(selectedTask.assignee_id)).initial}
                    </div>
                    {getEmpName(selectedTask.assignee_id)}
                  </div>
                </div>

                <div className="flex items-center">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium">任务频次</span>
                  <span className="text-stone-800 font-medium">
                    {selectedTask.is_daily ? '🔄 每日重复打卡例行任务' : '单次完成任务'}
                  </span>
                </div>

                <div className="flex items-start">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium shrink-0">店铺范围</span>
                  <div className="text-stone-800 font-medium">
                    {selectedTask.task_stores && selectedTask.task_stores.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.task_stores.map((store) => (
                          <span key={`${selectedTask.id}-${store.store_code_snapshot}`} className="px-2 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200 text-xs">
                            {store.store_name_snapshot}（{store.category_snapshot}）
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-stone-400 font-normal">未绑定具体店铺</span>}
                  </div>
                </div>

                <div className="flex items-center">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium">优先级</span>
                  <span className={`px-2.5 py-0.5 rounded text-xs ${PRIORITY_CONFIG[selectedTask.priority].badge}`}>
                    {PRIORITY_CONFIG[selectedTask.priority].label}
                  </span>
                </div>

                <div className="flex items-center">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium">截止日期</span>
                  <span className="text-stone-800 font-mono">{selectedTask.due_date || '未指定'}</span>
                </div>

                <div className="flex items-center">
                  <span className="w-24 sm:w-28 text-stone-400 font-medium">创建时间</span>
                  <span className="text-stone-500 font-mono text-xs">
                    {new Date(selectedTask.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">任务详细说明</h4>
                <div className="bg-[#fcfbfa] p-4 sm:p-5 rounded-2xl border border-stone-200 text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {selectedTask.description || '无补充详细说明'}
                </div>
              </div>

              <div className="border border-stone-200 bg-stone-50/60 rounded-2xl p-4 sm:p-5 space-y-3">
                <h4 className="text-sm font-bold text-stone-800">状态流转与汇报</h4>
                <input
                  type="text"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="填写跟进说明或审核意见备注..."
                  className="w-full px-4 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400"
                />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {getDisplayStatus(selectedTask) === 'todo' && (currentUser?.role === 'admin' || selectedTask.assignee_id === currentUser?.id) && (
                    <button
                      type="button"
                      disabled={transitioningTaskId === selectedTask.id}
                      onClick={() => handleUpdateStatus(selectedTask.id, 'in_progress', statusComment)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
                    >
                      🚀 开始处理
                    </button>
                  )}

                  {getDisplayStatus(selectedTask) === 'in_progress' && (currentUser?.role === 'admin' || selectedTask.assignee_id === currentUser?.id) && (
                    <button
                      type="button"
                      disabled={transitioningTaskId === selectedTask.id}
                      onClick={() => handleUpdateStatus(selectedTask.id, 'review', statusComment)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
                    >
                      📩 提交验收
                    </button>
                  )}

                  {getDisplayStatus(selectedTask) === 'review' && currentUser?.role === 'admin' && (
                    <>
                      <button
                        type="button"
                        disabled={transitioningTaskId === selectedTask.id}
                        onClick={() => handleUpdateStatus(selectedTask.id, 'done', statusComment || '主管审核通过')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
                      >
                        ✅ 验收通过
                      </button>
                      <button
                        type="button"
                        disabled={transitioningTaskId === selectedTask.id}
                        onClick={() => handleUpdateStatus(selectedTask.id, 'in_progress', statusComment || '退回重做')}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
                      >
                        ↩️ 退回重做
                      </button>
                    </>
                  )}

                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteTask(selectedTask.id)}
                      className="ml-auto text-sm text-rose-600 hover:text-rose-800 font-medium px-3 py-1.5 rounded-lg hover:bg-rose-50 transition"
                    >
                      删除任务
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2.5">流转历史记录</h4>
                <div className="relative pl-6 space-y-3.5 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                  {taskLogs.map((log) => (
                    <div key={log.id} className="relative text-sm">
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-stone-400 ring-4 ring-white"></div>
                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/70">
                        <div className="flex items-center justify-between text-stone-500 mb-1">
                          <span className="font-bold text-stone-800">{log.action}</span>
                          <span className="text-xs font-mono">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        {log.comment && <p className="text-stone-700 bg-white p-2 rounded-lg border border-stone-100">{log.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTask.is_daily && (
                <div>
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2.5">今日状态</h4>
                  {(() => {
                    const todayCompletion = dailyCompletions.find((completion) => completion.completion_date === getTodayDate());
                    return todayCompletion ? (
                      <div className="flex items-start justify-between gap-3 bg-purple-50 p-3 rounded-xl border border-purple-200 text-sm">
                        <div>
                          <div className="font-semibold text-stone-800">{todayCompletion.completion_date}</div>
                          {todayCompletion.comment && <div className="text-stone-600 mt-1">{todayCompletion.comment}</div>}
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs ${STATUS_CONFIG[todayCompletion.status].badge}`}>
                          {STATUS_CONFIG[todayCompletion.status].label}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">今日尚未打卡，待处理</div>
                    );
                  })()}

                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mt-5 mb-2.5">每日完成历史（按日期倒序）</h4>
                  <div className="space-y-2">
                    {dailyCompletions.length === 0 ? (
                      <div className="text-sm text-stone-400 bg-stone-50 p-3 rounded-xl border border-stone-200">暂无历史完成记录</div>
                    ) : dailyCompletions.map((completion) => (
                      <div key={completion.completion_date} className="flex items-start justify-between gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200/70 text-sm">
                        <div>
                          <div className="font-semibold text-stone-800">{completion.completion_date}</div>
                          {completion.comment && <div className="text-stone-600 mt-1">{completion.comment}</div>}
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs ${STATUS_CONFIG[completion.status].badge}`}>
                          {STATUS_CONFIG[completion.status].label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 新建任务抽屉：支持选择单次 vs 每日重复任务 */}
      {showCreateDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setShowCreateDrawer(false)}
          ></div>

          <div className="fixed inset-y-0 right-0 max-w-lg w-full bg-white shadow-2xl flex flex-col border-l border-stone-200 z-50 animate-in slide-in-from-right duration-300">
            <div className="p-5 sm:p-6 border-b border-stone-100 flex items-center justify-between bg-[#fbfbfa]">
              <h3 className="text-base font-bold text-stone-800">发布团队任务</h3>
              <button
                type="button"
                aria-label="关闭新建任务面板"
                onClick={() => setShowCreateDrawer(false)}
                className="p-2 rounded-lg hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">任务名称 *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：每日巡检店铺商品库存"
                  className="w-full px-4 py-2.5 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-stone-900 focus:outline-none"
                />
              </div>

              {/* 每日任务 vs 单次任务选择器 */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                  任务频次与性质
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewIsDaily(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-center ${
                      !newIsDaily
                        ? 'bg-white border-stone-900 text-stone-900 shadow-xs'
                        : 'border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    单次常规任务
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIsDaily(true)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition text-center ${
                      newIsDaily
                        ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs'
                        : 'border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    🔄 每日重复打卡任务
                  </button>
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  {newIsDaily ? '该任务为员工每日日常必做项，卡片将带有醒目的【每日打卡】标识。' : '普通单次任务，主管验收通过后即归档结束。'}
                </p>
              </div>

              <div className="p-3.5 bg-orange-50/50 rounded-xl border border-orange-200">
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">任务店铺范围</label>
                <select
                  value={newStoreScope}
                  onChange={(e) => {
                    const scope = e.target.value as StoreScopeType;
                    setNewStoreScope(scope);
                    if (scope === 'none') setNewStoreIds([]);
                  }}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                >
                  <option value="none">不绑定店铺</option>
                  <option value="single">单店任务</option>
                  <option value="multiple">多店任务</option>
                  <option value="category">按品类全部启用店铺</option>
                </select>

                {newStoreScope !== 'none' && (
                  <div className="mt-3 space-y-2">
                    {newStoreScope === 'category' && (
                      <select
                        value={newStoreCategory}
                        onChange={(e) => setNewStoreCategory(e.target.value as 'all' | StoreCategory)}
                        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                      >
                        <option value="all">选择品类</option>
                        <option value="服装">服装</option>
                        <option value="手机壳">手机壳</option>
                        <option value="食品">食品</option>
                      </select>
                    )}

                    {newStoreScope !== 'category' && (
                      <>
                        <input
                          value={storeSearch}
                          onChange={(e) => setStoreSearch(e.target.value)}
                          placeholder="搜索店铺名称或编号"
                          className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                        />
                        <div className="max-h-36 overflow-y-auto space-y-1 bg-white rounded-xl border border-stone-200 p-2">
                          {stores.filter((store) => `${store.store_name} ${store.store_code}`.toLowerCase().includes(storeSearch.toLowerCase())).map((store) => (
                            <label key={store.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-50 text-sm">
                              <input
                                type={newStoreScope === 'single' ? 'radio' : 'checkbox'}
                                name="task-store"
                                checked={newStoreIds.includes(store.id)}
                                onChange={() => setNewStoreIds((current) => newStoreScope === 'single' ? [store.id] : current.includes(store.id) ? current.filter((id) => id !== store.id) : [...current, store.id])}
                              />
                              <span>{store.store_name}</span>
                              <span className="text-xs text-stone-400">{store.category} · {store.store_code}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="text-xs text-stone-600">
                      {newStoreScope === 'category'
                        ? (newStoreCategory === 'all' ? '请选择一个品类' : `将绑定 ${stores.filter((store) => store.category === newStoreCategory).length} 家启用店铺`)
                        : `已选择 ${newStoreIds.length} 家店铺`}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">任务要求与说明</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="详细操作指南、验收标准或日常检查步骤..."
                  className="w-full px-4 py-2.5 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-stone-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">优先级</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full px-4 py-2.5 text-sm border border-stone-300 rounded-xl bg-white"
                  >
                    <option value="low">低优先级</option>
                    <option value="medium">中等</option>
                    <option value="high">重要</option>
                    <option value="urgent">🔴 紧急</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">指派成员</label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-stone-300 rounded-xl bg-white"
                  >
                    <option value="">暂不指派</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">截止日期</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-stone-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateDrawer(false)}
                  className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? '发布中...' : '确认发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
