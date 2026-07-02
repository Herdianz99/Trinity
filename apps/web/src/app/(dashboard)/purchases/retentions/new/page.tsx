'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Shield, Loader2, Save, Search, Check, X, AlertTriangle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  isRetentionAgent: boolean;
}

interface AvailablePO {
  docType: 'PURCHASE_ORDER' | 'PAYABLE';
  id: string;
  number: string;
  invoiceDate: string | null;
  ivaUsd: number;
  ivaBs: number;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  controlNumber: string | null;
  invoiceNumber: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NewRetentionVoucherPage() {
  const router = useRouter();

  useEffect(() => {
    document.title = 'Nueva Retención IVA | Trinity ERP';
  }, []);

  // ── State ────────────────────────────────────────────────────────────

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdown, setSupplierDropdown] = useState(false);

  const [availablePOs, setAvailablePOs] = useState<AvailablePO[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [retentionPct, setRetentionPct] = useState(75);
  const [notes, setNotes] = useState('');

  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Fetch suppliers ─────────────────────────────────────────────────

  const fetchSuppliers = useCallback(async (search: string) => {
    if (search.length < 2) { setSuppliers([]); return; }
    setLoadingSuppliers(true);
    try {
      const res = await fetch(`/api/proxy/suppliers?search=${encodeURIComponent(search)}&limit=20`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuppliers(data.data || data);
    } catch {
      setSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (supplierSearch.length >= 2) fetchSuppliers(supplierSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [supplierSearch, fetchSuppliers]);

  // ── Fetch available POs for supplier ────────────────────────────────

  const fetchAvailablePOs = useCallback(async (sid: string) => {
    if (!sid) { setAvailablePOs([]); return; }
    setLoadingPOs(true);
    try {
      const res = await fetch(`/api/proxy/retention-vouchers/available-documents/${sid}`);
      if (!res.ok) throw new Error('Error al cargar documentos');
      const data = await res.json();
      setAvailablePOs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
      setAvailablePOs([]);
    } finally {
      setLoadingPOs(false);
    }
  }, []);

  useEffect(() => {
    setSelectedPOs(new Set());
    if (supplierId) fetchAvailablePOs(supplierId);
  }, [supplierId, fetchAvailablePOs]);

  // ── Load default % from config ─────────────────────────────────────

  useEffect(() => {
    fetch('/api/proxy/company-config')
      .then(r => r.json())
      .then(c => { if (c.ivaRetentionPct) setRetentionPct(c.ivaRetentionPct); })
      .catch(() => {});
  }, []);

  // ── Toggle PO selection ────────────────────────────────────────────

  function togglePO(poId: string) {
    setSelectedPOs(prev => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId); else next.add(poId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedPOs.size === availablePOs.length) {
      setSelectedPOs(new Set());
    } else {
      setSelectedPOs(new Set(availablePOs.map(p => p.id)));
    }
  }

  // ── Computed ───────────────────────────────────────────────────────

  const selectedOrders = availablePOs.filter(p => selectedPOs.has(p.id));

  const totalIvaUsd = selectedOrders.reduce((s, p) => s + p.ivaUsd, 0);
  const totalIvaBs = selectedOrders.reduce((s, p) => s + p.ivaBs, 0);
  const totalRetUsd = round2(totalIvaUsd * (retentionPct / 100));
  const totalRetBs = round2(totalIvaBs * (retentionPct / 100));

  // ── Select supplier ────────────────────────────────────────────────

  function selectSupplier(s: Supplier) {
    setSupplierId(s.id);
    setSupplierSearch(s.name + (s.rif ? ` (${s.rif})` : ''));
    setSupplierDropdown(false);
  }

  function clearSupplier() {
    setSupplierId('');
    setSupplierSearch('');
    setAvailablePOs([]);
    setSelectedPOs(new Set());
  }

  // ── Save ───────────────────────────────────────────────────────────

  async function handleSave() {
    if (!supplierId || selectedPOs.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        supplierId,
        retentionPct,
        notes: notes || undefined,
        lines: selectedOrders.map(po => ({
          ...(po.docType === 'PAYABLE' ? { payableId: po.id } : { purchaseOrderId: po.id }),
          retentionPct,
        })),
      };
      const res = await fetch('/api/proxy/retention-vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear comprobante');
      }
      router.push('/purchases/retentions');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/purchases/retentions')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Shield className="text-purple-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Nuevo Comprobante de Retención IVA</h1>
          <p className="text-sm text-slate-400">Seleccione proveedor y facturas a incluir</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      )}

      {/* Supplier selector */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Proveedor</h2>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            value={supplierSearch}
            onChange={(e) => {
              setSupplierSearch(e.target.value);
              if (supplierId) clearSupplier();
              setSupplierDropdown(true);
            }}
            onFocus={() => setSupplierDropdown(true)}
            placeholder="Buscar proveedor agente de retención..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
          {supplierId && (
            <button onClick={clearSupplier} className="absolute right-2 top-2.5 text-slate-500 hover:text-slate-300">
              <X size={16} />
            </button>
          )}

          {/* Dropdown */}
          {supplierDropdown && !supplierId && supplierSearch.length >= 2 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {loadingSuppliers ? (
                <div className="p-3 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" size={16} /></div>
              ) : suppliers.length === 0 ? (
                <div className="p-3 text-sm text-slate-500 text-center">No se encontraron proveedores agentes de retención</div>
              ) : (
                suppliers.map(s => (
                  <button key={s.id} onClick={() => selectSupplier(s)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">{s.name}</span>
                      {s.isRetentionAgent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Agente ret.</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{s.rif || 'S/R'}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Retention % */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">% Retención</label>
            <input
              type="number"
              value={retentionPct}
              onChange={e => setRetentionPct(Number(e.target.value))}
              min={0}
              max={100}
              step={0.01}
              className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 text-center"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-400 mb-1 block">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Available POs */}
      {supplierId && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">
              Documentos disponibles (facturas de compra y CxP)
              {availablePOs.length > 0 && <span className="ml-2 text-xs text-slate-500">({availablePOs.length})</span>}
            </h2>
            {availablePOs.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-purple-400 hover:text-purple-300">
                {selectedPOs.size === availablePOs.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            )}
          </div>

          {loadingPOs ? (
            <div className="py-10 text-center text-slate-500">
              <Loader2 className="animate-spin mx-auto" size={24} />
            </div>
          ) : availablePOs.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              No hay facturas procesadas disponibles para este proveedor
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Factura</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Nº Factura</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Nº Control</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Fecha</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Total $</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">IVA $</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Ret. $</th>
                  </tr>
                </thead>
                <tbody>
                  {availablePOs.map(po => {
                    const isSelected = selectedPOs.has(po.id);
                    const retUsd = round2(po.ivaUsd * (retentionPct / 100));
                    return (
                      <tr key={po.id}
                        onClick={() => togglePO(po.id)}
                        className={`border-b border-slate-700/30 cursor-pointer transition-colors ${isSelected ? 'bg-purple-500/10' : 'hover:bg-slate-700/20'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-600'}`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-blue-400">{po.number}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${po.docType === 'PAYABLE' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-slate-600/30 text-slate-300 border-slate-500/30'}`}>
                              {po.docType === 'PAYABLE' ? 'CxP' : 'FC'}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{po.invoiceNumber || '--'}</td>
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{po.controlNumber || '--'}</td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtDate(po.invoiceDate)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(po.totalUsd)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300 font-mono">${fmt(po.ivaUsd)}</td>
                        <td className="px-3 py-2.5 text-right text-purple-400 font-mono font-bold">${fmt(retUsd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Summary & Save */}
      {selectedPOs.size > 0 && (
        <div className="bg-slate-800/50 border border-purple-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-slate-400">Resumen del comprobante</p>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-500">Facturas</p>
                  <p className="text-lg font-bold text-slate-100">{selectedPOs.size}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">IVA total</p>
                  <p className="text-lg font-bold text-slate-300 font-mono">${fmt(totalIvaUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Retención {retentionPct}%</p>
                  <p className="text-lg font-bold text-purple-400 font-mono">${fmt(totalRetUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Ret. Bs</p>
                  <p className="text-lg font-bold text-purple-400 font-mono">Bs {fmt(totalRetBs)}</p>
                </div>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Crear comprobante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
