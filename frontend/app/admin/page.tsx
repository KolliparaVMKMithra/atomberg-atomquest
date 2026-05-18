'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Users, Calendar, Target, ClipboardList, Loader2 } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalEmployees: 0, cycleName: '', completionPct: 0, pendingApprovals: 0 });
  const [dashboard, setDashboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, cycleRes, dashRes, goalsRes] = await Promise.all([
          api.get('/users/'),
          api.get('/cycles/active').catch(() => ({ data: null })),
          api.get('/admin/completion-dashboard'),
          api.get('/goals/team').catch(() => ({ data: [] })),
        ]);
        const employees = usersRes.data.filter((u: any) => u.role === 'employee' && u.is_active);
        const submitted = Array.isArray(goalsRes.data) ? goalsRes.data.filter((g: any) => g.status === 'submitted').length : 0;
        const withGoals = dashRes.data.filter((d: any) => d.goals_submitted > 0).length;
        setStats({
          totalEmployees: employees.length,
          cycleName: cycleRes.data?.name || 'None',
          completionPct: employees.length > 0 ? Math.round((withGoals / employees.length) * 100) : 0,
          pendingApprovals: submitted,
        });
        setDashboard(dashRes.data);
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, []);

  const cellColor = (status: string | null) => {
    if (status === 'done') return 'bg-green-100 text-green-700';
    if (status === 'not_done') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-400';
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Admin Dashboard" />
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><Users size={20} className="text-blue-600" /></div>
              <p className="text-sm text-slate-500">Total Employees</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stats.totalEmployees}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center"><Calendar size={20} className="text-green-600" /></div>
              <p className="text-sm text-slate-500">Active Cycle</p>
            </div>
            <p className="text-lg font-bold text-slate-800">{stats.cycleName}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center"><Target size={20} className="text-emerald-600" /></div>
              <p className="text-sm text-slate-500">Goal Completion</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stats.completionPct}%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center"><ClipboardList size={20} className="text-amber-600" /></div>
              <p className="text-sm text-slate-500">Pending Approvals</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stats.pendingApprovals}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Completion Dashboard</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">Employee</th>
                  <th className="text-left px-3 py-3 font-semibold">Dept</th>
                  <th className="text-left px-3 py-3 font-semibold">Manager</th>
                  <th className="text-center px-3 py-3 font-semibold">Submitted</th>
                  <th className="text-center px-3 py-3 font-semibold">Approved</th>
                  <th className="text-center px-3 py-3 font-semibold">Q1</th>
                  <th className="text-center px-3 py-3 font-semibold">Q2</th>
                  <th className="text-center px-3 py-3 font-semibold">Q3</th>
                  <th className="text-center px-3 py-3 font-semibold">Q4</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.map(row => (
                  <tr key={row.employee_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-800">{row.employee_name}</td>
                    <td className="px-3 py-3 text-slate-600">{row.department || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{row.manager_name || '—'}</td>
                    <td className="px-3 py-3 text-center">{row.goals_submitted}</td>
                    <td className="px-3 py-3 text-center">{row.goals_approved}</td>
                    {['q1_checkin', 'q2_checkin', 'q3_checkin', 'q4_checkin'].map(key => (
                      <td key={key} className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cellColor(row[key])}`}>
                          {row[key] === 'done' ? '✓' : row[key] === 'not_done' ? '✗' : '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {dashboard.length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-slate-400 text-sm">No data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
