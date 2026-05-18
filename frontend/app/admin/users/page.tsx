'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import Navbar from '@/components/Navbar';
import { Plus, Pencil, Loader2, X, UserPlus } from 'lucide-react';

const roles = ['employee', 'manager', 'admin'];
const roleBadge: Record<string, string> = {
  employee: 'bg-blue-100 text-blue-700', manager: 'bg-emerald-100 text-emerald-700', admin: 'bg-purple-100 text-purple-700',
};

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', department: '', manager_id: '' });
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try { const res = await api.get('/users/'); setUsers(res.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetchUsers(); }, []);

  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');

  const openAdd = () => { setEditUser(null); setForm({ name: '', email: '', password: '', role: 'employee', department: '', manager_id: '' }); setModalOpen(true); };
  const openEdit = (u: any) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, department: u.department || '', manager_id: u.manager_id?.toString() || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { name: form.name, email: form.email, role: form.role, department: form.department || null, manager_id: form.manager_id ? parseInt(form.manager_id) : null };
      if (editUser) {
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editUser.id}`, payload);
        showToast('User updated', 'success');
      } else {
        payload.password = form.password;
        await api.post('/users/', payload);
        showToast('User created', 'success');
      }
      setModalOpen(false); fetchUsers();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed', 'error'); }
    setSaving(false);
  };

  const toggleActive = async (u: any) => {
    try {
      if (u.is_active) {
        if (!confirm(`Deactivate ${u.name}?`)) return;
        await api.delete(`/users/${u.id}`);
      } else {
        await api.put(`/users/${u.id}`, { is_active: true });
      }
      showToast(`User ${u.is_active ? 'deactivated' : 'activated'}`, 'success');
      fetchUsers();
    } catch (err: any) { showToast(err.response?.data?.detail || 'Failed', 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div>
      <Navbar title="User Management" />
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-700">{users.length} users</h3>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <UserPlus size={16} /> Add User
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">Name</th>
                <th className="text-left px-3 py-3 font-semibold">Email</th>
                <th className="text-center px-3 py-3 font-semibold">Role</th>
                <th className="text-left px-3 py-3 font-semibold">Dept</th>
                <th className="text-left px-3 py-3 font-semibold">Manager</th>
                <th className="text-center px-3 py-3 font-semibold">Status</th>
                <th className="text-center px-3 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-3 py-3 text-slate-600">{u.email}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${roleBadge[u.role]}`}>{u.role}</span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{u.department || '—'}</td>
                  <td className="px-3 py-3 text-slate-600">{users.find(m => m.id === u.manager_id)?.name || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => toggleActive(u)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.is_active ? 'bg-green-500' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${u.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => openEdit(u)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between p-5 border-b">
                <h3 className="text-lg font-semibold text-slate-800">{editUser ? 'Edit User' : 'Add User'}</h3>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password {editUser ? '(leave blank to keep)' : '*'}</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Manager</label>
                  <select value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })} className="w-full px-3 py-2.5 border rounded-lg text-sm">
                    <option value="">None</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null} {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
