'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * AuthGuard wraps protected pages and prevents rendering until
 * the auth context has loaded. Redirects unauthenticated users to login.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect after loading is complete and there's no user
    if (!loading && !user) {
      router.replace('/');
    }
  }, [loading, user, router]);

  // While auth context is initializing, show loading spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  // Not authenticated — show spinner while redirect happens via useEffect
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return <>{children}</>;
}
