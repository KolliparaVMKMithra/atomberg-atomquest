'use client';

import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import api from '@/lib/api';
import NotificationDropdown from './NotificationDropdown';

interface NavbarProps {
  title: string;
}

export default function Navbar({ title }: NavbarProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotif, setShowNotif] = useState(false);

  useEffect(() => {
    if (user) {
      api.get('/notifications/').then((res) => setNotifications(res.data)).catch(() => {});
    }
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {}
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <div className="relative">
        <button
          onClick={() => setShowNotif(!showNotif)}
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {showNotif && (
          <NotificationDropdown
            notifications={notifications}
            onMarkRead={markRead}
            onClose={() => setShowNotif(false)}
          />
        )}
      </div>
    </header>
  );
}
