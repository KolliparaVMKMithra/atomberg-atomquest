'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Users, ClipboardList, CheckCircle, Loader2, Eye, X } from 'lucide-react';

export default function ManagerDashboard() {
  const [team, setTeam] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [teamRes, goalsRes, cycleRes] = await Promise.all([
          api.get('/users/team'),
          api.get('/goals/team'),
          api.get('/cycles/active').catch(() => ({ data: null })),
        ]);
        setTeam(teamRes.data);
        setGoals(goalsRes.data);
        setCycle(cycleRes.data);
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, []);

  const pendingApproval = goals.filter(g => g.status === 'submitted').length;
  const empGoals = (empId: number) => goals.filter(g => g.employee_id === empId);

  const getQuarterScore = (empId: number, quarter: string) => {
    const eg = empGoals(empId);
    const scores = eg.flatMap(g => (g.achievements || []).filter((a: any) => a.quarter === quarter).map((a: any) => a.progress_score || 0));
    if (scores.length === 0) return '—';
    return (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(0) + '%';
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="Team Dashboard" />
      <div className="p-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><Users size={20} className="text-blue-600" /></div>
              <p className="text-sm text-slate-500">Direct Reports</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{team.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center"><ClipboardList size={20} className="text-amber-600" /></div>
              <p className="text-sm text-slate-500">Pending Approval</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{pendingApproval}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
              <p className="text-sm text-slate-500">Active Cycle</p>
            </div>
            <p className="text-lg font-bold text-slate-800">{cycle?.name || 'None'}</p>
          </div>
        </div>

        {/* Team Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Team Members</h3>
          </div>
          {team.length === 0 ? (
            <div className="p-12 text-center text-slate-400"><p className="text-sm">No direct reports found.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">Name</th>
                  <th className="text-center px-3 py-3 font-semibold">Goals</th>
                  <th className="text-center px-3 py-3 font-semibold">Status</th>
                  <th className="text-center px-3 py-3 font-semibold">Q1</th>
                  <th className="text-center px-3 py-3 font-semibold">Q2</th>
                  <th className="text-center px-3 py-3 font-semibold">Q3</th>
                  <th className="text-center px-3 py-3 font-semibold">Q4</th>
                  <th className="text-center px-3 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {team.map(emp => {
                  const eg = empGoals(emp.id);
                  const submitted = eg.filter(g => g.status === 'submitted').length;
                  const approved = eg.filter(g => ['approved', 'locked'].includes(g.status)).length;
                  return (
                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{emp.name}</p>
                        <p className="text-xs text-slate-400">{emp.department}</p>
                      </td>
                      <td className="px-3 py-3 text-center">{eg.length}</td>
                      <td className="px-3 py-3 text-center text-xs">
                        {submitted > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{submitted} pending</span>}
                        {approved > 0 && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full ml-1">{approved} approved</span>}
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(emp.id, 'Q1')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(emp.id, 'Q2')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(emp.id, 'Q3')}</td>
                      <td className="px-3 py-3 text-center text-xs font-medium">{getQuarterScore(emp.id, 'Q4')}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => setSelectedEmp(emp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Side panel */}
        {selectedEmp && (
          <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setSelectedEmp(null)}>
            <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">{selectedEmp.name}</h3>
                  <p className="text-xs text-slate-400">{selectedEmp.department} · {selectedEmp.email}</p>
                </div>
                <button onClick={() => setSelectedEmp(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-3">
                {empGoals(selectedEmp.id).map((g: any) => (
                  <div key={g.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{g.thrust_area}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${g.status === 'locked' ? 'bg-purple-100 text-purple-700' : g.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{g.status}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{g.title}</p>
                    <p className="text-xs text-slate-500 mt-1">Weight: {g.weightage}% · Target: {g.target_value ?? g.target_date ?? 'N/A'}</p>
                    {(g.achievements || []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {g.achievements.map((a: any) => (
                          <div key={a.id} className="text-xs text-slate-500 flex justify-between">
                            <span>{a.quarter}</span>
                            <span className="font-medium">{(a.progress_score || 0).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {empGoals(selectedEmp.id).length === 0 && <p className="text-sm text-slate-400 text-center py-8">No goals found for this employee.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
