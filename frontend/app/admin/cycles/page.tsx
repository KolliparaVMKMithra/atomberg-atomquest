'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Plus, Loader2, X, Calendar, CheckCircle } from 'lucide-react';

export default function AdminCyclesPage() {
  const { showToast } = useToast();
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', goal_setting_start: '', q1_start: '', q2_start: '', q3_start: '', q4_start: '', is_active: true });
  const [saving, setSaving] = useState(false);

  const fetchCycles = async () => {
    try { const res = await api.get('/admin/cycles'); setCycles(res.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetchCycles(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.goal_setting_start) { showToast('Name and dates required', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/admin/cycles', form);
      showToast('Cycle created', 'success');
      setModalOpen(false);
      fetchCycles();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed', 'error'); }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Cycle Management" />
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-700">{cycles.length} cycle(s)</h3>
          <button onClick={() => { setForm({ name: '', goal_setting_start: '', q1_start: '', q2_start: '', q3_start: '', q4_start: '', is_active: true }); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Create Cycle
          </button>
        </div>

        <div className="grid gap-3">
          {cycles.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={16} className="text-blue-600" />
                  <h4 className="text-sm font-semibold text-slate-800">{c.name}</h4>
                  {c.is_active && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>}
                </div>
                <div className="flex gap-4 text-xs text-slate-500 mt-1">
                  <span>Goal Setting: {c.goal_setting_start}</span>
                  <span>Q1: {c.q1_start}</span>
                  <span>Q2: {c.q2_start}</span>
                  <span>Q3: {c.q3_start}</span>
                  <span>Q4: {c.q4_start}</span>
                </div>
              </div>
            </div>
          ))}
          {cycles.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">No cycles found.</div>
          )}
        </div>

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between p-5 border-b">
                <h3 className="text-lg font-semibold text-slate-800">Create Cycle</h3>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. FY 2025-26" className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
                {[
                  { key: 'goal_setting_start', label: 'Goal Setting Start' },
                  { key: 'q1_start', label: 'Q1 Start' },
                  { key: 'q2_start', label: 'Q2 Start' },
                  { key: 'q3_start', label: 'Q3 Start' },
                  { key: 'q4_start', label: 'Q4 Start' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                    <input type="date" value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                  </div>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                  <span className="text-sm text-slate-700">Set as Active</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Cycle'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
