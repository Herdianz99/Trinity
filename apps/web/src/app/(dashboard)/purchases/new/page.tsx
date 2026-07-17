'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNavGuard } from '@/components/nav-guard';
import {
  ArrowLeft,
  ShoppingCart,
  Loader2,
  Save,
  Search,
  X,
  Plus,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import SupplierFormModal from '@/components/supplier-form-modal';
import ProductFormModal from '@/components/product-form-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  rif: string | null;
  isRetentionAgent: boolean;
  creditDays?: number;
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
  supplierRef?: string;
  costUsd: number;
  ivaType: string;
  isService?: boolean;
}

interface FormItem {
  productId: string;
  code: string;
  name: string;
  supplierRef?: string;
  quantity: number;
  costUsd: number;
  discountPct: number;
  ivaType: string;
  isService: boolean;
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
  const { setBlocker, requestNavigate } = useNavGuard();

  // ---- Bootstrap data ----
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [series, setSeries] = useState<{ id: string; name: string; prefix: string; isFiscal: boolean; isVatExempt: boolean }[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- Form header state ----
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  // Indice resaltado para navegar el dropdown de proveedores con el teclado (flechas + Enter)
  const [supplierHighlight, setSupplierHighlight] = useState(0);
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [supplierSerialNumber, setSupplierSerialNumber] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [supplierControlNumber, setSupplierControlNumber] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [dupInvoice, setDupInvoice] = useState<{ number: string } | null>(null);
  const [isFiscal, setIsFiscal] = useState(true);
  const [serieId, setSerieId] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [creditDays, setCreditDays] = useState<number>(30);

  // ---- Items ----
  const [items, setItems] = useState<FormItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [activeSearchRow, setActiveSearchRow] = useState<number | null>(null);
  // Indice resaltado para navegar los resultados de productos con el teclado (flechas + Enter)
  const [productHighlight, setProductHighlight] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs a los inputs de busqueda de cada fila, para enfocar la nueva linea (Ctrl+Enter)
  const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [pendingFocusRow, setPendingFocusRow] = useState<number | null>(null);

  // ---- Modales crear/editar proveedor y producto ----
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalMode, setSupplierModalMode] = useState<'create' | 'edit'>('create');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'create' | 'edit'>('create');
  const [productModalId, setProductModalId] = useState<string | null>(null);
  const [productModalRow, setProductModalRow] = useState<number | null>(null);

  // ---- Fiscal totals ----
  const [surchargeUsd, setSurchargeUsd] = useState<number>(0);
  const [surchargeDistribution, setSurchargeDistribution] = useState<'PROPORTIONAL' | 'EQUAL'>('PROPORTIONAL');
  const [surchargeTouched, setSurchargeTouched] = useState(false);
  const [discountGlobalPct, setDiscountGlobalPct] = useState<number>(0);
  const [retentionVoucherNumber, setRetentionVoucherNumber] = useState('');
  const [notes, setNotes] = useState('');

  // ---- Save state ----
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const [supRes, whRes, rateRes, profileRes, seriesRes] = await Promise.all([
        fetch('/api/proxy/suppliers?isActive=true'),
        fetch('/api/proxy/warehouses?isActive=true'),
        fetch('/api/proxy/exchange-rate/today'),
        fetch('/api/auth/me'),
        fetch('/api/proxy/series?type=PURCHASES'),
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

      if (seriesRes.ok) {
        const data = await seriesRes.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setSeries(list.filter((s: any) => s.isActive));
        const fiscal = list.find((s: any) => s.isFiscal && s.isActive);
        if (fiscal) {
          setSerieId(fiscal.id);
          setIsFiscal(true);
        }
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

  // Autorellenar forma de pago segun los dias de credito del proveedor.
  // Si el proveedor tiene dias de credito > 0: marca "Credito" y precarga los dias.
  // Keyed solo por supplierId para no re-forzar el credito si el usuario lo cambia a mano.
  useEffect(() => {
    if (!selectedSupplier) return;
    const cd = selectedSupplier.creditDays ?? 0;
    if (cd > 0) {
      setIsCredit(true);
      setCreditDays(cd);
    } else {
      setIsCredit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // Aviso TEMPRANO de factura duplicada: dispara al elegir proveedor o escribir el N. de
  // factura (con debounce), para no hacer cargar toda la factura y descubrir el duplicado al guardar.
  useEffect(() => {
    const inv = supplierInvoiceNumber.trim();
    if (!supplierId || !inv) { setDupInvoice(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/purchases/check-duplicate?supplierId=${encodeURIComponent(supplierId)}&invoiceNumber=${encodeURIComponent(inv)}`);
        if (res.ok) {
          const d = await res.json();
          setDupInvoice(d?.duplicate ? { number: d.number } : null);
        }
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [supplierId, supplierInvoiceNumber]);

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
    setProductHighlight(0);
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
          setProductHighlight(0);
        }
      } catch { /* ignore */ } finally {
        setSearchingProducts(false);
      }
    }, 300);
  }

  async function selectProduct(p: ProductSearchResult, rowIdx: number) {
    // Fetch full product detail for costUsd, ivaType y ref. proveedor
    let costUsd = 0;
    let ivaType = 'GENERAL';
    let supplierRef = '';
    try {
      const res = await fetch(`/api/proxy/products/${p.id}`);
      if (res.ok) {
        const detail: ProductDetail = await res.json();
        costUsd = detail.costUsd || 0;
        ivaType = detail.ivaType || 'GENERAL';
        supplierRef = detail.supplierRef || '';
      }
    } catch { /* use defaults */ }

    // Si la moneda es BS, convertir el costo a Bs usando la tasa
    const costValue = currency === 'BS' ? Math.round(costUsd * exchangeRate * 100) / 100 : costUsd;

    const newItems = [...items];
    newItems[rowIdx] = {
      productId: p.id,
      code: p.code,
      name: p.name,
      supplierRef,
      quantity: newItems[rowIdx]?.quantity || 1,
      costUsd: costValue,
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
    const newIdx = items.length;
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
    // Enfocar la busqueda de la nueva fila para seguir cargando sin usar el mouse
    setActiveSearchRow(newIdx);
    setPendingFocusRow(newIdx);
  }

  // Enfoca el input de busqueda de la fila recien agregada (una vez renderizada)
  useEffect(() => {
    if (pendingFocusRow == null) return;
    searchInputRefs.current[pendingFocusRow]?.focus();
    setPendingFocusRow(null);
  }, [pendingFocusRow, items]);

  // Tecla rapida: F9 agrega una nueva linea desde cualquier campo
  function handleGridKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'F9') {
      e.preventDefault();
      addEmptyRow();
    }
  }

  function removeRow(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  // ---- Modales crear/editar proveedor y producto ----
  function openNewSupplier() { setSupplierModalMode('create'); setSupplierModalOpen(true); }
  function openEditSupplier() { if (supplierId) { setSupplierModalMode('edit'); setSupplierModalOpen(true); } }
  function openNewProduct() { setProductModalMode('create'); setProductModalId(null); setProductModalRow(null); setProductModalOpen(true); }
  function openEditProduct(rowIdx: number, prodId: string) { setProductModalMode('edit'); setProductModalId(prodId); setProductModalRow(rowIdx); setProductModalOpen(true); }

  async function handleSupplierSaved(saved: any) {
    try {
      const res = await fetch('/api/proxy/suppliers?isActive=true');
      if (res.ok) { const data = await res.json(); setSuppliers(Array.isArray(data) ? data : data.data || []); }
    } catch { /* ignore */ }
    if (saved?.id) { setSupplierId(saved.id); setSupplierSearch(''); setSupplierDropdownOpen(false); }
    setSupplierModalOpen(false);
  }

  async function handleProductSaved(saved: any) {
    setProductModalOpen(false);
    if (!saved?.id) { setProductModalId(null); setProductModalRow(null); return; }
    // Leer el detalle autoritativo del producto (codigo/nombre/costo/IVA)
    let prod: any = saved;
    try {
      const res = await fetch(`/api/proxy/products/${saved.id}`);
      if (res.ok) prod = await res.json();
    } catch { /* usa lo que devolvio el guardado */ }
    const costUsd = prod.costUsd || 0;
    const costValue = currency === 'BS' ? Math.round(costUsd * exchangeRate * 100) / 100 : costUsd;
    const filled: FormItem = {
      productId: prod.id, code: prod.code || '', name: prod.name || '',
      quantity: 1, costUsd: costValue, discountPct: 0,
      ivaType: prod.ivaType || 'GENERAL', isService: prod.isService || false,
    };
    if (productModalMode === 'create') {
      setItems(prev => [...prev, filled]);
    } else if (productModalRow != null) {
      const rowIdx = productModalRow;
      setItems(prev => {
        const next = [...prev];
        const q = next[rowIdx]?.quantity || 1;
        const d = next[rowIdx]?.discountPct || 0;
        next[rowIdx] = { ...filled, quantity: q, discountPct: d };
        return next;
      });
    }
    setProductModalId(null);
    setProductModalRow(null);
  }

  function updateItem(idx: number, field: keyof FormItem, value: any) {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  }

  // Auto-rellenar "Recargo $" con la suma de las líneas de servicio (Escenario A),
  // a menos que el usuario lo haya editado a mano (Escenario B / flete externo).
  useEffect(() => {
    if (surchargeTouched) return;
    const serviceTotal = items
      .filter((i) => i.isService && i.productId)
      .reduce((sum, i) => sum + i.costUsd * i.quantity * (1 - (i.discountPct || 0) / 100), 0);
    setSurchargeUsd(Math.round(serviceTotal * 100) / 100);
  }, [items, surchargeTouched]);

  // ---- Real-time calculations ----
  const serieIsVatExempt = series.find(s => s.id === serieId)?.isVatExempt === true;

  const calculations = useMemo(() => {
    const isBs = currency === 'BS';

    // Per-item calculations
    const itemCalcs = items.map((item) => {
      const lineBruto = item.costUsd * item.quantity;
      const lineDiscount = lineBruto * (item.discountPct / 100);
      const importePrimario = lineBruto - lineDiscount; // in the selected currency
      const effectiveIvaType = serieIsVatExempt ? 'EXEMPT' : item.ivaType;
      const ivaRate = IVA_RATES[effectiveIvaType] || 0;
      // importeUsd / importeBs depending on currency
      const importeUsd = isBs ? importePrimario / exchangeRate : importePrimario;
      const importeBs = isBs ? importePrimario : importePrimario * exchangeRate;
      return { ...item, lineBruto, lineDiscount, importeUsd, importeBs, importePrimario, ivaRate, effectiveIvaType };
    });

    const subtotalPrimario = itemCalcs.reduce((sum, i) => sum + i.importePrimario, 0);
    const subtotalUsd = isBs ? subtotalPrimario / exchangeRate : subtotalPrimario;
    const subtotalBs = isBs ? subtotalPrimario : subtotalPrimario * exchangeRate;

    // Global discount
    const globalDiscountPrimario = subtotalPrimario * (discountGlobalPct / 100);
    const globalDiscountUsd = isBs ? globalDiscountPrimario / exchangeRate : globalDiscountPrimario;
    const subtotalAfterDiscount = subtotalPrimario - globalDiscountPrimario;

    // Prorate global discount per item for exempt/taxable split
    const exemptPrimario = itemCalcs.reduce((sum, i) => {
      if (i.effectiveIvaType !== 'EXEMPT') return sum;
      const proportion = subtotalPrimario > 0 ? i.importePrimario / subtotalPrimario : 0;
      return sum + i.importePrimario - globalDiscountPrimario * proportion;
    }, 0);

    const exemptUsd = isBs ? exemptPrimario / exchangeRate : exemptPrimario;
    const exemptBs = isBs ? exemptPrimario : exemptPrimario * exchangeRate;
    const taxableBasePrimario = subtotalAfterDiscount - exemptPrimario;
    const taxableBaseUsd = isBs ? taxableBasePrimario / exchangeRate : taxableBasePrimario;
    const taxableBaseBs = isBs ? taxableBasePrimario : taxableBasePrimario * exchangeRate;

    // IVA per item (with global discount prorated)
    const totalIvaPrimario = itemCalcs.reduce((sum, i) => {
      if (i.effectiveIvaType === 'EXEMPT') return sum;
      const proportion = subtotalPrimario > 0 ? i.importePrimario / subtotalPrimario : 0;
      const itemAfterGlobalDiscount = i.importePrimario - globalDiscountPrimario * proportion;
      return sum + itemAfterGlobalDiscount * i.ivaRate;
    }, 0);

    const totalIvaUsd = isBs ? totalIvaPrimario / exchangeRate : totalIvaPrimario;
    const totalIvaBs = isBs ? totalIvaPrimario : totalIvaPrimario * exchangeRate;

    // El recargo NO afecta el total de la factura (solo el costo aterrizado)
    const totalPrimario = subtotalAfterDiscount + totalIvaPrimario;
    const totalUsd = isBs ? totalPrimario / exchangeRate : totalPrimario;
    const totalBs = isBs ? totalPrimario : totalPrimario * exchangeRate;

    // IVA retention if supplier is retention agent
    const isRetentionAgent = selectedSupplier?.isRetentionAgent || false;
    const retentionIvaUsd = isRetentionAgent ? totalIvaUsd * 0.75 : 0;
    const retentionIvaBs = isRetentionAgent ? totalIvaBs * 0.75 : 0;
    const netPayableUsd = isRetentionAgent ? totalUsd - retentionIvaUsd : totalUsd;
    const netPayableBs = isRetentionAgent ? totalBs - retentionIvaBs : totalBs;

    return {
      itemCalcs,
      subtotalUsd,
      subtotalBs,
      globalDiscountUsd,
      globalDiscountBs: isBs ? globalDiscountPrimario : globalDiscountPrimario * exchangeRate,
      subtotalAfterDiscount,
      subtotalAfterDiscountUsd: isBs ? subtotalAfterDiscount / exchangeRate : subtotalAfterDiscount,
      subtotalAfterDiscountBs: isBs ? subtotalAfterDiscount : subtotalAfterDiscount * exchangeRate,
      exemptUsd,
      exemptBs,
      taxableBaseUsd,
      taxableBaseBs,
      totalIvaUsd,
      totalIvaBs,
      totalUsd,
      totalBs,
      isRetentionAgent,
      retentionIvaUsd,
      retentionIvaBs,
      netPayableUsd,
      netPayableBs,
    };
  }, [items, discountGlobalPct, surchargeUsd, exchangeRate, selectedSupplier, currency, serieIsVatExempt]);

  // ---- Validation ----
  function validate(): string | null {
    if (!supplierId) return 'Selecciona un proveedor';
    if (!warehouseId) return 'Selecciona un almacen';
    if (!invoiceDate) return 'Ingresa la fecha de factura';
    if (!supplierInvoiceNumber.trim()) return 'Ingresa el N. Factura proveedor';
    if (isFiscal) {
      if (!supplierSerialNumber.trim()) return 'Ingresa el N. Serie proveedor (requerido para compras fiscales)';
      if (!supplierControlNumber.trim()) return 'Ingresa el N. Control fiscal (requerido para compras fiscales)';
    }
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
      isFiscal,
      serieId: serieId || undefined,
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
      setBlocker(null); // ya se guardó: no interceptar la navegación al detalle
      router.push(`/purchases/${created.id}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  // ---- Guard de "salir sin guardar" ----
  // Guarda la factura como PENDING y devuelve si tuvo éxito (sin redirigir), para que
  // el guard de navegación lleve al usuario a donde iba tras guardar.
  async function saveDraftSilent(): Promise<boolean> {
    const err = validate();
    if (err) { setMessage({ type: 'error', text: err }); return false; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Error al guardar');
      }
      return true;
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Hay factura "cargada" si el usuario eligió proveedor, agregó artículos o escribió el N° de factura.
  const isDirty = !!supplierId || items.some((i) => i.productId) || !!supplierInvoiceNumber.trim() || !!supplierControlNumber.trim();
  const saveDraftRef = useRef(saveDraftSilent);
  saveDraftRef.current = saveDraftSilent;
  useEffect(() => {
    setBlocker(isDirty ? { onSave: () => saveDraftRef.current(), what: 'la factura de compra' } : null);
    return () => setBlocker(null);
  }, [isDirty, setBlocker]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6" onKeyDown={handleGridKeyDown}>
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => requestNavigate('/purchases')}
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
      <div className="card p-6 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:1fr_2fr_1fr_1fr] gap-4">
          {/* Col 1: Numeros del proveedor (stacked) */}
          <div className="space-y-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                N. Serie proveedor{isFiscal ? ' *' : ''}
              </label>
              <input
                type="text"
                value={supplierSerialNumber}
                onChange={(e) => setSupplierSerialNumber(e.target.value)}
                className="input-field !py-1 text-sm"
                placeholder="Serie..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                N. Control fiscal{isFiscal ? ' *' : ''}
              </label>
              <input
                type="text"
                value={supplierControlNumber}
                onChange={(e) => setSupplierControlNumber(e.target.value)}
                className="input-field !py-1 text-sm"
                placeholder="00-00000000"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                N. Factura proveedor *
              </label>
              <input
                type="text"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                className={`input-field !py-1 text-sm ${dupInvoice ? '!border-amber-500/70' : ''}`}
                placeholder="Numero..."
              />
              {dupInvoice && (
                <p className="mt-0.5 text-[10px] text-amber-400 flex items-start gap-1">
                  <AlertTriangle size={11} className="flex-shrink-0 mt-px" />
                  <span>Ya cargaste esta factura para este proveedor (cargada como {dupInvoice.number}). Verifica antes de continuar.</span>
                </p>
              )}
            </div>
          </div>

          {/* Col 2: Proveedor + Almacen + Responsable (stacked) */}
          <div className="space-y-1.5">
            <div ref={supplierRef} className="relative">
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-medium text-slate-400">Proveedor *</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={openNewSupplier} className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5" title="Nuevo proveedor">
                    <Plus size={11} /> Nuevo
                  </button>
                  {supplierId && (
                    <button type="button" onClick={openEditSupplier} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5" title="Editar proveedor seleccionado">
                      <Pencil size={11} /> Editar
                    </button>
                  )}
                </div>
              </div>
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
                    setSupplierHighlight(0);
                  }}
                  onFocus={() => {
                    setSupplierDropdownOpen(true);
                    setSupplierSearch('');
                    setSupplierHighlight(0);
                  }}
                  onKeyDown={(e) => {
                    if (!supplierDropdownOpen) {
                      if (e.key === 'ArrowDown') {
                        setSupplierDropdownOpen(true);
                        setSupplierSearch('');
                        setSupplierHighlight(0);
                      }
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSupplierHighlight((i) => Math.min(i + 1, filteredSuppliers.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSupplierHighlight((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const s = filteredSuppliers[supplierHighlight];
                      if (s) {
                        setSupplierId(s.id);
                        setSupplierDropdownOpen(false);
                        setSupplierSearch('');
                      }
                    } else if (e.key === 'Escape') {
                      setSupplierDropdownOpen(false);
                    }
                  }}
                  className="input-field !py-1 text-sm pl-9"
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
                    filteredSuppliers.map((s, index) => (
                      <button
                        key={s.id}
                        type="button"
                        ref={index === supplierHighlight ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                        onMouseEnter={() => setSupplierHighlight(index)}
                        onClick={() => {
                          setSupplierId(s.id);
                          setSupplierDropdownOpen(false);
                          setSupplierSearch('');
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          index === supplierHighlight ? 'bg-slate-600' : ''
                        } ${
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
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Almacen *
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="input-field !py-1 text-sm"
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
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Responsable
              </label>
              <input
                type="text"
                value={user?.name || ''}
                readOnly
                className="input-field !py-1 text-sm bg-slate-900/60 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Col 3: Divisa + Fecha factura + Forma de pago (stacked) */}
          <div className="space-y-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Divisa
              </label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${
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
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${
                    currency === 'BS'
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Bs
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Fecha factura *
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setInvoiceDate(newDate);
                  if (newDate) {
                    fetch(`/api/proxy/exchange-rate/by-date?date=${newDate}`)
                      .then((r) => r.ok ? r.json() : null)
                      .then((data) => { if (data?.rate) setExchangeRate(data.rate); })
                      .catch(() => {});
                  }
                }}
                className="input-field !py-1 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Serie
              </label>
              <select
                value={serieId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSerieId(id);
                  const s = series.find((x) => x.id === id);
                  setIsFiscal(s?.isFiscal ?? false);
                }}
                className="input-field !py-1 text-sm"
              >
                <option value="">Sin serie</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isFiscal ? '(Fiscal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Col 4: Factor cambiario + Fecha recepcion + Forma de pago (stacked) */}
          <div className="space-y-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Factor cambiario
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={exchangeRate || ''}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                className="input-field !py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Fecha recepcion
              </label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="input-field !py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">
                Forma de pago
              </label>
              <div className="flex items-center gap-2 h-[30px]">
                <button
                  type="button"
                  onClick={() => setIsCredit(!isCredit)}
                  className="flex items-center gap-2 select-none"
                >
                  <div className={`relative w-9 h-5 rounded-full transition-colors ${isCredit ? 'bg-green-600' : 'bg-slate-600'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform absolute top-0.5 ${isCredit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-slate-300">Credito</span>
                </button>
                {isCredit && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      value={creditDays || ''}
                      onChange={(e) => setCreditDays(Number(e.target.value))}
                      className="input-field !py-0.5 text-sm w-14 text-center"
                    />
                    <span className="text-[10px] text-slate-400">dias</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Items Table ═══ */}
      <div className="card relative z-10">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Articulos
          </h3>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={openNewProduct}
              className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Crear un articulo nuevo y agregarlo a la compra"
            >
              <Plus size={16} /> Nuevo articulo
            </button>
            <button
              type="button"
              onClick={addEmptyRow}
              className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 transition-colors"
              title="Agregar una linea nueva (Ctrl+Enter)"
            >
              <Plus size={16} /> Agregar linea
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-slate-700/70 border border-slate-600 text-[10px] text-slate-300 font-mono">F9</kbd>
            </button>
          </div>
        </div>

        <div className="overflow-visible min-w-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left px-3 py-3 text-slate-400 font-medium w-20">Ref. Art.</th>
                <th className="text-left px-3 py-3 text-slate-400 font-medium w-24">Ref. Prov.</th>
                <th className="text-left px-3 py-3 text-slate-400 font-medium min-w-[220px]">Articulo</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-24">Cantidad</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Precio {currency === 'BS' ? 'Bs' : 'USD'}</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-20">% Dto.</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-24">Precio c/Dto</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe {currency === 'BS' ? 'Bs' : 'USD'}</th>
                <th className="text-center px-3 py-3 text-slate-400 font-medium w-16">% IVA</th>
                <th className="text-right px-3 py-3 text-slate-400 font-medium w-28">Importe {currency === 'BS' ? 'USD' : 'Bs'}</th>
                <th className="w-16"></th>
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

                    {/* Ref Proveedor */}
                    <td className="px-3 py-2">
                      <span className="text-xs text-slate-400">{item.supplierRef || '-'}</span>
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
                            ref={(el) => { searchInputRefs.current[idx] = el; }}
                            value={activeSearchRow === idx ? productSearch : ''}
                            onChange={(e) => handleProductSearch(e.target.value, idx)}
                            onFocus={() => setActiveSearchRow(idx)}
                            onKeyDown={(e) => {
                              if (activeSearchRow !== idx || productResults.length === 0) return;
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setProductHighlight((i) => Math.min(i + 1, productResults.length - 1));
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setProductHighlight((i) => Math.max(i - 1, 0));
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const p = productResults[productHighlight];
                                if (p) selectProduct(p, idx);
                              } else if (e.key === 'Escape') {
                                setProductResults([]);
                              }
                            }}
                            className="input-field !py-1.5 text-sm pl-7 !bg-slate-900/40"
                            placeholder="Buscar producto..."
                          />
                          {searchingProducts && activeSearchRow === idx && (
                            <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />
                          )}
                          {activeSearchRow === idx && productResults.length > 0 && (
                            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {productResults.map((p, pIdx) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  ref={pIdx === productHighlight ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                                  onMouseEnter={() => setProductHighlight(pIdx)}
                                  onClick={() => selectProduct(p, idx)}
                                  className={`w-full text-left px-3 py-2 text-sm text-white flex justify-between items-center transition-colors ${
                                    pIdx === productHighlight ? 'bg-slate-600' : ''
                                  }`}
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
                        step="any"
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

                    {/* Precio con descuento (Precio - % Dto) */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-slate-300 text-sm">
                        {currency === 'BS' ? '' : '$'}{fmt((item.costUsd || 0) * (1 - (item.discountPct || 0) / 100))}
                      </span>
                    </td>

                    {/* Importe primario (en la moneda seleccionada) */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-white text-sm">
                        {currency === 'BS' ? '' : '$'}{fmt(calc?.importePrimario || 0)}
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

                    {/* Importe secundario (en la otra moneda) */}
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-slate-400 text-sm">
                        {currency === 'BS' ? `$${fmt(calc?.importeUsd || 0)}` : fmt(calc?.importeBs || 0)}
                      </span>
                    </td>

                    {/* Editar producto + Remove */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        {item.productId && (
                          <button
                            type="button"
                            onClick={() => openEditProduct(idx, item.productId)}
                            className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                            title="Editar este articulo"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Quitar linea"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-slate-500">
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
              <p className="text-xs text-slate-500 mb-1">Subtotal {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-white font-mono text-lg">
                {currency === 'BS' ? fmt(calculations.subtotalBs) : `$${fmt(calculations.subtotalUsd)}`}
              </p>
            </div>

            {/* Recargo */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Recargo {currency === 'BS' ? 'Bs' : '$'}</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={surchargeUsd || ''}
                  onChange={(e) => { setSurchargeTouched(true); setSurchargeUsd(Number(e.target.value)); }}
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
                {(currency === 'BS' ? calculations.globalDiscountBs : calculations.globalDiscountUsd) > 0 && (
                  <span className="text-red-400 text-xs font-mono">
                    -{currency === 'BS' ? '' : '$'}{fmt(currency === 'BS' ? calculations.globalDiscountBs : calculations.globalDiscountUsd)}
                  </span>
                )}
              </div>
            </div>

            {/* Sub-Total c/Dto */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Sub-Total c/Dto {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-white font-mono text-lg">
                {currency === 'BS' ? fmt(calculations.subtotalAfterDiscountBs) : `$${fmt(calculations.subtotalAfterDiscountUsd)}`}
              </p>
            </div>

            {/* Monto Exento */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Monto Exento {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-slate-300 font-mono">
                {currency === 'BS' ? fmt(calculations.exemptBs) : `$${fmt(calculations.exemptUsd)}`}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Base IVA */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Base IVA {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-white font-mono">
                {currency === 'BS' ? fmt(calculations.taxableBaseBs) : `$${fmt(calculations.taxableBaseUsd)}`}
              </p>
            </div>

            {/* Total IVA */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total IVA {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-amber-400 font-mono">
                {currency === 'BS' ? fmt(calculations.totalIvaBs) : `$${fmt(calculations.totalIvaUsd)}`}
              </p>
            </div>

            {/* Total primario */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total {currency === 'BS' ? 'Bs' : '$'}</p>
              <p className="text-green-400 font-mono text-xl font-bold">
                {currency === 'BS' ? `Bs ${fmt(calculations.totalBs)}` : `$${fmt(calculations.totalUsd)}`}
              </p>
            </div>

            {/* Total secundario */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Total {currency === 'BS' ? '$' : 'Bs'}</p>
              <p className="text-blue-400 font-mono text-lg">
                {currency === 'BS' ? `$${fmt(calculations.totalUsd)}` : `Bs ${fmt(calculations.totalBs)}`}
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
                      {currency === 'BS' ? `-Bs ${fmt(calculations.retentionIvaBs)}` : `-$${fmt(calculations.retentionIvaUsd)}`}
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
                    <p className="text-xs text-slate-500 mb-1">Neto a pagar {currency === 'BS' ? 'Bs' : '$'}</p>
                    <p className="text-green-400 font-mono text-lg font-bold">
                      {currency === 'BS' ? `Bs ${fmt(calculations.netPayableBs)}` : `$${fmt(calculations.netPayableUsd)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Neto a pagar {currency === 'BS' ? '$' : 'Bs'}</p>
                    <p className="text-blue-400 font-mono">
                      {currency === 'BS' ? `$${fmt(calculations.netPayableUsd)}` : `Bs ${fmt(calculations.netPayableBs)}`}
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
          onClick={() => requestNavigate('/purchases')}
          className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2.5"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="btn-primary !py-2.5 text-sm flex items-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Guardar
        </button>
      </div>

      {/* Modales crear/editar proveedor y producto */}
      <SupplierFormModal
        open={supplierModalOpen}
        mode={supplierModalMode}
        supplierId={supplierModalMode === 'edit' ? supplierId : null}
        onClose={() => setSupplierModalOpen(false)}
        onSaved={handleSupplierSaved}
      />
      <ProductFormModal
        open={productModalOpen}
        mode={productModalMode}
        productId={productModalId}
        defaultSupplierId={supplierId || null}
        onClose={() => { setProductModalOpen(false); setProductModalId(null); setProductModalRow(null); }}
        onSaved={handleProductSaved}
      />

    </div>
  );
}
