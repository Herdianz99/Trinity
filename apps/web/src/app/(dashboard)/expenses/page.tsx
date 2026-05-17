'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Hash,
  X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DynamicKeyModal from '@/components/dynamic-key-modal';

interface Expense {
  id: string;
  categoryId: string;
  category: { name: string };
  description: string;
  reference: string | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  date: string;
  notes: string | null;
  createdById: string;
  createdBy: { name: string };
  createdAt: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

interface Summary {
  totalUsd: number;
  totalBs: number;
  byCategory: { categoryName: string; totalUsd: number; totalBs: number; count: number }[];
  byMonth: { month: string; totalUsd: number; totalBs: number }[];
}

const CHART_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  });

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    categoryId: '',
    description: '',
    reference: '',
    amountUsd: '',
    amountBs: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [todayRate, setTodayRate] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Permissions
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    fetch('/api/proxy/auth/me').then(r => r.json()).then(data => {
      setUserPermissions(data.permissions || []);
      setUserRole(data.role || '');
      setUserId(data.id || '');
    }).catch(() => {});
  }, []);

  const canManage = userPermissions.includes('*') || userPermissions.includes('MANAGE_EXPENSES');
  const isAdmin = userRole === 'ADMIN';

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '25');
      if (categoryId) params.set('categoryId', categoryId);
      if (search) params.set('search', search);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/expenses?${params}`);
      const data = await res.json();
      setExpenses(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar gastos' });
    } finally {
      setLoading(false);
    }
  }, [page, categoryId, search, from, to]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/proxy/expenses/summary?${params}`);
      const data = await res.json();
      setSummary(data);
    } catch {}
  }, [from, to]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/expense-categories/active');
      const data = await res.json();
      setCategories(data);
    } catch {}
  }, []);

  const fetchRate = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/exchange-rate/today');
      const data = await res.json();
      setTodayRate(data?.rate || 0);
    } catch {}
  }, []);

  useEffect(() => { fetchCategories(); fetchRate(); }, [fetchCategories, fetchRate]);
  useEffect(() => { fetchExpenses(); fetchSummary(); }, [fetchExpenses, fetchSummary]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  function openCreateModal() {
    setEditingExpense(null);
    setFormData({
      categoryId: categories[0]?.id || '',
      description: '',
      reference: '',
      amountUsd: '',
      amountBs: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setModalOpen(true);
  }

  function openEditModal(exp: Expense) {
    setEditingExpense(exp);
    setFormData({
      categoryId: exp.categoryId,
      description: exp.description,
      reference: exp.reference || '',
      amountUsd: exp.amountUsd.toString(),
      amountBs: exp.amountBs.toString(),
      date: exp.date.split('T')[0],
      notes: exp.notes || '',
    });
    setModalOpen(true);
  }

  function handleAmountUsdChange(val: string) {
    setFormData(prev => {
      const usd = parseFloat(val) || 0;
      return { ...prev, amountUsd: val, amountBs: todayRate ? (usd * todayRate).toFixed(2) : prev.amountBs };
    });
  }

  function handleAmountBsChange(val: string) {
    setFormData(prev => {
      const bs = parseFloat(val) || 0;
      return { ...prev, amountBs: val, amountUsd: todayRate ? (bs / todayRate).toFixed(2) : prev.amountUsd };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const body: any = {
        categoryId: formData.categoryId,
        description: formData.description,
        date: formData.date,
      };
      if (formData.reference) body.reference = formData.reference;
      if (formData.notes) body.notes = formData.notes;
      if (formData.amountUsd) body.amountUsd = parseFloat(formData.amountUsd);
      if (formData.amountBs) body.amountBs = parseFloat(formData.amountBs);

      const url = editingExpense ? `/api/proxy/expenses/${editingExpense.id}` : '/api/proxy/expenses';
      const method = editingExpense ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error');
      }

      setMessage({ type: 'success', text: editingExpense ? 'Gasto actualizado' : 'Gasto registrado' });
      setModalOpen(false);
      fetchExpenses();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  function requestDelete(id: string) {
    setPendingDeleteId(id);
    setAuthModalOpen(true);
  }

  async function executeDelete() {
    if (!pendingDeleteId) return;
    try {
      const res = await fetch(`/api/proxy/expenses/${pendingDeleteId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error');
      }
      setMessage({ type: 'success', text: 'Gasto eliminado' });
      fetchExpenses();
      fetchSummary();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPendingDeleteId(null);
    }
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <Wallet className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Control de Gastos</h1>
            <p className="text-sm text-slate-400">{total} gastos en el periodo</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Registrar gasto
          </button>
        )}
      </div>

      {/* Toast */}
      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm font-medium ${
          message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-800/50 border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-red-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Total USD</span>
            </div>
            <p className="text-2xl font-bold text-red-400">${summary.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/50 border border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-red-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Total Bs</span>
            </div>
            <p className="text-2xl font-bold text-red-400">Bs {summary.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Hash size={16} className="text-slate-400" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">Cantidad</span>
            </div>
            <p className="text-2xl font-bold text-slate-200">{summary.byCategory.reduce((s, c) => s + c.count, 0)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Categoria</label>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
          >
            <option value="">Todas</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
          />
        </div>
        <div className="relative">
          <label className="block text-xs text-slate-400 mb-1">Buscar</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Descripcion o referencia..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm w-56"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/60 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Descripcion</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Referencia</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">USD</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Bs</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Registrado por</th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12"><Loader2 className="animate-spin inline-block text-slate-500" size={24} /></td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-500">No hay gastos registrados en este periodo</td></tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-300">{new Date(exp.date).toLocaleDateString('es-VE')}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50">
                      {exp.category.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200 max-w-[200px] truncate">{exp.description}</td>
                  <td className="px-4 py-3 text-slate-400">{exp.reference || '-'}</td>
                  <td className="px-4 py-3 text-right text-red-400 font-medium">${exp.amountUsd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-red-300">Bs {exp.amountBs.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-400">{exp.createdBy.name}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(isAdmin || exp.createdById === userId) && (
                        <button onClick={() => openEditModal(exp)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                          <Pencil size={14} />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => requestDelete(exp.id)} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-red-400 transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{total} gastos total</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-400">Pag {page} de {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Chart by Category */}
      {summary && summary.byCategory.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Gastos por Categoria (USD)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...summary.byCategory].sort((a, b) => b.totalUsd - a.totalUsd)} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="categoryName" tick={{ fill: '#cbd5e1', fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Total USD']}
                />
                <Bar dataKey="totalUsd" radius={[0, 4, 4, 0]}>
                  {[...summary.byCategory].sort((a, b) => b.totalUsd - a.totalUsd).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DynamicKeyModal
        isOpen={authModalOpen}
        onClose={() => { setAuthModalOpen(false); setPendingDeleteId(null); }}
        onAuthorized={executeDelete}
        permission="DELETE_EXPENSE"
        entityType="Expense"
        entityId={pendingDeleteId || undefined}
        action={`Eliminar gasto`}
      />

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">
                {editingExpense ? 'Editar gasto' : 'Registrar gasto'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Categoria *</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripcion *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  placeholder="Descripcion del gasto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Referencia</label>
                  <input
                    type="text"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                    placeholder="# comprobante"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Monto USD</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountUsd}
                    onChange={(e) => handleAmountUsdChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Monto Bs</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amountBs}
                    onChange={(e) => handleAmountBsChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>
              {todayRate > 0 && (
                <p className="text-xs text-slate-500">Tasa del dia: {todayRate.toFixed(2)} Bs/USD</p>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm resize-none"
                  placeholder="Notas adicionales..."
                />
              </div>
              <button
                type="submit"
                disabled={processing}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing && <Loader2 size={16} className="animate-spin" />}
                {editingExpense ? 'Actualizar' : 'Registrar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
