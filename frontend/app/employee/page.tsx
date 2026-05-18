'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import ProgressBar from '@/components/ProgressBar';
import { Target, TrendingUp, Calendar, Loader2 } from 'lucide-react';

const statusBadge: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  locked: 'bg-purple-100 text-purple-700',
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const [goalsRes, cycleRes] = await Promise.all([
          api.get('/goals/'),
          api.get('/cycles/active').catch(() => ({ data: null })),
        ]);
        setGoals(goalsRes.data);
        setCycle(cycleRes.data);
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const totalGoals = goals.length;
  const weightedProgress = goals.reduce((acc, g) => {
    const achs = g.achievements || [];
    const latestScore = achs.length > 0 ? Math.max(...achs.map((a: any) => a.progress_score || 0)) : 0;
    return acc + (latestScore * g.weightage / 100);
  }, 0);

  const getActiveQuarter = () => {
    if (!cycle) return 'N/A';
    const today = new Date();
    const dates = [
      { q: 'Goal Setting', start: new Date(cycle.goal_setting_start) },
      { q: 'Q1', start: new Date(cycle.q1_start) },
      { q: 'Q2', start: new Date(cycle.q2_start) },
      { q: 'Q3', start: new Date(cycle.q3_start) },
      { q: 'Q4', start: new Date(cycle.q4_start) },
    ];
    for (let i = dates.length - 1; i >= 0; i--) {
      if (today >= dates[i].start) return dates[i].q;
    }
    return 'N/A';
  };

  const getQuarterScore = (goal: any, quarter: string) => {
    const ach = (goal.achievements || []).find((a: any) => a.quarter === quarter);
    return ach ? `${(ach.progress_score || 0).toFixed(0)}%` : '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div>
      <Navbar title="My Dashboard" />
      <div className="p-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Target size={20} className="text-blue-600" />
              </div>
              <p className="text-sm text-slate-500">Total Goals</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{totalGoals}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp size={20} className="text-green-600" />
              </div>
              <p className="text-sm text-slate-500">Overall Progress</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{weightedProgress.toFixed(1)}%</p>
            <ProgressBar score={weightedProgress} showLabel={false} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Calendar size={20} className="text-amber-600" />
              </div>
              <p className="text-sm text-slate-500">Current Quarter</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{getActiveQuarter()}</p>
            {cycle && <p className="text-xs text-slate-400 mt-1">{cycle.name}</p>}
          </div>
        </div>

        {/* Goal Summary Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Goal Summary</h3>
          </div>
          {goals.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Target size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No goals found. Go to My Goals to add goals.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-semibold">Goal Title</th>
                    <th className="text-left px-3 py-3 font-semibold">Thrust Area</th>
                    <th className="text-center px-3 py-3 font-semibold">Weight</th>
                    <th className="text-center px-3 py-3 font-semibold">UoM</th>
                    <th className="text-center px-3 py-3 font-semibold">Target</th>
                    <th className="text-center px-3 py-3 font-semibold">Status</th>
                    <th className="text-center px-3 py-3 font-semibold">Q1</th>
                    <th className="text-center px-3 py-3 font-semibold">Q2</th>
                    <th className="text-center px-3 py-3 font-semibold">Q3</th>
                    <th className="text-center px-3 py-3 font-semibold">Q4</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g) => (
                    <tr key={g.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-800">{g.title}</td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">{g.thrust_area}</span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700">{g.weightage}%</td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{g.uom_type.replace('_', ' ')}</td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {g.target_value != null ? g.target_value.toLocaleString() : g.target_date || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${statusBadge[g.status] || ''}`}>
                          {g.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(g, 'Q1')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(g, 'Q2')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(g, 'Q3')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(g, 'Q4')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
