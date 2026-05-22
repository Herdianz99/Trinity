'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ShoppingCart,
  Loader2,
  Save,
  Search,
  X,
  Plus,
  CheckCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  isRetentionAgent: boolean;
}

interface Warehouse {
  id: string;
  name: string;
}

interface ProductSearchResult {
  id: string;
  code: string;
  name: string;
  priceDetal: number;
  priceMayor: number;
  totalStock: number;
  isService?: boolean;
}

interface ProductDetail {
  id: string;
  code: string;
  name: string;
  costUsd: number;
  ivaType: string;
  isService?: boolean;
}

interface FormItem {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  costUsd: number;
  discountPct: number;
  ivaType: string;
  isService: boolean;
}

interface SuggestedPrice {
  productId: string;
  productCode: string;
  productName: string;
  currentCostUsd: number;
  newCostUsd: number;
  currentGananciaPct: number;
  currentGananciaMayorPct: number;
  currentPriceDetal: number;
  suggestedPriceDetal: number;
  currentPriceMayor: number;
  suggestedPriceMayor: number;
  bregaPct: number;
  ivaMultiplier: number;
  ivaType: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

const IVA_LABELS: Record<string, string> = {
  EXEMPT: '0%',
  REDUCED: '8%',
  GENERAL: '16%',
  SPECIAL: '31%',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewPurchaseBillPage() {
  const router = useRouter();

  // ---- Bootstrap data ----
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- Form header state ----
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [supplierSerialNumber, setSupplierSerialNumber] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [supplierControlNumber, setSupplierControlNumber] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [creditDays, setCreditDays] = useState<number>(30);

  // ---- Items ----
  const [items, setItems] = useState<FormItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [activeSearchRow, setActiveSearchRow] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Fiscal totals ----
  const [surchargeUsd, setSurchargeUsd] = useState<number>(0);
  const [surchargeDistribution, setSurchargeDistribution] = useState<'PROPORTIONAL' | 'EQUAL'>('PROPORTIONAL');
  const [discountGlobalPct, setDiscountGlobalPct] = useState<number>(0);
  const [retentionVoucherNumber, setRetentionVoucherNumber] = useState('');
  const [notes, setNotes] = useState('');

  // ---- Save state ----
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ---- Price update modal ----
  const [priceModal, setPriceModal] = useState(false);
  const [suggestedPrices, setSuggestedPrices] = useState<SuggestedPrice[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [processingPrices, setProcessingPrices] = useState(false);

  // ---- Refs ----
  const supplierRef = useRef<HTMLDivElement>(null);

  // ---- Title ----
  useEffect(() => {
    document.title = 'Nueva Factura de Compra | Trinity ERP';
  }, []);

  // ---- Load bootstrap data ----
  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [supRes, whRes, rateRes, profileRes] = await Promise.all([
        fetch('/api/proxy/suppliers?isActive=true'),
        fetch('/api/proxy/warehouses?isActive=true'),
        fetch('/api/proxy/exchange-rate/today'),
        fetch('/api/auth/me'),
      ]);

      if (supRes.ok) {
        const data = await supRes.json();
        setSuppliers(Array.isArray(data) ? data : data.data || []);
      }

      if (whRes.ok) {
        const data = await whRes.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setWarehouses(list);
        if (list.length > 0) setWarehouseId(list[0].id);
      }

      if (rateRes.ok) {
        const text = await rateRes.text();
        if (text) {
          try {
            const rate = JSON.parse(text);
            if (rate && rate.rate) setExchangeRate(rate.rate);
          } catch { /* ignore */ }
        }
      }

      if (profileRes.ok) {
        const data = await profileRes.json();
        setUser(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

  // ---- Close supplier dropdown on outside click ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Selected supplier ----
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId],
  );

  // ---- Supplier filtering ----
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.rif && s.rif.toLowerCase().includes(q)),
    );
  }, [suppliers, supplierSearch]);

  // ---- Product search with debounce ----
  function handleProductSearch(q: string, rowIdx: number) {
    setProductSearch(q);
    setActiveSearchRow(rowIdx);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) {
      setProductResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await fetch(`/api/proxy/products/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setProductResults(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ } finally {
        setSearchingProducts(false);
      }
    }, 300);
  }

  async function selectProduct(p: ProductSearchResult, rowIdx: number) {
    // Fetch full product detail for costUsd and ivaType
    let costUsd = 0;
    let ivaType = 'GENERAL';
    try {
      const res = await fetch(`/api/proxy/products/${p.id}`);
      if (res.ok) {
        const detail: ProductDetail = await res.json();
        costUsd = detail.costUsd || 0;
        ivaType = detail.ivaType || 'GENERAL';
      }
    } catch { /* use defaults */ }

    const newItems = [...items];
    newItems[rowIdx] = {
      productId: p.id,
      code: p.code,
      name: p.name,
      quantity: newItems[rowIdx]?.quantity || 1,
      costUsd,
      discountPct: newItems[rowIdx]?.discountPct || 0,
      ivaType,
      isService: p.isService || false,
    };
    setItems(newItems);
    setProductSearch('');
    setProductResults([]);
    setActiveSearchRow(null);
  }

  function addEmptyRow() {
    setItems([
      ...items,
      {
        productId: '',
        code: '',
        name: '',
        quantity: 1,
        costUsd: 0,
        discountPct: 0,
        ivaType: 'GENERAL',
        isService: false,
      },
    ]);
  }

  function removeRow(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof FormItem, value: any) {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  }

  // ---- Real-time calculations ----
  const calculations = useMemo(() => {
    // Per-item calculations
    const itemCalcs = items.map((item) => {
      const lineBruto = item.costUsd * item.quantity;
      const lineDiscount = lineBruto * (item.discountPct / 100);
      const importeUsd = lineBruto - lineDiscount;
      const ivaRate = IVA_RATES[item.ivaType] || 0;
      const importeBs = importeUsd * exchangeRate;
      return { ...item, lineBruto, lineDiscount, importeUsd, ivaRate, importeBs };
    });

    const subtotalUsd = itemCalcs.reduce((sum, i) => sum + i.importeUsd, 0);

    // Global discount
    const globalDiscountUsd = subtotalUsd * (discountGlobalPct / 100);
    const subtotalAfterDiscount = subtotalUsd - globalDiscountUsd;

    // Prorate global discount per item for exempt/taxable split
    const exemptUsd = itemCalcs.reduce((sum, i) => {
      if (i.ivaType !== 'EXEMPT') return sum;
      const proportion = subtotalUsd > 0 ? i.importeUsd / subtotalUsd : 0;
      return sum + i.importeUsd - globalDiscountUsd * proportion;
    }, 0);

    const taxableBaseUsd = subtotalAfterDiscount - exemptUsd;

    // IVA per item (with global discount prorated)
    const totalIvaUsd = itemCalcs.reduce((sum, i) => {
      if (i.ivaType === 'EXEMPT') return sum;
      const proportion = subtotalUsd > 0 ? i.importeUsd / subtotalUsd : 0;
      const itemAfterGlobalDiscount = i.importeUsd - globalDiscountUsd * proportion;
      return sum + itemAfterGlobalDiscount * i.ivaRate;
    }, 0);

    const totalUsd = subtotalAfterDiscount + totalIvaUsd + surchargeUsd;
    const totalBs = totalUsd * exchangeRate;

    // IVA retention if supplier is retention agent
    const isRetentionAgent = selectedSupplier?.isRetentionAgent || false;
    const retentionIvaUsd = isRetentionAgent ? totalIvaUsd * 0.75 : 0;
    const netPayable = isRetentionAgent ? totalUsd - retentionIvaUsd : totalUsd;

    return {
      itemCalcs,
      subtotalUsd,
      globalDiscountUsd,
      subtotalAfterDiscount,
      exemptUsd,
      taxableBaseUsd,
      totalIvaUsd,
      totalUsd,
      totalBs,
      isRetentionAgent,
      retentionIvaUsd,
      netPayable,
    };
  }, [items, discountGlobalPct, surchargeUsd, exchangeRate, selectedSupplier]);

  // ---- Validation ----
  function validate(): string | null {
    if (!supplierId) return 'Selecciona un proveedor';
    if (!warehouseId) return 'Selecciona un almacen';
    if (!invoiceDate) return 'Ingresa la fecha de factura';
    const validItems = items.filter((i) => i.productId);
    if (validItems.length === 0) return 'Agrega al menos un articulo';
    for (let i = 0; i < validItems.length; i++) {
      if (validItems[i].quantity <= 0) return `Articulo ${i + 1}: cantidad debe ser mayor a 0`;
      if (validItems[i].costUsd < 0) return `Articulo ${i + 1}: precio invalido`;
    }
    return null;
  }

  // ---- Build payload ----
  function buildPayload() {
    return {
      supplierId,
      supplierSerialNumber: supplierSerialNumber || undefined,
      supplierControlNumber: supplierControlNumber || undefined,
      supplierInvoiceNumber: supplierInvoiceNumber || undefined,
      invoiceDate: (() => {
        const [y, m, d] = invoiceDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setUTCHours(12, 0, 0, 0);
        return dt.toISOString();
      })(),
      receivedDate: receivedDate
        ? (() => {
            const [y, m, d] = receivedDate.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            dt.setUTCHours(12, 0, 0, 0);
            return dt.toISOString();
          })()
        : undefined,
      currency,
      exchangeRate: Number(exchangeRate),
      warehouseId,
      isCredit,
      creditDays: isCredit ? Number(creditDays) : 0,
      discountGlobalPct: Number(discountGlobalPct),
      surchargeUsd: Number(surchargeUsd),
      surchargeDistribution,
      retentionVoucherNumber: retentionVoucherNumber || undefined,
      notes: notes || undefined,
      items: items
        .filter((i) => i.productId)
        .map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          costUsd: Number(i.costUsd),
          discountPct: Number(i.discountPct),
        })),
    };
  }

  // ---- Save as PENDING ----
  async function handleSaveDraft() {
    const err = validate();
    if (err) {
      setMessage({ type: 'error', text: err });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al guardar');
      }
      const created = await res.json();
      router.push(`/purchases/${created.id}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  // ---- Process (save + suggested prices modal) ----
  async function handleProcess() {
    const err = validate();
    if (err) {
      setMessage({ type: 'error', text: err });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // Step 1: Create purchase bill
      const res = await fetch('/api/proxy/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al guardar');
      }
      const created = await res.json();
      setCreatedId(created.id);

      // Step 2: Get suggested prices
      try {
        const pricesRes = await fetch(`/api/proxy/purchases/${created.id}/suggested-prices`);
        if (pricesRes.ok) {
          const prices: SuggestedPrice[] = await pricesRes.json();
          setSuggestedPrices(prices);
          const edits: Record<string, { gananciaPct: number; gananciaMayorPct: number; priceDetal: number; priceMayor: number }> = {};
          for (const p of prices) {
            edits[p.productId] = {
              gananciaPct: p.currentGananciaPct,
              gananciaMayorPct: p.currentGananciaMayorPct,
              priceDetal: p.suggestedPriceDetal,
              priceMayor: p.suggestedPriceMayor,
            };
          }
          setPriceEdits(edits);
          setPriceModal(true);
        } else {
          // No suggested prices, process without
          await processWithoutPrices(created.id);
        }
      } catch {
        await processWithoutPrices(created.id);
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function processWithoutPrices(id: string) {
    const res = await fetch(`/api/proxy/purchases/${id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Error al procesar');
    }
    router.push(`/purchases/${id}`);
  }

  async function handleProcessWithPrices() {
    if (!createdId) return;
    setProcessingPrices(true);
    try {
      const priceUpdates = Object.entries(priceEdits).map(([productId, data]) => ({
        productId,
        gananciaPct: data.gananciaPct,
        gananciaMayorPct: data.gananciaMayorPct,
      }));
      const res = await fetch(`/api/proxy/purchases/${createdId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceUpdates }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      router.push(`/purchases/${createdId}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessingPrices(false);
    }
  }

  async function handleProcessWithoutPriceChanges() {
    if (!createdId) return;
    setProcessingPrices(true);
    try {
      await processWithoutPrices(createdId);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessingPrices(false);
    }
  }

  function handleGananciaChange(productId: string, field: 'gananciaPct' | 'gananciaMayorPct', value: number) {
    const sp = suggestedPrices.find((p) => p.productId === productId);
    if (!sp) return;
    const cost = sp.newCostUsd;
    const base = cost * (1 + sp.bregaPct / 100) * sp.ivaMultiplier;
    const prev = priceEdits[productId];
    if (field === 'gananciaPct') {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          gananciaPct: value,
          priceDetal: Math.round(base * (1 + value / 100) * 100) / 100,
        },
      });
    } else {
      setPriceEdits({
        ...priceEdits,
        [productId]: {
          ...prev,
          gananciaMayorPct: value,
          priceMayor: Math.round(base * (1 + value / 100) * 100) / 100,
        },
      });
    }
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/purchases')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <ShoppingCart className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nueva Factura de Compra</h1>
          <p className="text-slate-400 text-sm">Registra una factura de compra al proveedor</p>
        </div>
      </div>

      {/* ═══ Message ═══ */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ═══ Form Header ═══ */}
      <div className="card p-6 space-y-4">
        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* N Documento */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              N. Documento
            </label>
            <input
              type="text"
              value="Automatico"
              readOnly
              className="input-field !py-2 text-sm bg-slate-900/60 text-slate-500 cursor-not-allowed"
            />
          </div>

          {/* Proveedor searchable */}
          <div ref={supplierRef} className="relative">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Proveedor *
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={
                  supplierDropdownOpen
                    ? supplierSearch
                    : selectedSupplier
                    ? `${selectedSupplier.name}${selectedSupplier.rif ? ` (${selectedSupplier.rif})` : ''}`
                    : ''
                }
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  setSupplierDropdownOpen(true);
                }}
                onFocus={() => {
                  setSupplierDropdownOpen(true);
                  setSupplierSearch('');
                }}
                className="input-field !py-2 text-sm pl-9"
                placeholder="Buscar proveedor..."
              />
              {supplierId && !supplierDropdownOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setSupplierId('');
                    setSupplierSearch('');
                    setSupplierDropdownOpen(true);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {supplierDropdownOpen && (
              <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {filteredSuppliers.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-400">Sin resultados</div>
                ) : (
                  filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierDropdownOpen(false);
                        setSupplierSearch('');
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors ${
                        s.id === supplierId ? 'bg-green-500/10 text-green-400' : 'text-white'
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.rif && (
                        <span className="ml-2 text-slate-400 text-xs">{s.rif}</span>
                      )}
                      {s.isRetentionAgent && (
                        <span className="ml-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded font-bold">
                          Ag. Ret.
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Divisa */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Divisa
            </label>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  currency === 'USD'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => setCurrency('BS')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  currency === 'BS'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Bs
              </button>
            </div>
          </div>

          {/* Factor cambiario */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Factor cambiario
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={exchangeRate || ''}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              className="input-field !py-2 text-sm"
            />
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* N Serie proveedor */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              N. Serie proveedor
            </label>
            <input
              type="text"
              value={supplierSerialNumber}
              onChange={(e) => setSupplierSerialNumber(e.target.value)}
              className="input-field !py-2 text-sm"
              placeholder="Serie..."
            />
          </div>

          {/* Almacen */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Almacen *
            </label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="input-field !py-2 text-sm"
              required
            >
              <option value="">Seleccionar...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha factura */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Fecha factura *
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="input-field !py-2 text-sm"
              required
            />
          </div>

          {/* Fecha recepcion */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Fecha recepcion
            </label>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="input-field !py-2 text-sm"
            />
          </div>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* N Control fiscal */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              N. Control fiscal
            </label>
            <input
              type="text"
              value={supplierControlNumber}
              onChange={(e) => setSupplierControlNumber(e.target.value)}
              className="input-field !py-2 text-sm"
              placeholder="00-00000000"
            />
          </div>

          {/* N Factura proveedor */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              N. Factura proveedor
            </label>
            <input
              type="text"
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              className="input-field !py-2 text-sm"
              placeholder="Numero..."
            />
          </div>

          {/* Forma de pago */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Forma de pago
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCredit}
                  onChange={(e) => setIsCredit(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                Credito
              </label>
              {isCredit && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={creditDays || ''}
                    onChange={(e) => setCreditDays(Number(e.target.value))}
                    className="input-field !py-1.5 text-sm w-16 text-center"
                  />
                  <span className="text-xs text-slate-400">dias</span>
                </div>
              )}
            </div>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Responsable
            </label>
            <input
              type="text"
              value={user?.name || ''}
              readOnly
              className="input-field !py-2 text-sm bg-slate-900/60 text-slate-500 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* ═══ Items Table ═══ */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Articulos
          </h3>
          <button
            type="button"
            onClick={addEmptyRow}
            className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            <Plus size={16} /> Agregar linea
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left px-3 py-3 text-slate-400 font-medium w-20">Ref. Art.</th>
                <th className="text-left px-3 py-3 text-slate-400 font-medium min-w-[220px]">Articulo</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-24">Cantidad</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Precio USD</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-20">% Dto.</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe USD</th>
                <th className="text-center px-3 py-3 text-slate-400 font-medium w-16">% IVA</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe Bs</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const calc = calculations.itemCalcs[idx];
                return (
                  <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/20">
                    {/* Ref Art */}
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-green-400">
                        {item.code || '-'}
                      </span>
                    </td>

                    {/* Articulo (searchable) */}
                    <td className="px-3 py-2 relative">
                      {item.productId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm truncate">
                            {item.name}
                          </span>
                          {item.isService && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold">
                              SERVICIO
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            value={activeSearchRow === idx ? productSearch : ''}
                            onChange={(e) => handleProductSearch(e.target.value, idx)}
                            onFocus={() => setActiveSearchRow(idx)}
                            className="input-field !py-1.5 text-sm pl-7 !bg-slate-900/40"
                            placeholder="Buscar producto..."
                          />
                          {searchingProducts && activeSearchRow === idx && (
                            <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />
                          )}
                          {activeSearchRow === idx && productResults.length > 0 && (
                            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {productResults.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => selectProduct(p, idx)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 text-white flex justify-between items-center"
                                >
                                  <span>
                                    <span className="font-mono text-green-400 text-xs mr-1.5">
                                      {p.code}
                                    </span>
                                    {p.name}
                                    {p.isService && (
                                      <span className="ml-1.5 px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] rounded font-bold">
                                        SERV
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-slate-400 text-xs shrink-0 ml-2">
                                    Stock: {p.totalStock}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Cantidad */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity || ''}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="input-field !py-1.5 text-sm w-full text-right font-mono"
                        disabled={!item.productId}
                      />
                    </td>

                    {/* Precio USD */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costUsd || ''}
                        onChange={(e) => updateItem(idx, 'costUsd', Number(e.target.value))}
                        className="input-field !py-1.5 text-sm w-full text-right font-mono"
                        disabled={!item.productId}
                      />
                    </td>

                    {/* % Dto */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.discountPct || ''}
                        onChange={(e) => updateItem(idx, 'discountPct', Number(e.target.value))}
                        className="input-field !py-1.5 text-sm w-full text-right font-mono"
                        disabled={!item.productId}
                      />
                    </td>

                    {/* Importe USD */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-white text-sm">
                        ${fmt(calc?.importeUsd || 0)}
                      </span>
                    </td>

                    {/* % IVA */}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                          item.ivaType === 'EXEMPT'
                            ? 'text-slate-400 border-slate-600 bg-slate-800'
                            : item.ivaType === 'REDUCED'
                            ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                            : item.ivaType === 'SPECIAL'
                            ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                            : 'text-green-400 border-green-500/30 bg-green-500/10'
                        }`}
                      >
                        {IVA_LABELS[item.ivaType] || '16%'}
                      </span>
                    </td>

                    {/* Importe Bs */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-slate-400 text-sm">
                        {fmt(calc?.importeBs || 0)}
                      </span>
                    </td>

                    {/* Remove */}
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-500">
                    <p className="mb-2">No hay articulos</p>
                    <button
                      type="button"
                      onClick={addEmptyRow}
                      className="text-green-400 hover:text-green-300 text-sm flex items-center gap-1 mx-auto"
                    >
                      <Plus size={14} /> Agregar primer articulo
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Fiscal Totals Footer ═══ */}
      {items.some((i) => i.productId) && (
        <div className="card p-6 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Totales Fiscales
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Subtotal */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Subtotal $</p>
              <p className="text-white font-mono text-lg">
                ${fmt(calculations.subtotalUsd)}
              </p>
            </div>

            {/* Recargo */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Recargo $</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={surchargeUsd || ''}
                  onChange={(e) => setSurchargeUsd(Number(e.target.value))}
                  className="input-field !py-1 text-sm w-24 font-mono"
                  placeholder="0.00"
                />
                <select
                  value={surchargeDistribution}
                  onChange={(e) => setSurchargeDistribution(e.target.value as 'PROPORTIONAL' | 'EQUAL')}
                  className="input-field !py-1 text-xs w-auto"
                >
                  <option value="PROPORTIONAL">Proporcional</option>
                  <option value="EQUAL">Equitativo</option>
                </select>
              </div>
            </div>

            {/* Dto Global */}
            <div>
              <p className="text-xs text-slate-500 mb-1">% Dto. global</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountGlobalPct || ''}
                  onChange={(e) => setDiscountGlobalPct(Number(e.target.value))}
                  className="input-field !py-1 text-sm w-20 font-mono"
                  placeholder="0"
                />
                {calculations.globalDiscountUsd > 0 && (
                  <span className="text-red-400 text-xs font-mono">
                    -${fmt(calculations.globalDiscountUsd)}
                  </span>
                )}
              </div>
            </div>

            {/* Sub-Total c/Dto */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Sub-Total c/Dto $</p>
              <p className="text-white font-mono text-lg">
                ${fmt(calculations.subtotalAfterDiscount)}
              </p>
            </div>

            {/* Monto Exento */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Monto Exento $</p>
              <p className="text-slate-300 font-mono">
                ${fmt(calculations.exemptUsd)}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Base IVA */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Base IVA $</p>
              <p className="text-white font-mono">
                ${fmt(calculations.taxableBaseUsd)}
              </p>
            </div>

            {/* Total IVA */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total IVA $</p>
              <p className="text-amber-400 font-mono">
                ${fmt(calculations.totalIvaUsd)}
              </p>
            </div>

            {/* Total USD */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total $</p>
              <p className="text-green-400 font-mono text-xl font-bold">
                ${fmt(calculations.totalUsd)}
              </p>
            </div>

            {/* Total Bs */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total Bs</p>
              <p className="text-blue-400 font-mono text-lg">
                Bs {fmt(calculations.totalBs)}
              </p>
            </div>

            {/* Spacer for alignment */}
            <div></div>
          </div>

          {/* IVA Retention (if supplier is retention agent) */}
          {calculations.isRetentionAgent && (
            <div className="border-t border-purple-500/20 pt-4">
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                  Retencion IVA (Agente de Retencion)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Retencion IVA (75%)</p>
                    <p className="text-purple-400 font-mono font-bold">
                      -${fmt(calculations.retentionIvaUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">N. Comprobante retencion</p>
                    <input
                      type="text"
                      value={retentionVoucherNumber}
                      onChange={(e) => setRetentionVoucherNumber(e.target.value)}
                      className="input-field !py-1 text-sm font-mono"
                      placeholder="N. comprobante..."
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Neto a pagar $</p>
                    <p className="text-green-400 font-mono text-lg font-bold">
                      ${fmt(calculations.netPayable)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Neto a pagar Bs</p>
                    <p className="text-blue-400 font-mono">
                      Bs {fmt(calculations.netPayable * exchangeRate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="border-t border-slate-700/50 pt-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Observaciones
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field !py-2 text-sm"
              placeholder="Notas opcionales..."
            />
          </div>
        </div>
      )}

      {/* ═══ Action Buttons ═══ */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/purchases')}
          className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2.5"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar
        </button>
        <button
          type="button"
          onClick={handleProcess}
          disabled={saving}
          className="btn-primary !py-2.5 text-sm flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <CheckCircle size={16} />
          )}
          Procesar factura
        </button>
      </div>

      {/* ═══ Price Update Modal ═══ */}
      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setPriceModal(false);
              if (createdId) router.push(`/purchases/${createdId}`);
            }}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Actualizar precios de venta
                </h2>
                <p className="text-sm text-slate-400">
                  Revisa y ajusta los precios antes de procesar
                </p>
              </div>
              <button
                onClick={() => {
                  setPriceModal(false);
                  if (createdId) router.push(`/purchases/${createdId}`);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {suggestedPrices.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No hay productos para actualizar precios
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">
                          Codigo
                        </th>
                        <th className="text-left px-2 py-2 text-slate-400 font-medium text-xs">
                          Producto
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          Costo ant.
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          Costo nuevo
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          Gan.% Detal
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          P. Venta Detal
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          Gan.% Mayor
                        </th>
                        <th className="text-right px-2 py-2 text-slate-400 font-medium text-xs">
                          P. Venta Mayor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestedPrices.map((sp) => {
                        const edits = priceEdits[sp.productId] || {
                          gananciaPct: sp.currentGananciaPct,
                          gananciaMayorPct: sp.currentGananciaMayorPct,
                          priceDetal: sp.suggestedPriceDetal,
                          priceMayor: sp.suggestedPriceMayor,
                        };
                        const costUp = sp.newCostUsd > sp.currentCostUsd;
                        const costDown = sp.newCostUsd < sp.currentCostUsd;
                        return (
                          <tr key={sp.productId} className="border-b border-slate-700/30">
                            <td className="px-2 py-2 font-mono text-green-400 text-xs">
                              {sp.productCode}
                            </td>
                            <td className="px-2 py-2 text-white text-xs">
                              {sp.productName}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-400 text-xs">
                              ${sp.currentCostUsd.toFixed(2)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right font-mono text-xs font-bold ${
                                costUp
                                  ? 'text-red-400'
                                  : costDown
                                  ? 'text-green-400'
                                  : 'text-white'
                              }`}
                            >
                              ${sp.newCostUsd.toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={edits.gananciaPct}
                                onChange={(e) =>
                                  handleGananciaChange(
                                    sp.productId,
                                    'gananciaPct',
                                    Number(e.target.value),
                                  )
                                }
                                className="input-field !py-0.5 text-xs w-16 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-white text-xs">
                              ${edits.priceDetal.toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={edits.gananciaMayorPct}
                                onChange={(e) =>
                                  handleGananciaChange(
                                    sp.productId,
                                    'gananciaMayorPct',
                                    Number(e.target.value),
                                  )
                                }
                                className="input-field !py-0.5 text-xs w-16 text-right font-mono"
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-white text-xs">
                              ${edits.priceMayor.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => {
                    setPriceModal(false);
                    if (createdId) router.push(`/purchases/${createdId}`);
                  }}
                  className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessWithoutPriceChanges}
                  disabled={processingPrices}
                  className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
                >
                  {processingPrices && <Loader2 className="animate-spin" size={16} />}
                  Procesar sin cambiar precios
                </button>
                <button
                  type="button"
                  onClick={handleProcessWithPrices}
                  disabled={processingPrices}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2"
                >
                  {processingPrices ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Procesar con estos precios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
