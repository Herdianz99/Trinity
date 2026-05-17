'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileX2, Search, Loader2, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';

interface Note {
  id: string;
  number: string;
  type: string;
  origin: string;
  status: string;
  totalUsd: number;
  totalBs: number;
  paidAmountUsd: number;
  appliedAt: string | null;
  createdAt: string;
  invoice: { id: string; number: string; customer: { name: string } | null } | null;
  purchaseOrder: { id: string; number: string; supplier: { name: string } | null } | null;
}

const TYPE_LABELS: Record<string, string> = {
  NCV: 'NC Venta',
  NDV: 'ND Venta',
  NCC: 'NC Compra',
  NDC: 'ND Compra',
};

const TYPE_COLORS: Record<string, string> = {
  NCV: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  NDV: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  NCC: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  NDC: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  POSTED: 'text-green-400 border-green-500/30 bg-green-500/10',
  CANCELLED: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Confirmada',
  CANCELLED: 'Anulada',
};

export default function CreditDebitNotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (search) params.set('search', search);

      const res = await fetch(`/api/proxy/credit-debit-notes?${params}`);
      const json = await res.json();
      setNotes(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, type, status, from, to, search]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileX2 className="text-green-400" size={28} />
            Notas de Crédito / Débito
          </h1>
          <p className="text-slate-400 mt-1">
            {total} nota{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Buscar por número..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9 w-full"
            />
          </div>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="input-field">
            <option value="">Todos los tipos</option>
            <option value="NCV">NC Venta</option>
            <option value="NDV">ND Venta</option>
            <option value="NCC">NC Compra</option>
            <option value="NDC">ND Compra</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input-field">
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="POSTED">Confirmada</option>
            <option value="CANCELLED">Anulada</option>
          </select>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input-field" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input-field" />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-green-500" size={28} />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            No se encontraron notas
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Número</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Doc. Origen</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Entidad</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr
                  key={note.id}
                  className="border-b border-slate-700/30 hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => router.push(`/credit-debit-notes/${note.id}`)}
                >
                  <td className="px-4 py-3 text-white font-mono">{note.number}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[note.type]}`}>
                      {TYPE_LABELS[note.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                    {note.invoice?.number || note.purchaseOrder?.number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {note.invoice?.customer?.name || note.purchaseOrder?.supplier?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">$ {fmt(note.totalUsd)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {note.status === 'POSTED' && !note.appliedAt ? (
                      note.paidAmountUsd > 0 ? (
                        <span className="text-amber-400">$ {fmt(note.totalUsd - note.paidAmountUsd)}</span>
                      ) : (
                        <span className="text-green-400">$ {fmt(note.totalUsd)}</span>
                      )
                    ) : note.appliedAt ? (
                      <span className="text-slate-500">$ 0,00</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[note.status]}`}>
                      {STATUS_LABELS[note.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(note.createdAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary text-sm disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
