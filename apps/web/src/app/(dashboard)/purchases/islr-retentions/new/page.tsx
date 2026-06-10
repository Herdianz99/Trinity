'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Loader2, Save, Search, Check, X, AlertTriangle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  supplierType: string | null;
}

interface AvailablePO {
  id: string;
  number: string;
  purchaseNumber: number;
  invoiceDate: string | null;
  subtotalUsd: number;
  subtotalBs: number;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  supplierControlNumber: string | null;
  supplierInvoiceNumber: string | null;
}

interface IslrType {
  id: string;
  codigo: number;
  descripcion: string;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
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

export default function NewIslrRetentionPage() {
  const router = useRouter();

  useEffect(() => {
    document.title = 'Nueva Retención ISLR | Trinity ERP';
  }, []);

  // ── State ────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierType, setSupplierType] = useState<string | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdown, setSupplierDropdown] = useState(false);

  const [availablePOs, setAvailablePOs] = useState<AvailablePO[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set());
  const [islrTypes, setIslrTypes] = useState<IslrType[]>([]);
  // Per-PO type selection: poId -> typeId
  const [poTypeMap, setPoTypeMap] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [valorUT, setValorUT] = useState(43);

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

  // ── Fetch available POs ───────────────────────────────────────────

  const [defaultConceptId, setDefaultConceptId] = useState<string | null>(null);

  const fetchAvailablePOs = useCallback(async (sid: string) => {
    if (!sid) { setAvailablePOs([]); return; }
    setLoadingPOs(true);
    try {
      const res = await fetch(`/api/proxy/islr-retention-vouchers/available-orders/${sid}`);
      if (!res.ok) throw new Error('Error al cargar facturas');
      const data = await res.json();
      setAvailablePOs(data.orders || []);
      setDefaultConceptId(data.defaultConceptId || null);
    } catch (err: any) {
      setError(err.message);
      setAvailablePOs([]);
    } finally {
      setLoadingPOs(false);
    }
  }, []);

  useEffect(() => {
    setSelectedPOs(new Set());
    setPoTypeMap({});
    setDefaultConceptId(null);
    if (supplierId) fetchAvailablePOs(supplierId);
  }, [supplierId, fetchAvailablePOs]);

  // Pre-populate poTypeMap with default concept when available POs load
  useEffect(() => {
    if (defaultConceptId && availablePOs.length > 0) {
      setPoTypeMap(prev => {
        // Only pre-populate if map is empty (don't overwrite user changes)
        if (Object.keys(prev).length > 0) return prev;
        const map: Record<string, string> = {};
        for (const po of availablePOs) {
          map[po.id] = defaultConceptId;
        }
        return map;
      });
    }
  }, [defaultConceptId, availablePOs]);

  // ── Load config + ISLR types ──────────────────────────────────────

  useEffect(() => {
    fetch('/api/proxy/company-config')
      .then(r => r.json())
      .then(c => { if (c.unidadTributaria) setValorUT(c.unidadTributaria); })
      .catch(() => {});
  }, []);

  // Load all active ISLR types (no filter by supplier type - user picks the correct one)
  useEffect(() => {
    fetch('/api/proxy/islr-retention-types?active=true')
      .then(r => r.json())
      .then(data => setIslrTypes(Array.isArray(data) ? data : []))
      .catch(() => setIslrTypes([]));
  }, []);

  // ── Toggle PO selection ──────────────────────────────────────────

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

  function setPoType(poId: string, typeId: string) {
    setPoTypeMap(prev => ({ ...prev, [poId]: typeId }));
  }

  // ── Calculate retention for a PO ─────────────────────────────────

  function calcRetention(po: AvailablePO, typeId: string | undefined) {
    if (!typeId) return { retUsd: 0, retBs: 0, sustraendoBs: 0 };
    const tipo = islrTypes.find(t => t.id === typeId);
    if (!tipo) return { retUsd: 0, retBs: 0, sustraendoBs: 0 };

    const baseAjustadaBs = po.subtotalBs * (tipo.baseImponiblePct / 100);
    const retencionBrutaBs = baseAjustadaBs * (tipo.retentionPct / 100);

    let sustraendoBs = 0;
    if (tipo.sustraendoUt > 0 && supplierType === 'NATURAL_RESIDENTE') {
      sustraendoBs = round2(tipo.sustraendoUt * valorUT);
    }

    const retBs = Math.max(0, round2(retencionBrutaBs - sustraendoBs));

    const baseAjustadaUsd = po.subtotalUsd * (tipo.baseImponiblePct / 100);
    const retencionBrutaUsd = baseAjustadaUsd * (tipo.retentionPct / 100);
    const sustraendoUsd = po.exchangeRate > 0 ? round2(sustraendoBs / po.exchangeRate) : 0;
    const retUsd = Math.max(0, round2(retencionBrutaUsd - sustraendoUsd));

    return { retUsd, retBs, sustraendoBs };
  }

  // ── Computed ──────────────────────────────────────────────────────

  const selectedOrders = availablePOs.filter(p => selectedPOs.has(p.id));
  const allHaveType = selectedOrders.every(po => poTypeMap[po.id]);

  let totalRetUsd = 0;
  let totalRetBs = 0;
  for (const po of selectedOrders) {
    const { retUsd, retBs } = calcRetention(po, poTypeMap[po.id]);
    totalRetUsd += retUsd;
    totalRetBs += retBs;
  }
  totalRetUsd = round2(totalRetUsd);
  totalRetBs = round2(totalRetBs);

  // ── Select supplier ──────────────────────────────────────────────

  function selectSupplier(s: Supplier) {
    setSupplierId(s.id);
    setSupplierType(s.supplierType);
    setSupplierSearch(s.name + (s.rif ? ` (${s.rif})` : ''));
    setSupplierDropdown(false);
  }

  function clearSupplier() {
    setSupplierId('');
    setSupplierType(null);
    setSupplierSearch('');
    setAvailablePOs([]);
    setSelectedPOs(new Set());
    setPoTypeMap({});
  }

  // ── Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!supplierId || selectedPOs.size === 0 || !allHaveType) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        supplierId,
        notes: notes || undefined,
        lines: selectedOrders.map(po => ({
          purchaseOrderId: po.id,
          islrRetentionTypeId: poTypeMap[po.id],
        })),
      };
      const res = await fetch('/api/proxy/islr-retention-vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear comprobante');
      }
      router.push('/purchases/islr-retentions');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  const supplierTypeLabel = supplierType === 'JURIDICA' ? 'Persona Jurídica'
    : supplierType === 'NATURAL_RESIDENTE' ? 'P.N. Residente'
    : supplierType === 'NATURAL_NO_RESIDENTE' ? 'P.N. No Residente'
    : 'Sin clasificar';

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/purchases/islr-retentions')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <FileText className="text-orange-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Nuevo Comprobante de Retención ISLR</h1>
          <p className="text-sm text-slate-400">Seleccione proveedor, facturas y concepto por cada línea</p>
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
            placeholder="Buscar proveedor..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
          {supplierId && (
            <button onClick={clearSupplier} className="absolute right-2 top-2.5 text-slate-500 hover:text-slate-300">
              <X size={16} />
            </button>
          )}

          {supplierDropdown && !supplierId && supplierSearch.length >= 2 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {loadingSuppliers ? (
                <div className="p-3 text-center text-slate-500"><Loader2 className="animate-spin mx-auto" size={16} /></div>
              ) : suppliers.length === 0 ? (
                <div className="p-3 text-sm text-slate-500 text-center">No se encontraron proveedores</div>
              ) : (
                suppliers.map(s => (
                  <button key={s.id} onClick={() => selectSupplier(s)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">{s.name}</span>
                      {s.supplierType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          {s.supplierType === 'JURIDICA' ? 'PJ' : s.supplierType === 'NATURAL_RESIDENTE' ? 'PNR' : 'PNNR'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{s.rif || 'S/R'}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {supplierId && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Tipo:</span>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${
              supplierType ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}>
              {supplierTypeLabel}
            </span>
            {!supplierType && (
              <span className="text-xs text-amber-400">Clasifique al proveedor para un cálculo correcto del sustraendo</span>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-4">
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
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Valor UT</label>
            <p className="text-sm text-slate-300 font-mono py-2">Bs {fmt(valorUT)}</p>
          </div>
        </div>
      </div>

      {/* Available POs */}
      {supplierId && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">
              Facturas disponibles
              {availablePOs.length > 0 && <span className="ml-2 text-xs text-slate-500">({availablePOs.length})</span>}
            </h2>
            {availablePOs.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-orange-400 hover:text-orange-300">
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
                    <th className="text-left px-3 py-2 text-slate-400 font-medium">Fecha</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Subtotal Bs</th>
                    <th className="text-left px-3 py-2 text-slate-400 font-medium min-w-[200px]">Concepto ISLR</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Sust. Bs</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Ret. Bs</th>
                    <th className="text-right px-3 py-2 text-slate-400 font-medium">Ret. $</th>
                  </tr>
                </thead>
                <tbody>
                  {availablePOs.map(po => {
                    const isSelected = selectedPOs.has(po.id);
                    const typeId = poTypeMap[po.id];
                    const { retUsd, retBs, sustraendoBs } = calcRetention(po, typeId);
                    return (
                      <tr key={po.id}
                        className={`border-b border-slate-700/30 transition-colors ${isSelected ? 'bg-orange-500/10' : 'hover:bg-slate-700/20'}`}>
                        <td className="px-3 py-2.5 text-center cursor-pointer" onClick={() => togglePO(po.id)}>
                          <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-slate-600'}`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-blue-400 font-mono text-xs">{po.number}</td>
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{po.supplierInvoiceNumber || '--'}</td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtDate(po.invoiceDate)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-300 font-mono">Bs {fmt(po.subtotalBs)}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={typeId || ''}
                            onChange={e => setPoType(po.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
                            <option value="">-- Seleccionar --</option>
                            {islrTypes.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.codigo} - {t.descripcion} ({t.retentionPct}%)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400 font-mono text-xs">
                          {sustraendoBs > 0 ? `Bs ${fmt(sustraendoBs)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-orange-400 font-mono font-bold">
                          {typeId ? `Bs ${fmt(retBs)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400 font-mono text-xs">
                          {typeId ? `$${fmt(retUsd)}` : '--'}
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

      {/* Summary & Save */}
      {selectedPOs.size > 0 && (
        <div className="bg-slate-800/50 border border-orange-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-slate-400">Resumen del comprobante ISLR</p>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-500">Facturas</p>
                  <p className="text-lg font-bold text-slate-100">{selectedPOs.size}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Retención ISLR Bs</p>
                  <p className="text-lg font-bold text-orange-400 font-mono">Bs {fmt(totalRetBs)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Retención ISLR $</p>
                  <p className="text-sm text-slate-400 font-mono">${fmt(totalRetUsd)}</p>
                </div>
              </div>
              {!allHaveType && (
                <p className="text-xs text-amber-400 mt-2">Seleccione un concepto ISLR para cada factura</p>
              )}
            </div>
            <button onClick={handleSave} disabled={saving || !allHaveType}
              className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Crear comprobante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
