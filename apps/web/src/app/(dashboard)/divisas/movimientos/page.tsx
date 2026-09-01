'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2, X, ArrowDownCircle, ArrowUpCircle, Filter, CheckCircle, RefreshCw, Loader2, Coins } from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface Catalog {
  id: string;
  name: string;
  isActive: boolean;
}
interface Movement {
  id: string;
  date: string;
  kind: string;
  type: string;
  amountUsd: number;
  amountBs: number | null;
  exchangeRate: number | null;
  commissionPct: number | null;
  modalidad: string | null;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  status: string;
  company: { id: string; name: string };
  bank: { id: string; name: string };
  originBank: { id: string; name: string } | null;
  createdBy?: { name: string };
  runningBalanceUsd?: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const DEFAULT_COMMISSION_PCT = '0.5';
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  id: '',
  date: todayStr(),
  kind: 'MOVIMIENTO',
  companyId: '',
  bankId: '',
  originBankId: '',
  type: 'ENTRADA',
  amountUsd: '',
  amountBs: '',
  exchangeRate: '',
  commissionPct: DEFAULT_COMMISSION_PCT,
  modalidad: '',
  counterparty: '',
  reference: '',
  description: '',
  status: 'CONFIRMADO',
});

function MovimientosInner() {
  const search = useSearchParams();
  const [companies, setCompanies] = useState<Catalog[]>([]);
  const [banks, setBanks] = useState<Catalog[]>([]);
  const [originBanks, setOriginBanks] = useState<Catalog[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [hasRunning, setHasRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Filtros
  const [fCompany, setFCompany] = useState(search.get('companyId') || '');
  const [fBank, setFBank] = useState(search.get('bankId') || '');
  const [fType, setFType] = useState('');
  const [fKind, setFKind] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(search.get('new') === '1');
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const toast = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadCatalogs = useCallback(async () => {
    const [c, b, ob] = await Promise.all([
      fetch('/api/proxy/divisas/companies?all=true').then((r) => r.json()),
      fetch('/api/proxy/divisas/banks?all=true').then((r) => r.json()),
      fetch('/api/proxy/divisas/origin-banks?all=true').then((r) => r.json()),
    ]);
    setCompanies(Array.isArray(c) ? c : []);
    setBanks(Array.isArray(b) ? b : []);
    setOriginBanks(Array.isArray(ob) ? ob : []);
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fCompany) p.set('companyId', fCompany);
      if (fBank) p.set('bankId', fBank);
      if (fType) p.set('type', fType);
      if (fKind) p.set('kind', fKind);
      if (fFrom) p.set('from', fFrom);
      if (fTo) p.set('to', fTo);
      const res = await fetch(`/api/proxy/divisas/movements?${p.toString()}`);
      const data = await res.json();
      setMovements(data.movements || []);
      setHasRunning(!!data.hasRunningBalance);
    } finally {
      setLoading(false);
    }
  }, [fCompany, fBank, fType, fKind, fFrom, fTo]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);
  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  // Trae la tasa Bs/USD del día indicado (4 decimales) para autocompletar el movimiento.
  const fetchRateFor = async (dateStr: string): Promise<string> => {
    try {
      const res = await fetch(`/api/proxy/exchange-rate/by-date?date=${dateStr}`);
      if (!res.ok) return '';
      const txt = await res.text();
      if (!txt) return '';
      const data = JSON.parse(txt);
      return data?.rate != null ? String(data.rate) : '';
    } catch {
      return '';
    }
  };

  // Movimiento simple: transferencia de USD entre empresa/banco (sin Bs/tasa/comisión).
  const openNew = () => {
    setForm({ ...emptyForm(), kind: 'MOVIMIENTO' });
    setModalOpen(true);
  };
  // Compra de divisas: incluye tasa (auto por fecha), comisión y el total Bs que descuenta.
  const openNewCompra = async () => {
    const base = { ...emptyForm(), kind: 'COMPRA' };
    setForm(base);
    setModalOpen(true);
    const rate = await fetchRateFor(base.date);
    if (rate) setForm((f) => (f.id === '' ? { ...f, exchangeRate: rate } : f));
  };
  const openEdit = async (m: Movement) => {
    setForm({
      id: m.id,
      date: m.date.slice(0, 10),
      kind: m.kind || 'MOVIMIENTO',
      companyId: m.company.id,
      bankId: m.bank.id,
      originBankId: m.originBank?.id || '',
      type: m.type,
      amountUsd: String(m.amountUsd),
      amountBs: m.amountBs != null ? String(m.amountBs) : '',
      exchangeRate: m.exchangeRate != null ? String(m.exchangeRate) : '',
      commissionPct: m.commissionPct != null ? String(m.commissionPct) : DEFAULT_COMMISSION_PCT,
      modalidad: m.modalidad || '',
      counterparty: m.counterparty || '',
      reference: m.reference || '',
      description: m.description || '',
      status: m.status,
    });
    setModalOpen(true);
    if (m.kind === 'COMPRA' && m.exchangeRate == null) {
      const rate = await fetchRateFor(m.date.slice(0, 10));
      if (rate) setForm((f) => (f.id === m.id ? { ...f, exchangeRate: rate } : f));
    }
  };

  // Desglose Bs de la compra/venta de divisas: equivalente + comisión = total (lo que descuenta).
  const usdNum = Number(form.amountUsd) || 0;
  const rateNum = Number(form.exchangeRate) || 0;
  const commNum = Number(form.commissionPct) || 0;
  const baseBs = Math.round(usdNum * rateNum * 100) / 100;
  const commissionBs = Math.round(((baseBs * commNum) / 100) * 100) / 100;
  const totalBs = Math.round((baseBs + commissionBs) * 100) / 100;

  const save = async () => {
    if (!form.companyId || !form.bankId || !form.amountUsd || Number(form.amountUsd) <= 0) {
      toast('Completa empresa, banco y monto (> 0)', false);
      return;
    }
    setSaving(true);
    try {
      const isCompra = form.kind === 'COMPRA';
      const payload = {
        date: form.date,
        kind: form.kind,
        companyId: form.companyId,
        bankId: form.bankId,
        originBankId: isCompra ? form.originBankId || undefined : undefined,
        type: form.type,
        amountUsd: Number(form.amountUsd),
        amountBs: isCompra ? (totalBs > 0 ? totalBs : form.amountBs !== '' ? Number(form.amountBs) : undefined) : undefined,
        exchangeRate: isCompra && rateNum > 0 ? rateNum : undefined,
        commissionPct: isCompra && form.commissionPct !== '' ? commNum : undefined,
        modalidad: form.modalidad || undefined,
        counterparty: form.counterparty.trim() || undefined,
        reference: form.reference.trim() || undefined,
        description: form.description.trim() || undefined,
        status: form.status,
      };
      const res = await fetch(
        form.id ? `/api/proxy/divisas/movements/${form.id}` : '/api/proxy/divisas/movements',
        {
          method: form.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        setModalOpen(false);
        toast(form.id ? 'Movimiento actualizado' : 'Movimiento registrado');
        loadMovements();
      } else {
        const e = await res.json().catch(() => ({}));
        toast(e.message || 'Error al guardar', false);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmMovement = async (m: Movement) => {
    if (!confirm(`¿Confirmar el movimiento de $${fmt(m.amountUsd)} (${m.company.name} / ${m.bank.name})?\n\nPasará de "Tránsito" a "Disponible".`)) return;
    const res = await fetch(`/api/proxy/divisas/movements/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMADO' }),
    });
    if (res.ok) {
      toast('Movimiento confirmado');
      loadMovements();
    } else {
      toast('Error al confirmar', false);
    }
  };

  const remove = async (m: Movement) => {
    if (!confirm(`¿Eliminar el movimiento de $${fmt(m.amountUsd)} (${m.company.name} / ${m.bank.name})?`)) return;
    const res = await fetch(`/api/proxy/divisas/movements/${m.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Movimiento eliminado');
      loadMovements();
    } else {
      toast('Error al eliminar', false);
    }
  };

  const activeCompanies = companies.filter((c) => c.isActive);
  const activeBanks = banks.filter((b) => b.isActive);
  const activeOriginBanks = originBanks.filter((b) => b.isActive);
  const colSpan = hasRunning ? 8 : 7;

  // Contexto cuando se "entra" a una sola empresa o banco (vista con saldo corriente).
  const singleDimName = fCompany
    ? companies.find((c) => c.id === fCompany)?.name
    : fBank
      ? banks.find((b) => b.id === fBank)?.name
      : null;
  const singleDimLabel = fCompany ? 'Empresa' : 'Banco / Ubicación';
  // El movimiento más reciente (movements[0], orden desc) trae el saldo corriente = saldo actual.
  const currentBalance = hasRunning && movements.length ? movements[0].runningBalanceUsd || 0 : 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Movimientos de divisas</h1>
          <p className="text-sm text-slate-400">Entradas y salidas de dólares por empresa y banco/ubicación.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/divisas/movimientos-bs"
            className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg text-sm font-medium"
          >
            Ver movimientos Bs
          </a>
          <button
            onClick={() => { loadCatalogs(); loadMovements(); }}
            disabled={loading}
            title="Refrescar"
            className="p-2 rounded-lg bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Registrar movimiento
          </button>
          <button
            onClick={openNewCompra}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Coins size={16} /> Compra de divisas
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            message.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-slate-400" />
        <select
          value={fCompany}
          onChange={(e) => setFCompany(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm"
        >
          <option value="">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={fBank}
          onChange={(e) => setFBank(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm"
        >
          <option value="">Todos los bancos</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={fType}
          onChange={(e) => setFType(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm"
        >
          <option value="">Entradas y salidas</option>
          <option value="ENTRADA">Solo entradas</option>
          <option value="SALIDA">Solo salidas</option>
        </select>
        <select
          value={fKind}
          onChange={(e) => setFKind(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm"
        >
          <option value="">Movimientos y compras</option>
          <option value="MOVIMIENTO">Solo movimientos</option>
          <option value="COMPRA">Solo compras</option>
        </select>
        <input
          type="date"
          value={fFrom}
          onChange={(e) => setFFrom(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-sm"
        />
        <span className="text-slate-500 text-sm">a</span>
        <input
          type="date"
          value={fTo}
          onChange={(e) => setFTo(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-sm"
        />
        {(fCompany || fBank || fType || fKind || fFrom || fTo) && (
          <button
            onClick={() => {
              setFCompany('');
              setFBank('');
              setFType('');
              setFKind('');
              setFFrom('');
              setFTo('');
            }}
            className="text-slate-400 hover:text-slate-200 text-sm ml-1"
          >
            Limpiar
          </button>
        )}
      </div>

      {hasRunning && singleDimName && (
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{singleDimLabel}</div>
            <div className="text-lg font-semibold text-slate-100">{singleDimName}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Saldo actual</div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                currentBalance < 0 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              ${fmt(currentBalance)}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-left">
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Empresa</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Banco / Ubicación</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Detalle</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Monto</th>
                {hasRunning && (
                  <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Saldo</th>
                )}
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Estatus</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500 text-sm">
                    Cargando…
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500 text-sm">
                    Sin movimientos para el filtro actual.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isIn = m.type === 'ENTRADA';
                  return (
                    <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 align-top">
                      <td className="px-3 py-3 text-sm text-slate-300 whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td className="px-3 py-3 text-sm text-slate-200">{m.company.name}</td>
                      <td className="px-3 py-3 text-sm text-slate-200">{m.bank.name}</td>
                      <td className="px-3 py-3 text-xs text-slate-400 max-w-[220px]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {m.kind === 'COMPRA' && (
                            <span className="uppercase text-[10px] tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300/90">Compra</span>
                          )}
                          {m.modalidad && (
                            <span className="uppercase text-[10px] tracking-wide text-slate-500">{m.modalidad}</span>
                          )}
                          {m.counterparty && <span className="text-slate-300">{m.counterparty}</span>}
                          {m.reference && <span className="text-slate-500">#{m.reference}</span>}
                        </div>
                        {(m.amountBs != null || m.originBank) && (
                          <div className="text-[11px] text-amber-300/80 mt-0.5">
                            {m.amountBs != null && <span>Bs {fmt(m.amountBs)}</span>}
                            {m.exchangeRate != null && <span className="text-slate-500"> · tasa {fmt4(m.exchangeRate)}</span>}
                            {m.commissionPct != null && <span className="text-slate-500"> · com {fmt(m.commissionPct)}%</span>}
                            {m.originBank && <span className="text-slate-500"> · {m.originBank.name}</span>}
                          </div>
                        )}
                        {m.description && <div className="text-slate-500 mt-0.5">{m.description}</div>}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-mono font-semibold tabular-nums ${
                            isIn ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {isIn ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                          {isIn ? '+' : '−'}${fmt(m.amountUsd)}
                        </span>
                      </td>
                      {hasRunning && (
                        <td className="px-3 py-3 text-right text-sm font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          ${fmt(m.runningBalanceUsd || 0)}
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            m.status === 'CONFIRMADO'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {m.status === 'CONFIRMADO' ? 'Confirmado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {m.status === 'PENDIENTE' && (
                          <button
                            onClick={() => confirmMovement(m)}
                            className="text-emerald-400 hover:text-emerald-300 p-1"
                            title="Confirmar (pasar a Disponible)"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        <button onClick={() => openEdit(m)} className="text-slate-400 hover:text-blue-300 p-1" title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => remove(m)} className="text-slate-400 hover:text-red-300 p-1" title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal alta/edición */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 sticky top-0 bg-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">
                {form.kind === 'COMPRA'
                  ? form.id ? 'Editar compra de divisas' : 'Compra de divisas'
                  : form.id ? 'Editar movimiento' : 'Registrar movimiento'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForm({ ...form, type: 'ENTRADA' })}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${
                    form.type === 'ENTRADA'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'border-slate-600 text-slate-400 hover:bg-slate-700/40'
                  }`}
                >
                  <ArrowDownCircle size={16} /> Entrada
                </button>
                <button
                  onClick={() => setForm({ ...form, type: 'SALIDA' })}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${
                    form.type === 'SALIDA'
                      ? 'bg-red-600/20 border-red-500 text-red-300'
                      : 'border-slate-600 text-slate-400 hover:bg-slate-700/40'
                  }`}
                >
                  <ArrowUpCircle size={16} /> Salida
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={async (e) => {
                      const date = e.target.value;
                      setForm((f) => ({ ...f, date }));
                      if (form.kind === 'COMPRA') {
                        const rate = await fetchRateFor(date);
                        if (rate) setForm((f) => ({ ...f, exchangeRate: rate }));
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Monto USD</label>
                  <MoneyInput
                    thousands
                    value={form.amountUsd === '' ? 0 : Number(form.amountUsd)}
                    onValueChange={(n) => setForm({ ...form, amountUsd: n ? String(n) : '' })}
                    placeholder="0,00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Empresa</label>
                  <select
                    value={form.companyId}
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  >
                    <option value="">Seleccionar…</option>
                    {activeCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Banco / Ubicación (destino USD)</label>
                  <select
                    value={form.bankId}
                    onChange={(e) => setForm({ ...form, bankId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  >
                    <option value="">Seleccionar…</option>
                    {activeBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.kind === 'COMPRA' && (
                <>
              {/* Bs: banco de origen + tasa + comisión → total que descuenta del saldo Bs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Banco de origen (Bs)</label>
                  <select
                    value={form.originBankId}
                    onChange={(e) => setForm({ ...form, originBankId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  >
                    <option value="">— (opcional)</option>
                    {activeOriginBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tasa del día (Bs/USD)</label>
                  <MoneyInput
                    thousands
                    value={form.exchangeRate === '' ? 0 : Number(form.exchangeRate)}
                    onValueChange={(n) => setForm({ ...form, exchangeRate: n ? String(n) : '' })}
                    placeholder="0,0000"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Auto por la fecha; editable{rateNum > 0 ? ` · ${fmt4(rateNum)}` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Comisión %</label>
                  <MoneyInput
                    thousands
                    value={form.commissionPct === '' ? 0 : Number(form.commissionPct)}
                    onValueChange={(n) => setForm({ ...form, commissionPct: String(n) })}
                    placeholder="0,5"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Por defecto 0,5%; editable.</p>
                </div>
                <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 self-end">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Equivalente Bs</span>
                    <span className="font-mono tabular-nums text-slate-300">Bs {fmt(baseBs)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Comisión ({form.commissionPct || '0'}%)</span>
                    <span className="font-mono tabular-nums text-slate-300">Bs {fmt(commissionBs)}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-700/40 flex items-center justify-between text-xs">
                    <span className="text-sky-300 font-medium">Total Bs (descuenta)</span>
                    <span className="font-mono tabular-nums font-bold text-sky-300">Bs {fmt(totalBs)}</span>
                  </div>
                </div>
              </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Modalidad</label>
                  <select
                    value={form.modalidad}
                    onChange={(e) => setForm({ ...form, modalidad: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  >
                    <option value="">—</option>
                    <option value="ELECTRONICO">Electrónico</option>
                    <option value="EFECTIVO">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Estatus</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                  >
                    <option value="CONFIRMADO">Confirmado</option>
                    <option value="PENDIENTE">Pendiente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Contraparte (de quién / a quién)</label>
                <input
                  value={form.counterparty}
                  onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                  placeholder="Casa de cambio, proveedor, persona…"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Referencia</label>
                <input
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="Nº de operación (opcional)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción / observaciones</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700/60 sticky bottom-0 bg-slate-800">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MovimientosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500 text-sm">Cargando…</div>}>
      <MovimientosInner />
    </Suspense>
  );
}
