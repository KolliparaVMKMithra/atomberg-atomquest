'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Target, Loader2, Mail, Lock, Users, Shield, User } from 'lucide-react';

const demoAccounts = [
  { label: 'Employee', email: 'employee@demo.com', password: 'Atom@Quest2025', icon: <User size={16} />, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
  { label: 'Manager', email: 'manager@demo.com', password: 'Atom@Quest2025', icon: <Users size={16} />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
  { label: 'Admin', email: 'admin@demo.com', password: 'Atom@Quest2025', icon: <Shield size={16} />, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, demoEmail?: string, demoPass?: string) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(demoEmail || email, demoPass || password);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    handleLogin(undefined, demoEmail, demoPass);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4 shadow-lg shadow-blue-200">
              <Target size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">AtomQuest</h1>
            <p className="text-sm text-slate-500 mt-1">Goal Setting & Tracking Portal</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">Quick Demo Access</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Demo buttons */}
          <div className="grid grid-cols-3 gap-2">
            {demoAccounts.map((demo) => (
              <button
                key={demo.email}
                onClick={() => handleDemoLogin(demo.email, demo.password)}
                disabled={loading}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 border rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${demo.color}`}
              >
                {demo.icon}
                {demo.label}
              </button>
            ))}
          </div>

          {/* Credentials */}
          <div className="mt-6 bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Demo Credentials</p>
            <div className="space-y-1 text-xs text-slate-500 font-mono">
              <p>employee@demo.com / Atom@Quest2025</p>
              <p>manager@demo.com &nbsp;/ Atom@Quest2025</p>
              <p>admin@demo.com &nbsp;&nbsp;&nbsp;/ Atom@Quest2025</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
