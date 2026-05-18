'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/lib/AuthContext';
import Sidebar from './Sidebar';
import ToastProvider from './ToastProvider';
import AuthGuard from './AuthGuard';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/';

  return (
    <AuthProvider>
      <ToastProvider>
        {isLoginPage ? (
          <main>{children}</main>
        ) : (
          <AuthGuard>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 ml-60">
                {children}
              </div>
            </div>
          </AuthGuard>
        )}
      </ToastProvider>
    </AuthProvider>
  );
}
