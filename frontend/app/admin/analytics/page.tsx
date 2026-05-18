'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Loader2, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

const COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777'];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/analytics')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  if (!data) return (
    <div>
      <Navbar title="Analytics" />
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <BarChart3 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No analytics data available. Ensure an active cycle exists with achievements.</p>
        </div>
      </div>
    </div>
  );

  // Transform QoQ data for LineChart
  const qoqData = [
    { quarter: 'Q1' } as any,
    { quarter: 'Q2' } as any,
    { quarter: 'Q3' } as any,
    { quarter: 'Q4' } as any,
  ];
  const departments = (data.qoq_trends || []).map((d: any) => d.department);
  for (const dept of data.qoq_trends || []) {
    for (let i = 0; i < 4; i++) {
      const q = ['Q1', 'Q2', 'Q3', 'Q4'][i];
      qoqData[i][dept.department] = dept[q] || 0;
    }
  }

  const heatmapColor = (val: number) => {
    if (val >= 80) return 'bg-green-200 text-green-800';
    if (val >= 50) return 'bg-amber-200 text-amber-800';
    return 'bg-red-200 text-red-800';
  };

  return (
    <div>
      <Navbar title="Analytics" />
      <div className="p-6 space-y-6">
        {/* Chart 1 - QoQ Achievement Trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">QoQ Achievement Trend by Department</h3>
          {departments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={qoqData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 150]} />
                <Tooltip />
                <Legend />
                {departments.map((dept: string, i: number) => (
                  <Line key={dept} type="monotone" dataKey={dept} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Chart 2 - Goal Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Goal Distribution by Thrust Area</h3>
            {(data.thrust_area_dist || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={data.thrust_area_dist} cx="50%" cy="50%" labelLine={false}
                    label={({ name, percentage }) => `${name} (${percentage}%)`}
                    outerRadius={100} fill="#8884d8" dataKey="count" nameKey="name">
                    {(data.thrust_area_dist || []).map((_: any, i: number) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 4 - Manager Effectiveness */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Manager Effectiveness (Check-in Rate)</h3>
            {(data.manager_effectiveness || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.manager_effectiveness} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="manager" type="category" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="rate" fill="#2563EB" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3 - Completion Heatmap */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Completion Rate Heatmap</h3>
          {(data.completion_heatmap || []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Department</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Q1</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Q2</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Q3</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Q4</th>
                </tr>
              </thead>
              <tbody>
                {(data.completion_heatmap || []).map((row: any) => (
                  <tr key={row.department} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{row.department}</td>
                    {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                      <td key={q} className="px-4 py-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${heatmapColor(row[q])}`}>
                          {row[q]}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
