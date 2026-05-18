'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutDashboard, Target, CheckCircle, Users, Share2, FileText,
  ClipboardList, Shield, Calendar, BarChart3, LogOut, ChevronRight
} from 'lucide-react';

const navItems: Record<string, { label: string; href: string; icon: React.ReactNode }[]> = {
  employee: [
    { label: 'Dashboard', href: '/employee', icon: <LayoutDashboard size={18} /> },
    { label: 'My Goals', href: '/employee/goals', icon: <Target size={18} /> },
    { label: 'Check-ins', href: '/employee/checkin', icon: <CheckCircle size={18} /> },
  ],
  manager: [
    { label: 'Dashboard', href: '/manager', icon: <LayoutDashboard size={18} /> },
    { label: 'Team Goals', href: '/manager', icon: <Target size={18} /> },
    { label: 'Approvals', href: '/manager/approve', icon: <ClipboardList size={18} /> },
    { label: 'Check-ins', href: '/manager/checkin', icon: <CheckCircle size={18} /> },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: <LayoutDashboard size={18} /> },
    { label: 'Users', href: '/admin/users', icon: <Users size={18} /> },
    { label: 'Cycles', href: '/admin/cycles', icon: <Calendar size={18} /> },
    { label: 'Shared Goals', href: '/admin/shared-goals', icon: <Share2 size={18} /> },
    { label: 'Reports', href: '/admin/reports', icon: <FileText size={18} /> },
    { label: 'Analytics', href: '/admin/analytics', icon: <BarChart3 size={18} /> },
    { label: 'Audit Log', href: '/admin/audit-log', icon: <Shield size={18} /> },
  ],
};

const roleBadgeColors: Record<string, string> = {
  employee: 'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  admin: 'bg-purple-100 text-purple-700',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = navItems[user.role] || [];

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-slate-200 flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Target size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight">AtomQuest</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Goals Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Navigation</p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                  {item.label}
                  {isActive && <ChevronRight size={14} className="ml-auto text-blue-400" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${roleBadgeColors[user.role]}`}>
              {user.role}
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
