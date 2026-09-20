'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  // 状态：false 为登录，true 为注册
  const [isRegister, setIsRegister] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 登录提交
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.push('/');
      router.refresh();
    } catch (error) {
      setErrorMsg('登录失败：' + (error instanceof Error ? error.message : '网络异常，请稍后重试'));
      setLoading(false);
    }
  };

  // 注册提交
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('密码长度不能少于 6 位');
      setLoading(false);
      return;
    }

    try {
      // The database trigger assigns the employee role; client metadata cannot elevate privileges.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || email.split('@')[0],
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        setSuccessMsg('注册成功，正在进入工作区...');
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 800);
      } else {
        setSuccessMsg('账号注册成功！现在可以直接切换到登录页输入密码登录。');
        setIsRegister(false);
        setLoading(false);
      }
    } catch (error) {
      setErrorMsg('注册失败：' + (error instanceof Error ? error.message : '网络异常，请稍后重试'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#fbfbfa] text-stone-800 antialiased">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8 sm:p-10 border border-stone-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-900 text-white font-bold text-xl mb-3 shadow-sm">
            T
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">TaskHub 任务流转协作</h1>
          <p className="text-sm text-stone-500 mt-1.5">企业团队任务管理与协同系统</p>
        </div>

        {/* 顶部：登录 / 注册 切换选项卡 */}
        <div className="flex bg-stone-100 p-1 rounded-xl mb-6 border border-stone-200/80">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
              !isRegister ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            账号登录
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
              isRegister ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            注册新员工账号
          </button>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-start gap-2">
            <span className="shrink-0 mt-0.5">✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
                员工真实姓名 *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="例如：张三 / 李四"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent text-sm bg-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
              工作邮箱 *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
              密码 *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位字符"
              className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent text-sm bg-white"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
                确认密码 *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent text-sm bg-white"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl shadow-md transition-all text-sm disabled:opacity-50 hover:scale-[0.99] active:scale-[0.98]"
          >
            {loading ? '处理中...' : isRegister ? '立即注册并加入团队' : '登录工作区'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setErrorMsg(''); setSuccessMsg(''); }}
            className="text-xs text-stone-500 hover:text-stone-900 transition underline underline-offset-4"
          >
            {isRegister ? '已有账号？返回直接登录' : '新员工报到？点击注册账号'}
          </button>
        </div>
      </div>
    </div>
  );
}
