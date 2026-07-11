'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Search, Trash2, Check, Save,
  Package, XCircle, Printer,
} from 'lucide-react';
import CustomerSearchSelect from '@/components/customer-search-select';

// ── Types ──────────────────────────────────────────────
interface AdjustmentItem {
  id: string;
  productId: string;
  product: {
    id: string;
    code: string;
    name: string;
    costUsd: number;
    bregaApplies: boolean;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    stock?: { warehouseId: string; quantity: number }[];
  };
  quantity: number;
  unitCostUsd?: number | null;
}

interface AdjustmentDetail {
  id: string;
  number: string | null;
  warehouse: { id: string; name: string };
  type: 'IN' | 'OUT';
  status: 'DRAFT' | 'PROCESSED' | 'CANCELLED';
  costMode: 'COST' | 'BREGA';
  description: string | null;
  customer: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  items: AdjustmentItem[];
  processedAt: string | null;
  createdAt: string;
}

interface Party { id: string; name: string; creditDays?: number }

interface SearchResult {
  id: string;
  code: string;
  name: string;
  category: { id: string; name: string } | null;
}

// ── Constants ──────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PROCESSED: 'Procesado',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  PROCESSED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const TYPE_LABELS: Record<string, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
};

const TYPE_BADGES: Record<string, string> = {
  IN: 'bg-green-500/10 text-green-400 border-green-500/20',
  OUT: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

export default function InventoryAdjustmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // ── State ──────────────────────────────────────────
  const [adjustment, setAdjustment] = useState<AdjustmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Items state
  const [quantityValues, setQuantityValues] = useState<Record<string, number>>({});
  // Se guarda como texto crudo para poder escribir el punto/coma decimal sin que
  // el re-render lo borre (mismo fix que las otras cajas). Se parsea al usarlo.
  const [costValues, setCostValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Process modal + generacion de CxC/CxP
  const [bregaGlobalPct, setBregaGlobalPct] = useState(0);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [genAccount, setGenAccount] = useState(false);
  const [procEntityId, setProcEntityId] = useState('');
  const [procDueDate, setProcDueDate] = useState('');

  // ── Data fetching ──────────────────────────────────
  const fetchAdjustment = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setAdjustment(data);
        // Preservar las cantidades que el usuario ya escribio y aun no ha guardado:
        // al agregar/eliminar un producto se re-consulta el ajuste, pero esos cambios
        // locales todavia no estan en el server. Solo tomamos del server los items nuevos.
        setQuantityValues((prev) => {
          const vals: Record<string, number> = {};
          data.items.forEach((item: AdjustmentItem) => {
            vals[item.productId] = prev[item.productId] ?? item.quantity;
          });
          return vals;
        });
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAdjustment(); }, [fetchAdjustment]);

  // Datos para el modal de proceso: brecha global (para el total) + clientes + proveedores
  useEffect(() => {
    fetch('/api/proxy/config').then(r => r.ok ? r.json() : null).then(d => { if (d) setBregaGlobalPct(d.bregaGlobalPct || 0); }).catch(() => {});
    // Clientes NO se cargan en bloque (empresa grande ~48k): se buscan server-side al elegir.
    fetch('/api/proxy/suppliers').then(r => r.ok ? r.json() : null).then(d => { if (d) setSuppliers(Array.isArray(d) ? d : d.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (adjustment) {
      document.title = `${adjustment.number || 'Ajuste'} - ${adjustment.warehouse.name} | Trinity ERP`;
    }
  }, [adjustment]);

  // Costo efectivo calculado del producto segun el modo del ajuste (costo, o costo+brecha).
  function effectiveProductCost(it: AdjustmentItem, costMode: string): number {
    const bregaPct = costMode !== 'COST' && it.product.bregaApplies ? bregaGlobalPct : 0;
    return it.product.costUsd * (1 + bregaPct / 100);
  }
  // Costo a usar: el editado en pantalla > el guardado (unitCostUsd) > el calculado.
  function resolveItemCost(it: AdjustmentItem, costMode: string): number {
    const raw = costValues[it.productId];
    if (raw !== undefined) {
      const n = parseFloat(String(raw).replace(',', '.'));
      return isNaN(n) ? 0 : n;
    }
    return it.unitCostUsd ?? effectiveProductCost(it, costMode);
  }

  // ── Costo total del ajuste (mismo calculo que el reporte PDF y la CxC/CxP) ──
  const totalCost = adjustment
    ? adjustment.items.reduce((sum, it) => {
        const qty = quantityValues[it.productId] ?? it.quantity;
        return sum + qty * resolveItemCost(it, adjustment.costMode);
      }, 0)
    : 0;

  // Fecha de vencimiento por defecto = hoy + dias de credito
  function dueFromDays(days?: number): string {
    if (!days || days <= 0) return '';
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Vencimiento por defecto para una entidad (proveedores vienen de la lista cargada;
  // los clientes se resuelven al elegirlos con el buscador server-side).
  function dueDateFor(entityId: string, type: 'IN' | 'OUT'): string {
    if (type === 'OUT') return dueFromDays((adjustment?.customer as any)?.creditDays);
    return dueFromDays(suppliers.find(p => p.id === entityId)?.creditDays);
  }

  // ── Click outside to close dropdown ────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Existing product IDs ──
  const existingProductIds = new Set(adjustment?.items.map(i => i.productId) ?? []);

  // ── Search products ──
  useEffect(() => {
    if (!searchText || searchText.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ search: searchText, limit: '15' });
        const res = await fetch(`/api/proxy/products?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data || []);
          setShowDropdown(true);
        }
      } catch { /* ignore */ } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  // ── Add single product ─────────────────────────────
  async function handleAddProduct(productId: string) {
    if (existingProductIds.has(productId)) return;
    setAdding(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}/items/by-ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [productId] }),
      });
      if (res.ok) {
        setSearchText('');
        setShowDropdown(false);
        setSearchResults([]);
        fetchAdjustment();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  // ── Remove product ─────────────────────────────────
  async function handleRemoveItem(productId: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}/items/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [productId] }),
      });
      if (res.ok) fetchAdjustment();
    } catch { /* ignore */ }
  }

  // ── Save quantities ──────────────────────────────
  async function handleSaveQuantities() {
    if (!adjustment) return;
    setSaving(true);
    setMessage(null);
    try {
      const items = adjustment.items.map(item => ({
        productId: item.productId,
        quantity: Number(quantityValues[item.productId] ?? 0),
        unitCostUsd: Number(resolveItemCost(item, adjustment.costMode)),
      }));
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Cantidades guardadas' });
        fetchAdjustment();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Cancel adjustment ──────────────────────────────
  async function handleCancel() {
    if (!confirm('Cancelar este ajuste? Esta accion no se puede deshacer.')) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}/cancel`, { method: 'PATCH' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Ajuste cancelado' });
        fetchAdjustment();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete adjustment (solo borrador/cancelado) ────
  async function handleDelete() {
    if (!confirm('Eliminar este ajuste permanentemente? Esta accion no se puede deshacer.')) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/proxy/inventory-adjustments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/inventory/adjustments');
        return;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setSaving(false);
    }
  }

  // ── Abrir modal de proceso (pre-llena entidad y vencimiento) ──
  function openProcessModal() {
    if (!adjustment) return;
    const entId = adjustment.type === 'OUT' ? (adjustment.customer?.id || '') : (adjustment.supplier?.id || '');
    setProcEntityId(entId);
    setGenAccount(!!entId); // si ya tiene entidad, por defecto proponemos generar la cuenta
    setProcDueDate(entId ? dueDateFor(entId, adjustment.type) : '');
    setMessage(null);
    setShowProcessModal(true);
  }

  // ── Confirmar proceso (guarda cantidades + procesa + genera cuenta si aplica) ──
  async function confirmProcess() {
    if (!adjustment) return;
    setSaving(true);
    setMessage(null);
    try {
      // Guardar cantidades pendientes antes de procesar
      const items = adjustment.items.map(item => ({
        productId: item.productId,
        quantity: Number(quantityValues[item.productId] ?? 0),
        unitCostUsd: Number(resolveItemCost(item, adjustment.costMode)),
      }));
      if (items.length > 0) {
        const saveRes = await fetch(`/api/proxy/inventory-adjustments/${id}/items`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al guardar cantidades');
        }
      }

      const body: any = { generateAccount: genAccount };
      if (genAccount) {
        if (adjustment.type === 'OUT') body.customerId = procEntityId;
        else body.supplierId = procEntityId;
        if (procDueDate) body.dueDate = new Date(procDueDate + 'T12:00:00').toISOString();
      }

      const res = await fetch(`/api/proxy/inventory-adjustments/${id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Error');

      const acc = data.generatedAccount;
      setMessage({
        type: 'success',
        text: acc
          ? `Ajuste procesado. Se genero ${acc.kind === 'CXC' ? 'CxC' : 'CxP'} ${acc.number} por $${(acc.amountUsd ?? 0).toFixed(2)}.`
          : 'Ajuste procesado y stock actualizado',
      });
      setShowProcessModal(false);
      fetchAdjustment();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (!adjustment) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Ajuste no encontrado</p>
        <button onClick={() => router.push('/inventory/adjustments')} className="btn-secondary mt-4 text-sm">
          Volver
        </button>
      </div>
    );
  }

  // ── Computed values ────────────────────────────────
  const totalItems = adjustment.items.length;
  const totalUnits = adjustment.items.reduce((sum, i) => sum + (quantityValues[i.productId] ?? i.quantity), 0);
  const isDraft = adjustment.status === 'DRAFT';
  const isProcessed = adjustment.status === 'PROCESSED';
  const isCancelled = adjustment.status === 'CANCELLED';

  // Existencia actual del producto en el almacen del ajuste.
  const warehouseStock = (item: AdjustmentItem): number =>
    item.product.stock?.find(s => s.warehouseId === adjustment.warehouse.id)?.quantity ?? 0;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push('/inventory/adjustments')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
      >
        <ArrowLeft size={16} /> Volver a ajustes
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {adjustment.number && (
              <span className="font-mono text-lg font-bold text-green-400">{adjustment.number}</span>
            )}
            <h1 className="text-2xl font-bold text-white">{adjustment.warehouse.name}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${TYPE_BADGES[adjustment.type]}`}>
              {TYPE_LABELS[adjustment.type]}
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${STATUS_BADGES[adjustment.status]}`}>
              {STATUS_LABELS[adjustment.status] || adjustment.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
            <span>{totalItems} producto(s)</span>
            <span>{totalUnits} unidad(es)</span>
            {(adjustment.customer || adjustment.supplier) && (
              <span>— {adjustment.customer?.name || adjustment.supplier?.name}</span>
            )}
            {adjustment.description && <span className="text-slate-500">| {adjustment.description}</span>}
          </div>
        </div>
        {adjustment.items.length > 0 && (
          <button
            onClick={() => window.open(`/api/proxy/inventory-adjustments/${id}/pdf`)}
            className="btn-secondary !py-2 text-sm flex items-center gap-2 self-start"
          >
            <Printer size={16} /> Imprimir reporte
          </button>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* ═══ DRAFT: Search + Items ═══ */}
      {isDraft && (
        <>
          {/* Search bar */}
          <div ref={searchRef} className="relative mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Buscar producto por nombre o codigo..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                className="input-field pl-9 !py-3 text-sm w-full"
                autoComplete="off"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={16} />
              )}
            </div>

            {/* Search dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                {searchResults.map(p => {
                  const alreadyAdded = existingProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => !alreadyAdded && handleAddProduct(p.id)}
                      disabled={alreadyAdded || adding}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-700/30 last:border-0 ${
                        alreadyAdded
                          ? 'opacity-40 cursor-default'
                          : 'hover:bg-slate-700/50 cursor-pointer'
                      }`}
                    >
                      <span className="font-mono text-xs text-green-400 w-20 flex-shrink-0">{p.code}</span>
                      <span className="text-white flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">{p.category?.name || ''}</span>
                      {alreadyAdded && <span className="text-xs text-green-500 flex-shrink-0">Agregado</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {showDropdown && searchText.length >= 2 && !searchLoading && searchResults.length === 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl p-4 text-center text-sm text-slate-500">
                No se encontraron productos
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="card overflow-hidden">
            {adjustment.items.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Package size={40} className="mx-auto mb-3 opacity-40" />
                <p>No hay productos en este ajuste</p>
                <p className="text-xs mt-1">Busca productos arriba para agregarlos</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Existencias</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">
                        {adjustment.costMode === 'COST' ? 'Costo $' : 'Costo+brecha $'}
                      </th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustment.items.map(item => (
                      <tr key={item.id} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.product.code}</td>
                        <td className="px-4 py-2.5 text-white">{item.product.name}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{item.product.category?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-300">{warehouseStock(item)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={costValues[item.productId] ?? String(resolveItemCost(item, adjustment.costMode))}
                            onChange={(e) => setCostValues(v => ({
                              ...v,
                              [item.productId]: e.target.value.replace(/[^0-9.,]/g, ''),
                            }))}
                            className="input-field !py-1 text-sm w-24 text-right font-mono"
                            title="Costo efectivo para este ajuste (reporte + CxC/CxP)"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={quantityValues[item.productId] ?? ''}
                            onChange={(e) => setQuantityValues(v => ({
                              ...v,
                              [item.productId]: Number(e.target.value),
                            }))}
                            className="input-field !py-1 text-sm w-24 text-right font-mono"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.productId)}
                            className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={16} /> Eliminar ajuste
              </button>
              {adjustment.items.length > 0 && (
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="text-sm text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <XCircle size={16} /> Cancelar ajuste
                </button>
              )}
            </div>
            {adjustment.items.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveQuantities}
                  disabled={saving}
                  className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Guardar
                </button>
                <button
                  onClick={openProcessModal}
                  disabled={saving}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  Procesar ajuste
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ PROCESSED: Summary ═══ */}
      {isProcessed && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Total productos</p>
              <p className="text-2xl font-bold text-white">{totalItems}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Total unidades</p>
              <p className="text-2xl font-bold text-white">{totalUnits}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Tipo</p>
              <p className={`text-2xl font-bold ${adjustment.type === 'IN' ? 'text-green-400' : 'text-orange-400'}`}>
                {TYPE_LABELS[adjustment.type]}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-400 mb-1">Fecha procesamiento</p>
              <p className="text-lg font-bold text-white">
                {adjustment.processedAt
                  ? new Date(adjustment.processedAt).toLocaleDateString('es-VE')
                  : '—'}
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Codigo</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Producto</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Categoria</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Cantidad ajustada</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustment.items.map(item => (
                    <tr key={item.id} className="border-b border-slate-700/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.product.code}</td>
                      <td className="px-4 py-2.5 text-white">{item.product.name}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs hidden md:table-cell">{item.product.category?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span className={adjustment.type === 'IN' ? 'text-green-400' : 'text-orange-400'}>
                          {adjustment.type === 'IN' ? '+' : '-'}{item.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ CANCELLED ═══ */}
      {isCancelled && (
        <div className="card p-8 text-center">
          <XCircle size={48} className="mx-auto mb-3 text-red-400 opacity-40" />
          <p className="text-slate-400 text-lg">Este ajuste fue cancelado</p>
          <p className="text-slate-500 text-sm mt-1">{totalItems} producto(s) estaban en el ajuste</p>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="mt-4 text-sm text-red-400 hover:text-red-300 transition-colors inline-flex items-center gap-1.5"
          >
            <Trash2 size={16} /> Eliminar ajuste
          </button>
        </div>
      )}

      {/* ═══ Modal de proceso ═══ */}
      {showProcessModal && adjustment && (() => {
        const isOut = adjustment.type === 'OUT';
        const accKind = isOut ? 'CxC' : 'CxP';
        const entityLabel = isOut ? 'Cliente' : 'Proveedor';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !saving && setShowProcessModal(false)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Procesar ajuste</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isOut ? 'SALIDA — se restara stock' : 'ENTRADA — se sumara stock'} de {adjustment.items.length} producto(s). No se puede deshacer.
                </p>
              </div>

              <div className="p-5 space-y-4">
                {/* Toggle generar cuenta */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={genAccount}
                    onChange={(e) => setGenAccount(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                  />
                  <span className="text-sm text-slate-200">Generar {accKind} por el costo del ajuste</span>
                </label>

                {genAccount && (
                  <div className="space-y-3 pl-1">
                    {/* Total */}
                    <div className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-400">Monto ({adjustment.costMode === 'COST' ? 'costo' : 'costo + brecha'})</span>
                      <span className="text-lg font-bold text-green-400 font-mono">${totalCost.toFixed(2)}</span>
                    </div>

                    {/* Entidad: cliente con buscador server-side; proveedor con select normal */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">{entityLabel} *</label>
                      {isOut ? (
                        <CustomerSearchSelect
                          value={procEntityId}
                          onSelect={(c) => { setProcEntityId(c?.id || ''); setProcDueDate(c ? dueFromDays(c.creditDays) : ''); }}
                          placeholder="Buscar cliente por nombre o cédula…"
                        />
                      ) : (
                        <select
                          value={procEntityId}
                          onChange={(e) => { setProcEntityId(e.target.value); setProcDueDate(dueDateFor(e.target.value, adjustment.type)); }}
                          className="input-field !py-2 text-sm"
                        >
                          <option value="">Seleccionar proveedor...</option>
                          {suppliers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </div>

                    {/* Vencimiento */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Vencimiento (opcional)</label>
                      <input
                        type="date"
                        value={procDueDate}
                        onChange={(e) => setProcDueDate(e.target.value)}
                        className="input-field !py-2 text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Se pre-llena con los dias de credito de la entidad. Vacio = sin vencimiento.</p>
                    </div>

                    {!procEntityId && (
                      <p className="text-xs text-amber-400">Selecciona un {entityLabel.toLowerCase()} para generar la {accKind}.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-700 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowProcessModal(false)} disabled={saving} className="btn-secondary !py-2 text-sm">Cancelar</button>
                <button
                  type="button"
                  onClick={confirmProcess}
                  disabled={saving || (genAccount && !procEntityId)}
                  className="btn-primary !py-2 text-sm flex items-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  Procesar{genAccount ? ` y generar ${accKind}` : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
