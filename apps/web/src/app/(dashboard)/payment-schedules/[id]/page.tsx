'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CalendarClock,
  ArrowLeft,
  Loader2,
  Trash2,
  Printer,
  Check,
  X,
  AlertTriangle,
  Search,
  Plus,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react';

interface ScheduleItem {
  id: string;
  payableId: string | null;
  creditDebitNoteId: string | null;
  supplierName: string;
  description: string;
  totalAmountUsd: number;
  totalAmountBs: number;
  plannedAmountUsd: number;
  plannedAmountBs: number;
  isPaid: boolean;
  payable?: {
    id: string;
    dueDate: string | null;
    status: string;
    purchaseOrder?: { id: string; number: string } | null;
  } | null;
  creditDebitNote?: {
    id: string;
    number: string;
    type: string;
  } | null;
}

interface SupplierGroup {
  supplierName: string;
  totalUsd: number;
  totalBs: number;
  items: ScheduleItem[];
}

interface Schedule {
  id: string;
  number: string;
  title: string;
  status: string;
  budgetUsd: number | null;
  budgetBs: number | null;
  budgetCurrency: string | null;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  notes: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  items: ScheduleItem[];
  groupedBySupplier: SupplierGroup[];
}

interface PendingPayable {
  id: string;
  type: 'CXP' | 'NDC';
  supplierId: string | null;
  supplierName: string;
  reference: string;
  totalAmountUsd: number;
  totalAmountBs: number;
  paidAmountUsd: number;
  balanceUsd: number;
  balanceBs: number;
  dueDate: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobado',
  EXECUTED: 'Ejecutado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  APPROVED: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  EXECUTED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentScheduleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // User info
  const [userRole, setUserRole] = useState('');

  // Pending payables panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [pendingPayables, setPendingPayables] = useState<PendingPayable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [filterDueBefore, setFilterDueBefore] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [plannedAmounts, setPlannedAmounts] = useState<Record<string, string>>({});

  // Edit item
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  useEffect(() => {
    fetch('/api/proxy/auth/me')
      .then((r) => r.json())
      .then((data) => setUserRole(data.role || ''))
      .catch(() => {});
  }, []);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSchedule(data);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar la programacion' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  useEffect(() => {
    fetch('/api/proxy/suppliers?limit=500')
      .then((r) => r.json())
      .then((data) => setSuppliers(Array.isArray(data) ? data : (data.data || [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const fetchPendingPayables = useCallback(async () => {
    setPendingLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSupplierId) params.set('supplierId', filterSupplierId);
      if (filterDueBefore) params.set('dueBefore', filterDueBefore);
      if (filterSearch) params.set('search', filterSearch);

      const res = await fetch(`/api/proxy/payment-schedules/pending-payables?${params}`);
      const data = await res.json();
      setPendingPayables(Array.isArray(data) ? data : []);
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar documentos disponibles' });
    } finally {
      setPendingLoading(false);
    }
  }, [filterSupplierId, filterDueBefore, filterSearch]);

  useEffect(() => {
    if (showAddPanel) fetchPendingPayables();
  }, [showAddPanel, fetchPendingPayables]);

  // Filter out already-added documents
  const existingPayableIds = new Set(schedule?.items.filter((i) => i.payableId).map((i) => i.payableId) || []);
  const existingNoteIds = new Set(schedule?.items.filter((i) => i.creditDebitNoteId).map((i) => i.creditDebitNoteId) || []);
  const filteredPending = pendingPayables.filter((p) => {
    if (p.type === 'CXP') return !existingPayableIds.has(p.id);
    return !existingNoteIds.has(p.id);
  });

  const handleAddItem = async (p: PendingPayable) => {
    const amountStr = plannedAmounts[p.id] || p.balanceUsd.toString();
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) {
      setMessage({ type: 'error', text: 'Monto invalido' });
      return;
    }
    if (amount > p.balanceUsd) {
      setMessage({ type: 'error', text: `El monto excede el saldo pendiente ($${fmt(p.balanceUsd)})` });
      return;
    }

    setProcessing(true);
    try {
      const body: any = { plannedAmountUsd: amount };
      if (p.type === 'CXP') body.payableId = p.id;
      else body.creditDebitNoteId = p.id;

      const res = await fetch(`/api/proxy/payment-schedules/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al agregar');
      }
      setMessage({ type: 'success', text: 'Documento agregado' });
      await fetchSchedule();
      await fetchPendingPayables();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Eliminar este documento de la programacion?')) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${id}/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al eliminar');
      }
      setMessage({ type: 'success', text: 'Documento eliminado' });
      await fetchSchedule();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateItem = async (itemId: string) => {
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) {
      setMessage({ type: 'error', text: 'Monto invalido' });
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedAmountUsd: amount }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al actualizar');
      }
      setMessage({ type: 'success', text: 'Monto actualizado' });
      setEditingItemId(null);
      await fetchSchedule();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const confirmMsg: Record<string, string> = {
      APPROVED: 'Aprobar esta programacion?',
      EXECUTED: 'Marcar como ejecutado? Esta accion no se puede deshacer.',
      CANCELLED: 'Cancelar esta programacion?',
    };
    if (!confirm(confirmMsg[newStatus] || 'Confirmar?')) return;

    setProcessing(true);
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al cambiar estado');
      }
      setMessage({ type: 'success', text: `Estado cambiado a ${STATUS_LABELS[newStatus]}` });
      await fetchSchedule();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintPdf = () => {
    window.open(`/api/proxy/payment-schedules/${id}/pdf`, '_blank');
  };

  const canEdit = schedule?.status === 'DRAFT' || schedule?.status === 'APPROVED';
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERVISOR';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="animate-spin text-zinc-500" size={32} />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="p-6 text-center text-zinc-500">
        <p>Programacion no encontrada</p>
        <button onClick={() => router.push('/payment-schedules')} className="mt-4 text-blue-400 hover:underline">
          Volver
        </button>
      </div>
    );
  }

  const hasBudget = schedule.budgetUsd && schedule.budgetUsd > 0;
  const diffUsd = hasBudget ? schedule.budgetUsd! - schedule.totalUsd : 0;
  const exceeded = hasBudget && diffUsd < 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/payment-schedules')}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="p-2 rounded-lg bg-blue-500/10">
            <CalendarClock className="text-blue-400" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-zinc-100">{schedule.number}</h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[schedule.status]}`}>
                {STATUS_LABELS[schedule.status]}
              </span>
            </div>
            <p className="text-sm text-zinc-400">{schedule.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintPdf}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <Printer size={16} />
            Imprimir PDF
          </button>
          {schedule.status === 'DRAFT' && isAdmin && (
            <button
              onClick={() => handleStatusChange('APPROVED')}
              disabled={processing}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Check size={16} />
              Aprobar
            </button>
          )}
          {schedule.status === 'APPROVED' && isAdmin && (
            <button
              onClick={() => handleStatusChange('EXECUTED')}
              disabled={processing}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Check size={16} />
              Marcar ejecutado
            </button>
          )}
          {(schedule.status === 'DRAFT' || schedule.status === 'APPROVED') && (
            <button
              onClick={() => handleStatusChange('CANCELLED')}
              disabled={processing}
              className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <X size={16} />
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Fecha</p>
          <p className="text-sm text-zinc-200 font-medium">{new Date(schedule.createdAt).toLocaleDateString('es-VE')}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Tasa del dia</p>
          <p className="text-sm text-zinc-200 font-medium">Bs {fmt(schedule.exchangeRate)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Creado por</p>
          <p className="text-sm text-zinc-200 font-medium">{schedule.createdBy.name}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500">Documentos</p>
          <p className="text-sm text-zinc-200 font-medium">{schedule.items.length} items</p>
        </div>
      </div>

      {/* Summary Panel */}
      <div className={`bg-zinc-900 border rounded-xl p-4 mb-4 ${exceeded ? 'border-red-500/40' : 'border-zinc-800'}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {hasBudget && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Presupuesto</p>
              <p className="text-lg font-bold text-zinc-100">
                {schedule.budgetCurrency === 'Bs' ? `Bs ${fmt(schedule.budgetBs!)}` : `$${fmt(schedule.budgetUsd!)}`}
              </p>
              <p className="text-xs text-zinc-500">
                {schedule.budgetCurrency === 'Bs' ? `$${fmt(schedule.budgetUsd!)}` : `Bs ${fmt(schedule.budgetBs!)}`}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Total a pagar</p>
            <p className="text-lg font-bold text-zinc-100">${fmt(schedule.totalUsd)}</p>
            <p className="text-xs text-zinc-500">Bs {fmt(schedule.totalBs)}</p>
          </div>
          {hasBudget && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Diferencia</p>
              <p className={`text-lg font-bold ${exceeded ? 'text-red-400' : 'text-emerald-400'}`}>
                {exceeded ? `-$${fmt(Math.abs(diffUsd))}` : `+$${fmt(diffUsd)}`}
              </p>
              {exceeded && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle size={12} className="text-red-400" />
                  <p className="text-xs text-red-400 font-medium">Presupuesto excedido en ${fmt(Math.abs(diffUsd))}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {schedule.notes && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">Notas: <span className="text-zinc-400">{schedule.notes}</span></p>
          </div>
        )}
      </div>

      {/* Documents grouped by supplier */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Documentos por proveedor</h2>

        {schedule.groupedBySupplier.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
            <CalendarClock className="mx-auto mb-3 opacity-40" size={36} />
            <p>No hay documentos en esta programacion</p>
            {canEdit && (
              <button
                onClick={() => setShowAddPanel(!showAddPanel)}
                className="mt-3 text-blue-400 hover:underline text-sm"
              >
                Agregar documentos
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {schedule.groupedBySupplier.map((group) => (
              <div key={group.supplierName} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Supplier header */}
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
                  <h3 className="font-semibold text-zinc-200">{group.supplierName}</h3>
                  <div className="text-sm text-zinc-400">
                    <span className="font-medium text-zinc-200">${fmt(group.totalUsd)}</span>
                    <span className="mx-2">|</span>
                    <span>Bs {fmt(group.totalBs)}</span>
                  </div>
                </div>

                {/* Items table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800/50">
                      <th className="text-left px-4 py-2 font-medium">Tipo</th>
                      <th className="text-left px-4 py-2 font-medium">Referencia</th>
                      <th className="text-left px-4 py-2 font-medium">Vencimiento</th>
                      <th className="text-right px-4 py-2 font-medium">Saldo total</th>
                      <th className="text-right px-4 py-2 font-medium">A pagar USD</th>
                      <th className="text-right px-4 py-2 font-medium">A pagar Bs</th>
                      {canEdit && <th className="text-center px-4 py-2 font-medium w-20">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => {
                      const dueDate = item.payable?.dueDate
                        ? new Date(item.payable.dueDate)
                        : null;
                      const isOverdue = dueDate && dueDate < new Date();
                      const isEditing = editingItemId === item.id;

                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-zinc-800/30 ${
                            item.isPaid
                              ? 'bg-emerald-500/5'
                              : isOverdue
                                ? 'bg-red-500/5'
                                : ''
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                              item.creditDebitNoteId
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                                : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                            }`}>
                              {item.creditDebitNoteId ? 'NDC' : 'CxP'}
                            </span>
                            {item.isPaid && (
                              <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                                Pagado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-200 font-mono text-xs">{item.description}</td>
                          <td className="px-4 py-2.5 text-zinc-400">
                            {dueDate ? dueDate.toLocaleDateString('es-VE') : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">${fmt(item.totalAmountUsd)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-zinc-200">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-24 bg-zinc-800 border border-blue-500 rounded px-2 py-1 text-sm text-right"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateItem(item.id); if (e.key === 'Escape') setEditingItemId(null); }}
                                  autoFocus
                                />
                                <button onClick={() => handleUpdateItem(item.id)} className="p-1 text-emerald-400 hover:text-emerald-300">
                                  <Check size={14} />
                                </button>
                                <button onClick={() => setEditingItemId(null)} className="p-1 text-zinc-500 hover:text-zinc-300">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <span
                                className={canEdit ? 'cursor-pointer hover:text-blue-400' : ''}
                                onClick={() => {
                                  if (canEdit) {
                                    setEditingItemId(item.id);
                                    setEditAmount(item.plannedAmountUsd.toString());
                                  }
                                }}
                              >
                                ${fmt(item.plannedAmountUsd)}
                                {canEdit && <Pencil size={10} className="inline ml-1 opacity-40" />}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">Bs {fmt(item.plannedAmountBs)}</td>
                          {canEdit && (
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={processing}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Documents Panel */}
      {canEdit && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Plus size={16} className="text-blue-400" />
              Agregar documentos
            </div>
            {showAddPanel ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
          </button>

          {showAddPanel && (
            <div className="border-t border-zinc-800 p-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Proveedor</label>
                  <select
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 min-w-[180px]"
                    value={filterSupplierId}
                    onChange={(e) => setFilterSupplierId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Vence antes de</label>
                  <input
                    type="date"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    value={filterDueBefore}
                    onChange={(e) => setFilterDueBefore(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-500 mb-1">Busqueda</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="text"
                      placeholder="Proveedor o referencia..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Pending payables table */}
              {pendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-zinc-500" size={24} />
                </div>
              ) : filteredPending.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-6">No hay documentos disponibles</p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                        <th className="text-left px-3 py-2 font-medium">Referencia</th>
                        <th className="text-center px-3 py-2 font-medium">Tipo</th>
                        <th className="text-right px-3 py-2 font-medium">Saldo USD</th>
                        <th className="text-left px-3 py-2 font-medium">Vencimiento</th>
                        <th className="text-right px-3 py-2 font-medium">Monto a pagar</th>
                        <th className="text-center px-3 py-2 font-medium w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPending.map((p) => {
                        const dueDate = p.dueDate ? new Date(p.dueDate) : null;
                        const now = new Date();
                        const isOverdue = dueDate && dueDate < now;
                        const isUrgent = dueDate && !isOverdue && (dueDate.getTime() - now.getTime()) < 7 * 24 * 60 * 60 * 1000;

                        return (
                          <tr
                            key={`${p.type}-${p.id}`}
                            className={`border-b border-zinc-800/30 ${
                              isOverdue ? 'bg-red-500/5' : isUrgent ? 'bg-amber-500/5' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 text-zinc-200">{p.supplierName}</td>
                            <td className="px-3 py-2.5 text-zinc-400 font-mono text-xs">{p.reference}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                p.type === 'NDC'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                                  : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                              }`}>
                                {p.type}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-zinc-200 font-medium">${fmt(p.balanceUsd)}</td>
                            <td className={`px-3 py-2.5 ${isOverdue ? 'text-red-400 font-medium' : isUrgent ? 'text-amber-400' : 'text-zinc-400'}`}>
                              {dueDate ? dueDate.toLocaleDateString('es-VE') : '-'}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={p.balanceUsd}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-right text-zinc-200"
                                value={plannedAmounts[p.id] ?? p.balanceUsd}
                                onChange={(e) => setPlannedAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => handleAddItem(p)}
                                disabled={processing}
                                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40"
                              >
                                <Plus size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
