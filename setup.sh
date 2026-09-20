#!/bin/bash
# Legacy bootstrap script retained for reference. Do not run it against the
# current project: it recreates the original prototype and overwrites the
# migration/RLS and security fixes. Use pnpm install and the Supabase migration instead.
set -e

mkdir -p src/lib src/types src/app/login

# 1. package.json
cat << 'FILE_EOF' > package.json
{
  "name": "employee-task-system",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@supabase/supabase-js": "^2.45.4"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "@types/node": "^20.14.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "autoprefixer": "^10.4.19"
  }
}
FILE_EOF

# 2. tsconfig.json
cat << 'FILE_EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
FILE_EOF

# 3. next.config.mjs
cat << 'FILE_EOF' > next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};
export default nextConfig;
FILE_EOF

# 4. tailwind.config.js & postcss.config.js
cat << 'FILE_EOF' > tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
FILE_EOF

cat << 'FILE_EOF' > postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
FILE_EOF

# 5. src/types/index.ts
cat << 'FILE_EOF' > src/types/index.ts
export type UserRole = 'admin' | 'employee';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  creator_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: string;
  task_id: string;
  operator_id: string;
  action: string;
  comment: string | null;
  created_at: string;
}
FILE_EOF

# 6. src/lib/supabase.ts
cat << 'FILE_EOF' > src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
FILE_EOF

# 7. src/app/globals.css
cat << 'FILE_EOF' > src/app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f8fafc;
  color: #0f172a;
}
FILE_EOF

# 8. src/app/layout.tsx
cat << 'FILE_EOF' > src/app/layout.tsx
import './globals.css';
import React from 'react';

export const metadata = {
  title: '员工任务管理系统',
  description: '高效轻量的员工任务流转平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}
FILE_EOF

# 9. src/app/login/page.tsx
cat << 'FILE_EOF' > src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg('登录失败：' + error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white font-bold text-xl mb-3 shadow-md">
            TM
          </div>
          <h1 className="text-2xl font-bold text-slate-800">员工任务管理系统</h1>
          <p className="text-sm text-slate-500 mt-1">请使用管理员或员工账号登录</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              工作邮箱
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              密码
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50"
          >
            {loading ? '正在验证...' : '登 录'}
          </button>
        </form>
      </div>
    </div>
  );
}
FILE_EOF

# 10. src/app/page.tsx
cat << 'FILE_EOF' > src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Profile, Task, TaskLog, TaskPriority, TaskStatus } from '@/types';

const STATUS_MAP: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  todo: { label: '待处理', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-300' },
  in_progress: { label: '进行中', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300' },
  review: { label: '待验收', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
  done: { label: '已完成', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' },
};

const PRIORITY_MAP: Record<TaskPriority, { label: string; badge: string }> = {
  low: { label: '低', badge: 'bg-slate-100 text-slate-600' },
  medium: { label: '中', badge: 'bg-blue-100 text-blue-700' },
  high: { label: '高', badge: 'bg-orange-100 text-orange-700' },
  urgent: { label: '紧急', badge: 'bg-red-100 text-red-700 font-bold' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [statusComment, setStatusComment] = useState('');

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (profile) setCurrentUser(profile);

    const { data: profileList } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (profileList) setEmployees(profileList);

    const { data: taskList } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (taskList) setTasks(taskList);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newTitle.trim()) return;
    setSubmitting(true);

    const { data: task, error } = await supabase
      .from('tasks')
      .insert([
        {
          title: newTitle,
          description: newDesc,
          priority: newPriority,
          assignee_id: newAssignee || null,
          creator_id: currentUser.id,
          due_date: newDueDate || null,
          status: 'todo',
        },
      ])
      .select()
      .single();

    if (!error && task) {
      await supabase.from('task_logs').insert([
        {
          task_id: task.id,
          operator_id: currentUser.id,
          action: '创建任务并指派',
          comment: '初始分配',
        },
      ]);
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewDueDate('');
      loadData();
    } else {
      alert('创建失败：' + (error?.message || '未知错误'));
    }
    setSubmitting(false);
  };

  const openTaskDetail = async (task: Task) => {
    setSelectedTask(task);
    setStatusComment('');
    const { data: logs } = await supabase
      .from('task_logs')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false });
    if (logs) setTaskLogs(logs);
  };

  const updateTaskStatus = async (taskId: string, nextStatus: TaskStatus, comment: string) => {
    if (!currentUser) return;
    const { error } = await supabase
      .from('tasks')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (!error) {
      await supabase.from('task_logs').insert([
        {
          task_id: taskId,
          operator_id: currentUser.id,
          action: `变更为【${STATUS_MAP[nextStatus].label}】`,
          comment: comment || null,
        },
      ]);
      setSelectedTask(null);
      loadData();
    } else {
      alert('状态更新失败：' + error.message);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('确认删除该任务吗？此操作无法撤回。')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setSelectedTask(null);
    loadData();
  };

  const filteredTasks = tasks.filter((task) => {
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    return true;
  });

  const getAssigneeName = (id: string | null) => {
    if (!id) return '未指派';
    const emp = employees.find((e) => e.id === id);
    return emp ? emp.full_name : '员工';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium">
        系统加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow">
            TM
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-none">员工任务流转系统</h1>
            <span className="text-xs text-slate-500">TaskHub Enterprise</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-800">{currentUser?.full_name}</div>
            <span
              className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${
                currentUser?.role === 'admin'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {currentUser?.role === 'admin' ? '主管 / 管理员' : '团队员工'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
          >
            退出
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              看板视图
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              列表视图
            </button>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-600 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="all">所有优先级</option>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow transition"
            >
              + 发布新任务
            </button>
          )}
        </div>

        {viewMode === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map((status) => {
              const columnTasks = filteredTasks.filter((t) => t.status === status);
              return (
                <div
                  key={status}
                  className="bg-slate-100/80 rounded-xl p-4 flex flex-col border border-slate-200 min-h-[520px]"
                >
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_MAP[status].bg}`}></span>
                      {STATUS_MAP[status].label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-semibold">
                      {columnTasks.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {columnTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => openTaskDetail(task)}
                        className="bg-white rounded-lg p-3.5 shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-400 transition cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              PRIORITY_MAP[task.priority].badge
                            }`}
                          >
                            {PRIORITY_MAP[task.priority].label}
                          </span>
                          {task.due_date && (
                            <span className="text-[11px] text-slate-400">
                              截止: {task.due_date}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 line-clamp-2 mb-2">
                          {task.title}
                        </h4>
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                          <span className="text-slate-600 font-medium">
                            {getAssigneeName(task.assignee_id)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {columnTasks.length === 0 && (
                      <div className="h-32 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                        暂无任务
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">任务名称</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">优先级</th>
                  <th className="px-5 py-3">责任人</th>
                  <th className="px-5 py-3">截止日期</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{task.title}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${
                          STATUS_MAP[task.status].bg
                        } ${STATUS_MAP[task.status].color}`}
                      >
                        {STATUS_MAP[task.status].label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          PRIORITY_MAP[task.priority].badge
                        }`}
                      >
                        {PRIORITY_MAP[task.priority].label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{getAssigneeName(task.assignee_id)}</td>
                    <td className="px-5 py-3.5">{task.due_date || '-'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => openTaskDetail(task)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        查看/流转
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">发布新员工任务</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">任务名称 *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="如：更新中秋月饼商品主图物料"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">任务要求 / 详细说明</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="详细操作指南、素材规范或要求..."
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">优先级</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">指派给员工</label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                  >
                    <option value="">未指派</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">截止日期</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow"
                >
                  {submitting ? '发布中...' : '确认发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border mb-1 ${
                    STATUS_MAP[selectedTask.status].bg
                  } ${STATUS_MAP[selectedTask.status].color}`}
                >
                  当前状态：{STATUS_MAP[selectedTask.status].label}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{selectedTask.title}</h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-xs text-slate-600 space-y-2">
              <p className="whitespace-pre-wrap">{selectedTask.description || '无任务补充描述'}</p>
              <div className="flex items-center gap-4 pt-2 text-slate-400 border-t border-slate-200">
                <span>责任人：{getAssigneeName(selectedTask.assignee_id)}</span>
                <span>截止日期：{selectedTask.due_date || '未设置'}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 mb-5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                流转操作
              </h4>
              <input
                type="text"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                placeholder="填写进展汇报或审核意见备注（可选）..."
                className="w-full px-3 py-2 text-xs border rounded-lg mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <div className="flex flex-wrap gap-2">
                {selectedTask.status === 'todo' && (
                  <button
                    onClick={() => updateTaskStatus(selectedTask.id, 'in_progress', statusComment)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold shadow hover:bg-blue-700"
                  >
                    开始处理（变为进行中）
                  </button>
                )}

                {selectedTask.status === 'in_progress' && (
                  <button
                    onClick={() => updateTaskStatus(selectedTask.id, 'review', statusComment)}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold shadow hover:bg-amber-700"
                  >
                    提交验收（待主管审核）
                  </button>
                )}

                {selectedTask.status === 'review' && currentUser?.role === 'admin' && (
                  <>
                    <button
                      onClick={() => updateTaskStatus(selectedTask.id, 'done', statusComment || '主管验收通过')}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow hover:bg-emerald-700"
                    >
                      验收通过（标记完成）
                    </button>
                    <button
                      onClick={() => updateTaskStatus(selectedTask.id, 'in_progress', statusComment || '要求修改重做')}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold shadow hover:bg-red-700"
                    >
                      打回重做
                    </button>
                  </>
                )}

                {currentUser?.role === 'admin' && (
                  <button
                    onClick={() => deleteTask(selectedTask.id)}
                    className="ml-auto px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100"
                  >
                    删除任务
                  </button>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 mb-2">流转历史动态</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {taskLogs.map((log) => (
                  <div key={log.id} className="text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between text-slate-500 mb-1">
                      <span className="font-semibold text-slate-700">{log.action}</span>
                      <span>{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    {log.comment && <div className="text-slate-600">{log.comment}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
FILE_EOF

# 11. Dockerfile
cat << 'FILE_EOF' > Dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public 2>/dev/null || true
RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
FILE_EOF

# 12. docker-compose.yml
cat << 'FILE_EOF' > docker-compose.yml
version: '3.8'

services:
  taskhub-app:
    container_name: taskhub-app
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - PORT=3000
    ports:
      - "3000:3000"
    restart: always
FILE_EOF

echo ">>> 全部代码文件已就绪！"
