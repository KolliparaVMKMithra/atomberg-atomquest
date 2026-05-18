'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import ProgressBar from '@/components/ProgressBar';
import { Loader2, MessageSquare, Save, Pencil } from 'lucide-react';

export default function ManagerCheckinPage() {
  const { showToast } = useToast();
  const [team, setTeam] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<number | ''>('');
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [achievements, setAchievements] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [newComments, setNewComments] = useState<Record<number, string>>({});
  const [showComment, setShowComment] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users/team').then(res => setTeam(res.data)).catch(() => {});
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedEmp) { setAchievements([]); return; }
    const fetch = async () => {
      try {
        const [achRes, ciRes] = await Promise.all([
          api.get('/achievements/', { params: { quarter: selectedQuarter } }),
          api.get('/checkins/team', { params: { quarter: selectedQuarter, employee_id: selectedEmp } }),
        ]);
        const empAchs = achRes.data.filter((a: any) => a.goal?.employee_id === selectedEmp);
        setAchievements(empAchs);
        setCheckins(ciRes.data);
      } catch {}
    };
    fetch();
  }, [selectedEmp, selectedQuarter]);

  const getCheckin = (achievementId: number) => checkins.find(c => c.achievement_id === achievementId);

  const handleSaveComment = async (achievementId: number) => {
    const comment = newComments[achievementId];
    if (!comment?.trim()) { showToast('Comment is required', 'error'); return; }
    setSaving({ ...saving, [achievementId]: true });
    try {
      await api.post('/checkins/', { achievement_id: achievementId, comment });
      showToast('Check-in comment saved', 'success');
      setShowComment({ ...showComment, [achievementId]: false });
      setNewComments({ ...newComments, [achievementId]: '' });
      // Refresh
      const ciRes = await api.get('/checkins/team', { params: { quarter: selectedQuarter, employee_id: selectedEmp } });
      setCheckins(ciRes.data);
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed to save', 'error'); }
    setSaving({ ...saving, [achievementId]: false });
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Team Check-ins" />
      <div className="p-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Team Member</label>
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm">
              <option value="">Select...</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
            <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm">
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        {/* Results */}
        {!selectedEmp ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-sm">Select a team member to view their check-ins.</p>
          </div>
        ) : achievements.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-sm">No achievements found for {selectedQuarter}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">Goal Title</th>
                  <th className="text-center px-3 py-3 font-semibold">Target</th>
                  <th className="text-center px-3 py-3 font-semibold">Actual</th>
                  <th className="text-center px-3 py-3 font-semibold">Score</th>
                  <th className="text-center px-3 py-3 font-semibold">Status</th>
                  <th className="text-left px-3 py-3 font-semibold">Comment</th>
                </tr>
              </thead>
              <tbody>
                {achievements.map(ach => {
                  const goal = ach.goal;
                  const existingCheckin = getCheckin(ach.id);
                  return (
                    <tr key={ach.id} className="border-b border-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{goal?.title}</td>
                      <td className="px-3 py-3 text-center text-slate-600">{goal?.target_value ?? goal?.target_date ?? '—'}</td>
                      <td className="px-3 py-3 text-center text-slate-600">{ach.actual_value ?? ach.actual_date ?? '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="w-24 mx-auto"><ProgressBar score={ach.progress_score || 0} /></div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs capitalize px-2 py-0.5 bg-slate-100 rounded-full">{ach.status?.replace('_', ' ')}</span>
                      </td>
                      <td className="px-3 py-3">
                        {existingCheckin ? (
                          <div className="bg-slate-50 rounded p-2 text-xs text-slate-600">{existingCheckin.comment}</div>
                        ) : showComment[ach.id] ? (
                          <div className="flex items-end gap-2">
                            <textarea value={newComments[ach.id] || ''} onChange={e => setNewComments({ ...newComments, [ach.id]: e.target.value })}
                              className="flex-1 px-2 py-1.5 border rounded text-xs" rows={2} placeholder="Add comment..." />
                            <button onClick={() => handleSaveComment(ach.id)} disabled={saving[ach.id]}
                              className="p-1.5 bg-blue-600 text-white rounded text-xs">
                              {saving[ach.id] ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setShowComment({ ...showComment, [ach.id]: true })}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <MessageSquare size={12} /> Add Comment
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
