'use client';

import React from 'react';
import { X, Bell } from 'lucide-react';

interface Notification {
  id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationDropdownProps {
  notifications: Notification[];
  onMarkRead: (id: number) => void;
  onClose: () => void;
}

export default function NotificationDropdown({ notifications, onMarkRead, onClose }: NotificationDropdownProps) {
  return (
    <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            <Bell size={24} className="mx-auto mb-2 opacity-50" />
            No notifications
          </div>
        ) : (
          notifications.slice(0, 10).map((notif) => (
            <button
              key={notif.id}
              onClick={() => onMarkRead(notif.id)}
              className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                !notif.is_read ? 'bg-blue-50/50' : ''
              }`}
            >
              <p className="text-sm text-slate-700 leading-snug">{notif.message}</p>
              <p className="text-xs text-slate-400 mt-1">
                {new Date(notif.created_at).toLocaleString()}
              </p>
              {!notif.is_read && (
                <span className="inline-block mt-1 text-[10px] text-blue-600 font-medium">Click to mark read</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
