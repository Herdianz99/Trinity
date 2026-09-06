'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus,
  Upload,
  Search,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  RotateCcw,
  Loader2,
  PackageCheck,
  Truck,
  FileSpreadsheet,
} from 'lucide-react';

interface SupplierOrderItem {
  id: string;
  supplierRef: string;
  productId: string | null;
  productCode: string | null;
  description: string;
  quantityOrdered: number;
  unitCost: number | null;
  supplierName: string | null;
  observation: string | null;
  status: 'PENDING' | 'RECEIVED';
  orderedAt: string;
  receivedAt: string | null;
  quantityReceived: number | null;
  product?: { id: string; code: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
}

interface ParsedRow {
  supplierRef: string;
  description: string;
  quantityOrdered: number;
  unitCost?: number;
}

interface PreviewResult {
  totalRows: number;
  linked: number;
  unlinked: number;
  discarded: number;
  rows: (ParsedRow & { linked: boolean; productCode: string | null })[];
}

const EDIT_ROLES = ['ADMIN', 'SUPERVISOR', 'BUYER'];

const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

type Tab = 'ALL' | 'PENDING' | 'RECEIVED';

export default function PedidosPage() {
  const [role, setRole] = useState<string>('');
  const canEdit = EDIT_ROLES.includes(role);

  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<SupplierOrderItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, received: 0 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Modales
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplierOrderItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    document.title = 'Pedidos | Trinity ERP';
  }, []);

  // Rol del usuario (para mostrar/ocultar acciones de edicion; el API igual lo valida)
  useEffect(() => {
    fetch('/api/proxy/auth/me')
      .then((r) => r.json())
      .then((u) => setRole(u?.role || ''))
      .catch(() => {});
  }, []);

  // Debounce del buscador
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status: tab, limit: '200' });
      if (debounced.trim()) p.set('search', debounced.trim());
      const res = await fetch(`/api/proxy/purchase-requests?${p.toString()}`);
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || { pending: 0, received: 0 });
    } catch {
      setMsg({ text: 'Error al cargar los pedidos', ok: false });
    } finally {
      setLoading(false);
    }
  }, [tab, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleReceive(item: SupplierOrderItem) {
    const input = window.prompt(
      `Marcar recibido: ${item.description}\n\nCantidad que llegó (Enter = pedida: ${fmtNum(item.quantityOrdered)}):`,
      String(item.quantityOrdered),
    );
    if (input === null) return;
    const qty = input.trim() === '' ? undefined : Number(input);
    if (qty !== undefined && !Number.isFinite(qty)) {
      flash('Cantidad inválida', false);
      return;
    }
    const res = await fetch(`/api/proxy/purchase-requests/${item.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantityReceived: qty }),
    });
    if (res.ok) {
      flash('Marcado como recibido', true);
      load();
    } else {
      flash('No se pudo marcar recibido', false);
    }
  }

  async function handleUnreceive(item: SupplierOrderItem) {
    if (!window.confirm('¿Volver este pedido a "en tránsito"?')) return;
    const res = await fetch(`/api/proxy/purchase-requests/${item.id}/unreceive`, { method: 'POST' });
    if (res.ok) {
      flash('Pedido devuelto a en tránsito', true);
      load();
    } else {
      flash('No se pudo revertir', false);
    }
  }

  async function handleDelete(item: SupplierOrderItem) {
    if (!window.confirm(`¿Eliminar "${item.description}" de la lista?`)) return;
    const res = await fetch(`/api/proxy/purchase-requests/${item.id}`, { method: 'DELETE' });
    if (res.ok) {
      flash('Pedido eliminado', true);
      load();
    } else {
      flash('No se pudo eliminar', false);
    }
  }

  const tabs: [Tab, string, number][] = [
    ['PENDING', 'En tránsito', counts.pending],
    ['RECEIVED', 'Recibidos', counts.received],
    ['ALL', 'Todos', counts.pending + counts.received],
  ];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <PackageCheck className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Pedidos a proveedor</h1>
          <p className="text-slate-400 text-sm">
            {canEdit ? 'Lo que ya se pidió al proveedor — cárgalo desde Excel o agrégalo a mano.' : 'Consulta si un artículo ya fue pedido al proveedor.'}
          </p>
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setShowUpload(true)} className="btn-secondary !py-2.5 text-sm flex items-center gap-2">
              <Upload size={16} />
              <span className="hidden sm:inline">Cargar Excel</span>
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="btn-primary !py-2.5 text-sm flex items-center gap-2"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Agregar artículo</span>
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            msg.ok ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Tabs + buscador */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1.5 bg-slate-800/60 rounded-lg p-1 w-fit">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                tab === key ? 'bg-green-500/20 text-green-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${tab === key ? 'text-green-500' : 'text-slate-600'}`}>{count}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="input-field !py-2.5 !pl-9 text-sm w-full"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Código</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Descripción</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Cant.</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Costo</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Proveedor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden lg:table-cell">Observación</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden sm:table-cell">Pedido</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Recibido</th>
                {canEdit && <th className="text-center px-4 py-3 text-slate-400 font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 10 : 9} className="text-center py-12">
                    <Loader2 className="animate-spin text-green-500 mx-auto" size={28} />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 10 : 9} className="text-center py-12 text-slate-500">
                    No hay pedidos {tab === 'PENDING' ? 'en tránsito' : tab === 'RECEIVED' ? 'recibidos' : ''}.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      <span className="text-slate-200">{it.supplierRef}</span>
                      {it.product && (
                        <span className="block text-[10px] text-slate-500" title="Producto enlazado">
                          → {it.product.code}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs">{it.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-medium">{fmtNum(it.quantityOrdered)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400 hidden lg:table-cell">{fmtMoney(it.unitCost)}</td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{it.supplierName || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate hidden lg:table-cell" title={it.observation || ''}>
                      {it.observation || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap hidden sm:table-cell">{fmtDate(it.orderedAt)}</td>
                    <td className="px-4 py-3 text-center">
                      {it.status === 'RECEIVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-green-400 border-green-500/30 bg-green-500/10">
                          <CheckCircle2 size={12} /> Recibido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border text-amber-400 border-amber-500/30 bg-amber-500/10">
                          <Truck size={12} /> En tránsito
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap hidden md:table-cell">
                      {it.status === 'RECEIVED' ? (
                        <>
                          {fmtDate(it.receivedAt)}
                          {it.quantityReceived != null && (
                            <span className="block text-slate-500">llegó {fmtNum(it.quantityReceived)}</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {it.status === 'PENDING' ? (
                            <button
                              onClick={() => handleReceive(it)}
                              title="Marcar recibido"
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnreceive(it)}
                              title="Volver a en tránsito"
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-amber-400"
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditing(it);
                              setShowForm(true);
                            }}
                            title="Editar"
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(it)}
                            title="Eliminar"
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && canEdit && (
        <ItemFormModal
          item={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            flash(editing ? 'Pedido actualizado' : 'Artículo agregado', true);
            load();
          }}
        />
      )}

      {showUpload && canEdit && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={(n) => {
            setShowUpload(false);
            flash(`${n} artículo(s) cargado(s)`, true);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal: crear/editar artículo manual ──────────────────────────────
function ItemFormModal({
  item,
  onClose,
  onSaved,
}: {
  item: SupplierOrderItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    supplierRef: item?.supplierRef || '',
    description: item?.description || '',
    quantityOrdered: item ? String(item.quantityOrdered) : '',
    unitCost: item?.unitCost != null ? String(item.unitCost) : '',
    supplierName: item?.supplierName || '',
    observation: item?.observation || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!form.supplierRef.trim() || !form.description.trim()) {
      setError('Código y descripción son obligatorios');
      return;
    }
    const qty = Number(form.quantityOrdered);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Cantidad inválida');
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      supplierRef: form.supplierRef.trim(),
      description: form.description.trim(),
      quantityOrdered: qty,
      unitCost: form.unitCost.trim() === '' ? undefined : Number(form.unitCost),
      supplierName: form.supplierName.trim() || undefined,
      observation: form.observation.trim() || undefined,
    };
    const url = item ? `/api/proxy/purchase-requests/${item.id}` : '/api/proxy/purchase-requests';
    const res = await fetch(url, {
      method: item ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setError('No se pudo guardar');
  }

  return (
    <Modal title={item ? 'Editar pedido' : 'Agregar artículo'} onClose={onClose}>
      <div className="space-y-3">
        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm">{error}</div>}
        <Field label="Código (ref. proveedor)">
          <input value={form.supplierRef} onChange={(e) => setForm({ ...form, supplierRef: e.target.value })} className="input-field !py-2.5 text-sm" />
        </Field>
        <Field label="Descripción">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field !py-2.5 text-sm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <input type="number" value={form.quantityOrdered} onChange={(e) => setForm({ ...form, quantityOrdered: e.target.value })} className="input-field !py-2.5 text-sm" />
          </Field>
          <Field label="Costo (USD, opcional)">
            <input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} className="input-field !py-2.5 text-sm" />
          </Field>
        </div>
        <Field label="Proveedor (opcional)">
          <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className="input-field !py-2.5 text-sm" />
        </Field>
        <Field label="Observación (opcional)">
          <textarea value={form.observation} onChange={(e) => setForm({ ...form, observation: e.target.value })} rows={2} className="input-field !py-2.5 text-sm" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary !py-2.5 text-sm">
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
          {saving && <Loader2 className="animate-spin" size={15} />} Guardar
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: cargar Excel (parseo cliente → preview → confirmar) ────────
function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function parseWorkbook(wb: XLSX.WorkBook): ParsedRow[] {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    // Buscar la fila de encabezado (contiene "CODIGO")
    let headerIdx = -1;
    const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].some((c) => norm(c) === 'CODIGO' || norm(c) === 'CÓDIGO')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) throw new Error('No se encontró la columna "CODIGO" en el Excel');
    const header = grid[headerIdx].map(norm);
    const col = (name: string) => header.findIndex((h) => h === name);
    const ci = {
      ref: col('CODIGO') >= 0 ? col('CODIGO') : col('CÓDIGO'),
      qty: col('CANTIDAD'),
      cost: col('COSTO'),
      desc: col('DESCRIPCION') >= 0 ? col('DESCRIPCION') : col('DESCRIPCIÓN'),
    };

    const out: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i];
      const ref = String(r[ci.ref] ?? '').trim();
      const desc = String(r[ci.desc] ?? '').trim();
      const qty = Number(r[ci.qty]);
      if (norm(ref) === 'TOTAL' || norm(desc) === 'TOTAL') continue; // fila de totales
      if (!ref || !desc || !Number.isFinite(qty) || qty <= 0) continue; // vacías/inválidas
      const cost = Number(r[ci.cost]);
      out.push({ supplierRef: ref, description: desc, quantityOrdered: qty, unitCost: Number.isFinite(cost) ? cost : undefined });
    }
    return out;
  }

  function onFile(file: File) {
    setError('');
    setPreview(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseWorkbook(wb);
        if (parsed.length === 0) throw new Error('No se encontraron filas válidas');
        setRows(parsed);
        setFileName(file.name);
        // Pedir preview al API (enlace a productos)
        const res = await fetch('/api/proxy/purchase-requests/upload/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: parsed }),
        });
        if (!res.ok) throw new Error('Error al previsualizar');
        setPreview(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al leer el Excel');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function confirm() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/proxy/purchase-requests/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, supplierName: supplierName.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      onDone(data.created ?? rows.length);
    } else {
      setError('No se pudo cargar');
    }
  }

  return (
    <Modal title="Cargar pedido desde Excel" onClose={onClose}>
      <div className="space-y-4">
        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm">{error}</div>}

        {!preview ? (
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-colors"
          >
            <FileSpreadsheet className="mx-auto text-slate-500 mb-2" size={32} />
            <p className="text-sm text-slate-300 font-medium">Haz clic para elegir el archivo Excel</p>
            <p className="text-xs text-slate-500 mt-1">Formato: columnas CODIGO, CANTIDAD, COSTO, DESCRIPCION</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <FileSpreadsheet size={16} className="text-green-400" /> {fileName}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Artículos" value={preview.totalRows} />
              <Stat label="Enlazados" value={preview.linked} tone="green" />
              <Stat label="Sin enlazar" value={preview.unlinked} tone={preview.unlinked ? 'amber' : undefined} />
            </div>
            {preview.discarded > 0 && (
              <p className="text-xs text-amber-400">{preview.discarded} fila(s) descartada(s) por estar incompletas.</p>
            )}
            <Field label="Proveedor (opcional, se aplica a todo el lote)">
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="input-field !py-2.5 text-sm" />
            </Field>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/80 text-slate-400 sticky top-0">
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-3 py-2 font-medium">Código</th>
                    <th className="text-left px-3 py-2 font-medium">Descripción</th>
                    <th className="text-right px-3 py-2 font-medium">Cant.</th>
                    <th className="text-center px-3 py-2 font-medium">Enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-700/30">
                      <td className="px-3 py-1.5 font-mono text-slate-300">{r.supplierRef}</td>
                      <td className="px-3 py-1.5 truncate max-w-[220px] text-slate-300">{r.description}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmtNum(r.quantityOrdered)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {r.linked ? (
                          <span className="text-green-400" title={r.productCode || ''}>✓</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn-secondary !py-2.5 text-sm">
          Cancelar
        </button>
        {preview && (
          <button onClick={confirm} disabled={busy} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {busy && <Loader2 className="animate-spin" size={15} />} Cargar {preview.totalRows} artículo(s)
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 py-2.5">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
