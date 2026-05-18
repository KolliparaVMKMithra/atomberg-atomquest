'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Plus, Pencil, Trash2, Send, Lock, Loader2, X, AlertCircle } from 'lucide-react';

const thrustAreas = ['Revenue Growth', 'Cost Optimisation', 'Customer Experience', 'People Development', 'Process Excellence', 'Innovation', 'Compliance'];
const uomOptions = [
  { value: 'numeric_min', label: 'Numeric (Min)', desc: 'Higher is better (e.g. Sales)' },
  { value: 'numeric_max', label: 'Numeric (Max)', desc: 'Lower is better (e.g. TAT, Cost)' },
  { value: 'timeline', label: 'Timeline', desc: 'Date-based completion' },
  { value: 'zero', label: 'Zero-based', desc: 'Zero = 100% success' },
];
const statusBadge: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', locked: 'bg-purple-100 text-purple-700',
};

interface GoalForm { thrust_area: string; title: string; description: string; uom_type: string; target_value: string; target_date: string; weightage: string; }
const emptyForm: GoalForm = { thrust_area: '', title: '', description: '', uom_type: 'numeric_min', target_value: '', target_date: '', weightage: '' };

export default function EmployeeGoalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchGoals = async () => {
    try {
      const [goalsRes, cycleRes] = await Promise.all([
        api.get('/goals/'),
        api.get('/cycles/active').catch(() => ({ data: null })),
      ]);
      setGoals(goalsRes.data);
      setCycle(cycleRes.data);
    } catch { showToast('Failed to load goals', 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchGoals(); }, []);

  const totalWeightage = goals.reduce((sum, g) => sum + g.weightage, 0);
  const remaining = 100 - totalWeightage;

  const openAddModal = () => { setEditingGoal(null); setForm(emptyForm); setFormErrors({}); setModalOpen(true); };
  const openEditModal = (goal: any) => {
    setEditingGoal(goal);
    setForm({
      thrust_area: goal.thrust_area, title: goal.title, description: goal.description || '',
      uom_type: goal.uom_type, target_value: goal.target_value?.toString() || '',
      target_date: goal.target_date || '', weightage: goal.weightage.toString(),
    });
    setFormErrors({}); setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Goal title is required';
    if (!form.thrust_area) errors.thrust_area = 'Select a thrust area';
    const w = parseFloat(form.weightage);
    if (isNaN(w) || w < 10) errors.weightage = 'Minimum weightage is 10%';
    const maxAdd = editingGoal ? remaining + editingGoal.weightage : remaining;
    if (w > maxAdd) errors.weightage = `Adding ${w}% would exceed 100% (${maxAdd}% available)`;
    if ((form.uom_type === 'numeric_min' || form.uom_type === 'numeric_max') && !form.target_value) errors.target_value = 'Target value required';
    if (form.uom_type === 'timeline' && !form.target_date) errors.target_date = 'Target date required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm() || !cycle) return;
    setSaving(true);
    try {
      const payload: any = {
        cycle_id: cycle.id, thrust_area: form.thrust_area, title: form.title,
        description: form.description || null, uom_type: form.uom_type,
        weightage: parseFloat(form.weightage),
        target_value: form.uom_type === 'timeline' || form.uom_type === 'zero' ? null : parseFloat(form.target_value) || null,
        target_date: form.uom_type === 'timeline' ? form.target_date : null,
      };
      if (editingGoal) {
        await api.put(`/goals/${editingGoal.id}`, payload);
        showToast('Goal updated', 'success');
      } else {
        await api.post('/goals/', payload);
        showToast('Goal created', 'success');
      }
      setModalOpen(false);
      fetchGoals();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to save goal', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this goal?')) return;
    try {
      await api.delete(`/goals/${id}`);
      showToast('Goal deleted', 'success');
      fetchGoals();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed to delete', 'error'); }
  };

  const handleSubmitAll = async () => {
    if (Math.abs(totalWeightage - 100) > 0.01) {
      showToast(`Total weightage is ${totalWeightage}%, must be exactly 100%`, 'error');
      return;
    }
    const drafts = goals.filter(g => g.status === 'draft' || g.status === 'rejected');
    if (drafts.length === 0) { showToast('No goals to submit', 'info'); return; }
    setSubmitting(true);
    try {
      for (const g of drafts) {
        await api.post(`/goals/${g.id}/submit`);
      }
      showToast(`${drafts.length} goal(s) submitted for approval`, 'success');
      fetchGoals();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Submit failed', 'error'); }
    setSubmitting(false);
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  const canSubmit = Math.abs(totalWeightage - 100) <= 0.01 && goals.some(g => g.status === 'draft' || g.status === 'rejected');

  return (
    <div>
      <Navbar title="My Goals" />
      <div className="p-6">
        {/* Weightage Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Weightage Allocation</p>
            <p className="text-xs text-slate-500">{totalWeightage}% used · {remaining}% remaining · {goals.length} goals (max 8)</p>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${totalWeightage === 100 ? 'bg-green-500' : totalWeightage > 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                 style={{ width: `${Math.min(totalWeightage, 100)}%` }} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-4">
          <button onClick={openAddModal} disabled={goals.length >= 8}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
            <Plus size={16} /> Add Goal
          </button>
          <button onClick={handleSubmitAll} disabled={!canSubmit || submitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
            title={!canSubmit ? 'Total weightage must equal 100%' : ''}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit All for Approval
          </button>
        </div>

        {/* Goal Cards */}
        {goals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <Plus size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No goals found. Click + Add Goal to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {goals.map((g) => {
              const lastApproval = (g.approvals || []).filter((a: any) => a.action === 'returned' || a.action === 'rejected').pop();
              const isSharedChild = g.is_shared && g.parent_goal_id;
              return (
                <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">{g.thrust_area}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${statusBadge[g.status]}`}>{g.status}</span>
                        {isSharedChild && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full flex items-center gap-1"><Lock size={10} /> Shared</span>}
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-1">{g.title}</h4>
                      {g.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{g.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>UoM: {g.uom_type.replace('_', ' ')}</span>
                        <span>Target: {g.target_value != null ? g.target_value.toLocaleString() : g.target_date || 'N/A'}</span>
                        <span className="font-semibold text-slate-700">{g.weightage}%</span>
                      </div>
                    </div>
                    {(g.status === 'draft' || g.status === 'rejected') && (
                      <div className="flex items-center gap-1 ml-4">
                        <button onClick={() => openEditModal(g)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(g.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                  {lastApproval && g.status === 'rejected' && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-0.5">Manager Feedback</p>
                      <p className="text-xs text-amber-600">{lastApproval.comment}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800">{editingGoal ? 'Edit Goal' : 'Add New Goal'}</h3>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Thrust Area *</label>
                  <select value={form.thrust_area} onChange={(e) => setForm({ ...form, thrust_area: e.target.value })}
                    disabled={editingGoal?.is_shared && editingGoal?.parent_goal_id}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                    <option value="">Select...</option>
                    {thrustAreas.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {formErrors.thrust_area && <p className="text-xs text-red-500 mt-1">{formErrors.thrust_area}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goal Title *</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200}
                    disabled={editingGoal?.is_shared && editingGoal?.parent_goal_id}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                  {formErrors.title && <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unit of Measurement *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {uomOptions.map(o => (
                      <button key={o.value} type="button" onClick={() => setForm({ ...form, uom_type: o.value })}
                        disabled={editingGoal?.is_shared && editingGoal?.parent_goal_id}
                        className={`text-left p-3 rounded-lg border text-sm transition ${form.uom_type === o.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'} disabled:opacity-50`}>
                        <p className="font-medium text-slate-700">{o.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{o.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                {(form.uom_type === 'numeric_min' || form.uom_type === 'numeric_max') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Value *</label>
                    <input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                      disabled={editingGoal?.is_shared && editingGoal?.parent_goal_id}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    {formErrors.target_value && <p className="text-xs text-red-500 mt-1">{formErrors.target_value}</p>}
                  </div>
                )}
                {form.uom_type === 'timeline' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Date *</label>
                    <input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                      disabled={editingGoal?.is_shared && editingGoal?.parent_goal_id}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    {formErrors.target_date && <p className="text-xs text-red-500 mt-1">{formErrors.target_date}</p>}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Weightage (%) *</label>
                  <input type="number" value={form.weightage} onChange={(e) => setForm({ ...form, weightage: e.target.value })} min={10} max={90}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {formErrors.weightage && <p className="text-xs text-red-500 mt-1">{formErrors.weightage}</p>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
