'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Download, Loader2, FileText } from 'lucide-react';

export default function AdminReportsPage() {
  const { showToast } = useToast();
  const [cycles, setCycles] = useState<any[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ cycle_id: '', quarter: '', department: '', format: 'json' });

  useEffect(() => {
    api.get('/admin/cycles').then(res => setCycles(res.data)).catch(() => {});
  }, []);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.cycle_id) params.cycle_id = filters.cycle_id;
      if (filters.quarter) params.quarter = filters.quarter;
      if (filters.department) params.department = filters.department;
      params.format = 'json';
      const res = await api.get('/reports/achievement', { params });
      setReport(res.data);
    } catch { showToast('Failed to load report', 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchPreview(); }, [filters.cycle_id, filters.quarter, filters.department]);

  const handleDownload = async (fmt: string) => {
    try {
      const params: any = { format: fmt };
      if (filters.cycle_id) params.cycle_id = filters.cycle_id;
      if (filters.quarter) params.quarter = filters.quarter;
      if (filters.department) params.department = filters.department;
      const res = await api.get('/reports/achievement', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${fmt === 'excel' ? 'xlsx' : 'csv'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Report downloaded', 'success');
    } catch { showToast('Download failed', 'error'); }
  };

  return (
    <div>
      <Navbar title="Reports" />
      <div className="p-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cycle</label>
            <select value={filters.cycle_id} onChange={e => setFilters({ ...filters, cycle_id: e.target.value })} className="px-3 py-2.5 border rounded-lg text-sm">
              <option value="">All Cycles</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
            <select value={filters.quarter} onChange={e => setFilters({ ...filters, quarter: e.target.value })} className="px-3 py-2.5 border rounded-lg text-sm">
              <option value="">All</option>
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
            <input value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })} placeholder="e.g. Engineering" className="px-3 py-2.5 border rounded-lg text-sm" />
          </div>
          <button onClick={() => handleDownload('csv')} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Download size={16} /> CSV
          </button>
          <button onClick={() => handleDownload('excel')} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Download size={16} /> Excel
          </button>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Preview ({report.length} rows)</h3>
          </div>
          {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin text-blue-600 mx-auto" size={24} /></div>
          ) : report.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm"><FileText size={24} className="mx-auto mb-2 opacity-40" />No data found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    {Object.keys(report[0]).map(key => <th key={key} className="text-left px-4 py-3 font-semibold">{key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      {Object.values(row).map((val: any, j) => <td key={j} className="px-4 py-3 text-slate-600">{val?.toString() || '—'}</td>)}
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
