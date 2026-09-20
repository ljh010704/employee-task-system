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
