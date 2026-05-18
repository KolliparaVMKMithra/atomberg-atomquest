'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Share2, Loader2, Send, Users } from 'lucide-react';

const thrustAreas = ['Revenue Growth', 'Cost Optimisation', 'Customer Experience', 'People Development', 'Process Excellence', 'Innovation', 'Compliance'];
const uomOptions = [
  { value: 'numeric_min', label: 'Numeric (Min)' },
  { value: 'numeric_max', label: 'Numeric (Max)' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'zero', label: 'Zero-based' },
];

export default function SharedGoalsPage() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [sharedGoals, setSharedGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    thrust_area: '', title: '', description: '', uom_type: 'numeric_min',
    target_value: '', target_date: '', employee_ids: [] as number[], default_weightage: '',
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, cycleRes, goalsRes] = await Promise.all([
          api.get('/users/'),
          api.get('/cycles/active').catch(() => ({ data: null })),
          api.get('/goals/').catch(() => ({ data: [] })),
        ]);
        setEmployees(usersRes.data.filter((u: any) => u.role === 'employee' && u.is_active));
        setCycle(cycleRes.data);
        const shared = Array.isArray(goalsRes.data) ? goalsRes.data.filter((g: any) => g.is_shared && !g.parent_goal_id) : [];
        setSharedGoals(shared);
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, []);

  const toggleEmployee = (id: number) => {
    setForm(prev => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(id)
        ? prev.employee_ids.filter(e => e !== id)
        : [...prev.employee_ids, id],
    }));
  };

  const handlePush = async () => {
    if (!cycle) { showToast('No active cycle', 'error'); return; }
    if (!form.title || !form.thrust_area || form.employee_ids.length === 0 || !form.default_weightage) {
      showToast('Fill all required fields and select employees', 'error'); return;
    }
    setSending(true);
    try {
      await api.post('/goals/shared', {
        cycle_id: cycle.id, thrust_area: form.thrust_area, title: form.title,
        description: form.description || null, uom_type: form.uom_type,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        target_date: form.uom_type === 'timeline' ? form.target_date : null,
        employee_ids: form.employee_ids, default_weightage: parseFloat(form.default_weightage),
      });
      showToast(`Goal pushed to ${form.employee_ids.length} employee(s)`, 'success');
      setForm({ thrust_area: '', title: '', description: '', uom_type: 'numeric_min', target_value: '', target_date: '', employee_ids: [], default_weightage: '' });
      // Refresh shared goals
      const goalsRes = await api.get('/goals/');
      setSharedGoals(goalsRes.data.filter((g: any) => g.is_shared && !g.parent_goal_id));
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed to push goal', 'error'); }
    setSending(false);
  };

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Shared Goals" />
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Share2 size={16} /> Push Shared Goal</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Thrust Area *</label>
              <select value={form.thrust_area} onChange={e => setForm({ ...form, thrust_area: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                <option value="">Select...</option>
                {thrustAreas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">UoM Type *</label>
              <select value={form.uom_type} onChange={e => setForm({ ...form, uom_type: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                {uomOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Goal Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" rows={2} />
            </div>
            {(form.uom_type === 'numeric_min' || form.uom_type === 'numeric_max') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target Value</label>
                <input type="number" value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              </div>
            )}
            {form.uom_type === 'timeline' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Target Date</label>
                <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Default Weightage (%) *</label>
              <input type="number" value={form.default_weightage} onChange={e => setForm({ ...form, default_weightage: e.target.value })} min={10} max={90} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Employee selector */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Select Employees * ({form.employee_ids.length} selected)</label>
            <input placeholder="Search employees..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-2" />
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              {filteredEmployees.map(e => (
                <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={form.employee_ids.includes(e.id)} onChange={() => toggleEmployee(e.id)} className="rounded" />
                  <span className="text-sm text-slate-700">{e.name}</span>
                  <span className="text-xs text-slate-400">{e.department}</span>
                </label>
              ))}
            </div>
          </div>

          <button onClick={handlePush} disabled={sending} className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Push Goal
          </button>
        </div>

        {/* Shared goals list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Previously Shared Goals</h3>
          </div>
          {sharedGoals.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No shared goals yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sharedGoals.map(g => (
                <div key={g.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{g.title}</p>
                    <p className="text-xs text-slate-400">{g.thrust_area} · {g.uom_type.replace('_', ' ')}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Users size={14} /> Recipients: {g.child_goals?.length || 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
