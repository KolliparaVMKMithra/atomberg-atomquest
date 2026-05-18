'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Loader2, Shield, ChevronDown, ChevronUp } from 'lucide-react';

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ table: '', user_id: '', from_date: '', to_date: '' });
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = { page, per_page: 20 };
      if (filters.table) params.table = filters.table;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      const res = await api.get('/admin/audit-logs', { params });
      setLogs(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page, filters]);

  const renderDiff = (oldVal: any, newVal: any) => {
    if (!oldVal && !newVal) return <span className="text-slate-400 text-xs">No data</span>;
    const allKeys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);
    return (
      <div className="font-mono text-xs space-y-0.5">
        {Array.from(allKeys).map(key => {
          const o = oldVal?.[key];
          const n = newVal?.[key];
          if (o === n) return <div key={key} className="text-slate-500">{key}: {JSON.stringify(o)}</div>;
          return (
            <div key={key}>
              {o !== undefined && <div className="text-red-600 bg-red-50 px-1 rounded">- {key}: {JSON.stringify(o)}</div>}
              {n !== undefined && <div className="text-green-600 bg-green-50 px-1 rounded">+ {key}: {JSON.stringify(n)}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <Navbar title="Audit Log" />
      <div className="p-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Table</label>
            <select value={filters.table} onChange={e => setFilters({ ...filters, table: e.target.value })} className="px-3 py-2.5 border rounded-lg text-sm">
              <option value="">All</option>
              {['goals', 'achievements', 'users', 'cycles'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input type="date" value={filters.from_date} onChange={e => setFilters({ ...filters, from_date: e.target.value })} className="px-3 py-2.5 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input type="date" value={filters.to_date} onChange={e => setFilters({ ...filters, to_date: e.target.value })} className="px-3 py-2.5 border rounded-lg text-sm" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin text-blue-600 mx-auto" size={24} /></div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm"><Shield size={24} className="mx-auto mb-2 opacity-40" />No audit entries found</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-semibold">Timestamp</th>
                    <th className="text-left px-3 py-3 font-semibold">Table</th>
                    <th className="text-center px-3 py-3 font-semibold">Record ID</th>
                    <th className="text-left px-3 py-3 font-semibold">Action</th>
                    <th className="text-left px-3 py-3 font-semibold">Changed By</th>
                    <th className="text-center px-3 py-3 font-semibold">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-5 py-3 text-xs text-slate-500">{new Date(log.changed_at).toLocaleString()}</td>
                        <td className="px-3 py-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{log.table_name}</span></td>
                        <td className="px-3 py-3 text-center text-slate-600">{log.record_id}</td>
                        <td className="px-3 py-3 font-medium text-slate-700">{log.action}</td>
                        <td className="px-3 py-3 text-slate-600">{log.changed_by_user?.name || log.changed_by}</td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)} className="text-blue-600 hover:underline text-xs flex items-center gap-1 mx-auto">
                            {expandedRow === log.id ? <><ChevronUp size={12} /> Hide</> : <><ChevronDown size={12} /> View</>}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === log.id && (
                        <tr><td colSpan={6} className="px-5 py-4 bg-slate-50">{renderDiff(log.old_values, log.new_values)}</td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t flex items-center justify-between">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-sm text-slate-500 hover:text-blue-600 disabled:opacity-50">Previous</button>
                <span className="text-sm text-slate-500">Page {page}</span>
                <button onClick={() => setPage(page + 1)} disabled={logs.length < 20} className="text-sm text-slate-500 hover:text-blue-600 disabled:opacity-50">Next</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
