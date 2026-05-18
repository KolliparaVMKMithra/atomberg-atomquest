'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Check, RotateCcw, Pencil, Loader2, CheckCircle2, X } from 'lucide-react';

export default function ManagerApprovePage() {
  const { showToast } = useToast();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnComment, setReturnComment] = useState<Record<number, string>>({});
  const [showReturn, setShowReturn] = useState<Record<number, boolean>>({});
  const [inlineEdit, setInlineEdit] = useState<Record<number, { weightage?: string; target_value?: string }>>({});
  const [showInline, setShowInline] = useState<Record<number, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const fetchGoals = async () => {
    try {
      const res = await api.get('/goals/team');
      setGoals(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchGoals(); }, []);

  const submittedGoals = goals.filter(g => g.status === 'submitted');

  // Group by employee
  const byEmployee: Record<number, any[]> = {};
  for (const g of submittedGoals) {
    const eid = g.employee_id;
    if (!byEmployee[eid]) byEmployee[eid] = [];
    byEmployee[eid].push(g);
  }

  const getEmployeeTotalWeightage = (empId: number) => {
    const empGoals = goals.filter(g => g.employee_id === empId);
    return empGoals.reduce((sum, g) => sum + g.weightage, 0);
  };

  const handleApprove = async (goalId: number) => {
    setActionLoading({ ...actionLoading, [goalId]: true });
    try {
      await api.put(`/goals/${goalId}/approve`);
      showToast('Goal approved and locked', 'success');
      fetchGoals();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Approval failed', 'error'); }
    setActionLoading({ ...actionLoading, [goalId]: false });
  };

  const handleReturn = async (goalId: number) => {
    const comment = returnComment[goalId];
    if (!comment?.trim()) { showToast('Comment is required', 'error'); return; }
    setActionLoading({ ...actionLoading, [goalId]: true });
    try {
      await api.put(`/goals/${goalId}/return`, { comment });
      showToast('Goal returned for rework', 'success');
      setShowReturn({ ...showReturn, [goalId]: false });
      fetchGoals();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Return failed', 'error'); }
    setActionLoading({ ...actionLoading, [goalId]: false });
  };

  const handleInlineEdit = async (goalId: number) => {
    const edits = inlineEdit[goalId];
    if (!edits) return;
    setActionLoading({ ...actionLoading, [goalId]: true });
    try {
      const payload: any = {};
      if (edits.weightage) payload.weightage = parseFloat(edits.weightage);
      if (edits.target_value) payload.target_value = parseFloat(edits.target_value);
      await api.put(`/goals/${goalId}/inline-edit`, payload);
      showToast('Goal updated', 'success');
      setShowInline({ ...showInline, [goalId]: false });
      fetchGoals();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Edit failed', 'error'); }
    setActionLoading({ ...actionLoading, [goalId]: false });
  };

  const handleBulkApprove = async (empId: number) => {
    const totalW = getEmployeeTotalWeightage(empId);
    if (Math.abs(totalW - 100) > 0.01) {
      showToast(`Total weightage is ${totalW}%. Must be 100%`, 'error');
      return;
    }
    const empSubmitted = byEmployee[empId] || [];
    for (const g of empSubmitted) {
      await handleApprove(g.id);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Goal Approvals" />
      <div className="p-6">
        {Object.keys(byEmployee).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <CheckCircle2 size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No goals pending approval.</p>
          </div>
        ) : (
          Object.entries(byEmployee).map(([empId, empGoals]) => {
            const emp = empGoals[0]?.employee;
            const totalW = getEmployeeTotalWeightage(Number(empId));
            const isValid = Math.abs(totalW - 100) <= 0.01;
            return (
              <div key={empId} className="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-200">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{emp?.name || 'Employee'}</p>
                    <p className="text-xs text-slate-400">{emp?.department} · {empGoals.length} goal(s) pending</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      Weightage: {totalW}% {isValid ? '✓' : '✗'}
                    </span>
                    <button onClick={() => handleBulkApprove(Number(empId))} disabled={!isValid}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                      Approve All
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {empGoals.map(g => (
                    <div key={g.id} className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{g.thrust_area}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-800">{g.title}</h4>
                          {g.description && <p className="text-xs text-slate-500 mt-1">{g.description}</p>}
                          <div className="flex gap-4 mt-2 text-xs text-slate-500">
                            <span>UoM: {g.uom_type.replace('_', ' ')}</span>
                            <span>Target: {g.target_value ?? g.target_date ?? 'N/A'}</span>
                            <span className="font-semibold">Weight: {g.weightage}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setShowInline({ ...showInline, [g.id]: !showInline[g.id] })}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Inline Edit">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleApprove(g.id)} disabled={actionLoading[g.id]}
                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Approve">
                            {actionLoading[g.id] ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          </button>
                          <button onClick={() => setShowReturn({ ...showReturn, [g.id]: !showReturn[g.id] })}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Return">
                            <RotateCcw size={15} />
                          </button>
                        </div>
                      </div>

                      {showInline[g.id] && (
                        <div className="mt-3 bg-blue-50 rounded-lg p-3 flex items-end gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Target</label>
                            <input type="number" defaultValue={g.target_value || ''}
                              onChange={e => setInlineEdit({ ...inlineEdit, [g.id]: { ...inlineEdit[g.id], target_value: e.target.value } })}
                              className="px-3 py-1.5 border rounded-lg text-sm w-32" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Weightage</label>
                            <input type="number" defaultValue={g.weightage}
                              onChange={e => setInlineEdit({ ...inlineEdit, [g.id]: { ...inlineEdit[g.id], weightage: e.target.value } })}
                              className="px-3 py-1.5 border rounded-lg text-sm w-24" />
                          </div>
                          <button onClick={() => handleInlineEdit(g.id)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg">Save</button>
                          <button onClick={() => setShowInline({ ...showInline, [g.id]: false })} className="px-3 py-1.5 text-slate-500 text-sm">Cancel</button>
                        </div>
                      )}

                      {showReturn[g.id] && (
                        <div className="mt-3 bg-amber-50 rounded-lg p-3">
                          <textarea placeholder="Add comment for return..." value={returnComment[g.id] || ''}
                            onChange={e => setReturnComment({ ...returnComment, [g.id]: e.target.value })}
                            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm mb-2" rows={2} />
                          <div className="flex gap-2">
                            <button onClick={() => handleReturn(g.id)} disabled={actionLoading[g.id]}
                              className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
                              {actionLoading[g.id] ? 'Sending...' : 'Return for Rework'}
                            </button>
                            <button onClick={() => setShowReturn({ ...showReturn, [g.id]: false })} className="px-3 py-1.5 text-slate-500 text-sm">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
