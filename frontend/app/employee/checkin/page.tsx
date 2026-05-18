'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import ProgressBar from '@/components/ProgressBar';
import { Loader2, Save, Calendar, AlertCircle } from 'lucide-react';

function computeScore(uomType: string, targetValue: number | null, targetDate: string | null, actualValue: number | null, actualDate: string | null): number {
  if (uomType === 'numeric_min') {
    if (!targetValue || targetValue === 0 || actualValue == null) return 0;
    return Math.min((actualValue / targetValue) * 100, 150);
  }
  if (uomType === 'numeric_max') {
    if (actualValue == null || actualValue === 0 || !targetValue) return 0;
    return Math.min((targetValue / actualValue) * 100, 150);
  }
  if (uomType === 'timeline') {
    if (!actualDate || !targetDate) return 0;
    const actual = new Date(actualDate);
    const target = new Date(targetDate);
    if (actual <= target) return 100;
    const days = Math.floor((actual.getTime() - target.getTime()) / 86400000);
    return Math.max(0, 100 - days * 2);
  }
  if (uomType === 'zero') {
    if (actualValue == null) return 0;
    return actualValue === 0 ? 100 : 0;
  }
  return 0;
}

export default function EmployeeCheckinPage() {
  const { showToast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [activeQuarter, setActiveQuarter] = useState<string>('');
  const [achievements, setAchievements] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [goalsRes, cycleRes] = await Promise.all([
          api.get('/goals/'),
          api.get('/cycles/active').catch(() => ({ data: null })),
        ]);
        const approvedGoals = goalsRes.data.filter((g: any) => ['approved', 'locked'].includes(g.status));
        setGoals(approvedGoals);
        setCycle(cycleRes.data);

        if (cycleRes.data) {
          const c = cycleRes.data;
          const today = new Date();
          let q = '';
          if (today >= new Date(c.q4_start)) q = 'Q4';
          else if (today >= new Date(c.q3_start)) q = 'Q3';
          else if (today >= new Date(c.q2_start)) q = 'Q2';
          else if (today >= new Date(c.q1_start)) q = 'Q1';
          else if (today >= new Date(c.goal_setting_start)) q = 'goal_setting';
          setActiveQuarter(q);
        }

        const achRes = await api.get('/achievements/');
        const achMap: Record<number, any> = {};
        for (const a of achRes.data) {
          achMap[a.goal_id] = a;
        }
        setAchievements(achMap);
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSave = async (goal: any) => {
    const ach = achievements[goal.id];
    if (!ach) return;
    setSaving({ ...saving, [goal.id]: true });
    try {
      if (ach.id) {
        await api.put(`/achievements/${ach.id}`, {
          actual_value: ach.actual_value, actual_date: ach.actual_date, status: ach.status,
        });
      } else {
        await api.post('/achievements/', {
          goal_id: goal.id, quarter: activeQuarter,
          actual_value: ach.actual_value, actual_date: ach.actual_date, status: ach.status || 'not_started',
        });
      }
      showToast('Achievement saved', 'success');
      const achRes = await api.get('/achievements/');
      const achMap: Record<number, any> = {};
      for (const a of achRes.data) achMap[a.goal_id] = a;
      setAchievements(achMap);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to save', 'error');
    }
    setSaving({ ...saving, [goal.id]: false });
  };

  const updateAch = (goalId: number, field: string, value: any) => {
    setAchievements({
      ...achievements,
      [goalId]: { ...(achievements[goalId] || { status: 'not_started' }), [field]: value },
    });
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const isWindowOpen = ['Q1', 'Q2', 'Q3', 'Q4'].includes(activeQuarter);
  const nextDates: Record<string, string> = cycle ? { Q1: cycle.q1_start, Q2: cycle.q2_start, Q3: cycle.q3_start, Q4: cycle.q4_start } : {};

  return (
    <div>
      <Navbar title="Check-in" />
      <div className="p-6">
        {/* Quarter header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Active Quarter: {activeQuarter || 'None'}</p>
              {cycle && <p className="text-xs text-slate-400">{cycle.name}</p>}
            </div>
          </div>
        </div>

        {!isWindowOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Check-in window is not open</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {activeQuarter === 'goal_setting' ? `Next window opens on ${nextDates.Q1 || 'TBD'}` : 'No active cycle found.'}
              </p>
            </div>
          </div>
        )}

        {/* Goal cards */}
        {goals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-sm">No approved goals found. Goals must be approved before check-in.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {goals.map((g) => {
              const ach = achievements[g.id] || {};
              const score = computeScore(g.uom_type, g.target_value, g.target_date, ach.actual_value, ach.actual_date);
              return (
                <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">{g.title}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>UoM: {g.uom_type.replace('_', ' ')}</span>
                        <span>Target: {g.target_value != null ? g.target_value.toLocaleString() : g.target_date || 'N/A'}</span>
                        <span>Weight: {g.weightage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-3">
                    {g.uom_type === 'timeline' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Actual Date</label>
                        <input type="date" value={ach.actual_date || ''} onChange={(e) => updateAch(g.id, 'actual_date', e.target.value)}
                          disabled={!isWindowOpen}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Actual Value</label>
                        <input type="number" value={ach.actual_value ?? ''} onChange={(e) => updateAch(g.id, 'actual_value', e.target.value ? parseFloat(e.target.value) : null)}
                          disabled={!isWindowOpen}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                      <select value={ach.status || 'not_started'} onChange={(e) => updateAch(g.id, 'status', e.target.value)}
                        disabled={!isWindowOpen}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50">
                        <option value="not_started">Not Started</option>
                        <option value="on_track">On Track</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Progress Score</label>
                      <p className="text-lg font-bold text-slate-800 mt-0.5">{score.toFixed(1)}%</p>
                    </div>
                  </div>

                  <ProgressBar score={score} />

                  {isWindowOpen && (
                    <button onClick={() => handleSave(g)} disabled={saving[g.id]}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {saving[g.id] ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
