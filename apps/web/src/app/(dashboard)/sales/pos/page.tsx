'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Monitor,
  Search,
  Camera,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  X,
  Loader2,
  User,
  ShoppingCart,
  CreditCard,
  Lock,
} from 'lucide-react';

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

const PAYMENT_METHODS = [
  { key: 'CASH_USD', label: 'Efectivo USD', currency: 'USD' },
  { key: 'CASH_BS', label: 'Efectivo Bs', currency: 'BS' },
  { key: 'PUNTO_DE_VENTA', label: 'Punto de Venta', currency: 'BS' },
  { key: 'PAGO_MOVIL', label: 'Pago Movil', currency: 'BS' },
  { key: 'ZELLE', label: 'Zelle', currency: 'USD' },
  { key: 'TRANSFERENCIA', label: 'Transferencia', currency: 'BS' },
  { key: 'CASHEA', label: 'Cashea', currency: 'USD' },
  { key: 'CREDIAGRO', label: 'Crediagro', currency: 'USD' },
];

interface CartItem {
  productId: string;
  code: string;
  name: string;
  unitPrice: number;
  quantity: number;
  ivaType: string;
  stock: number;
}

interface PaymentLine {
  method: string;
  amountUsd: number;
  amountBs: number;
  reference: string;
}

export default function POSPage() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoiceId');

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [isCredit, setIsCredit] = useState(false);
  const [creditAuthPassword, setCreditAuthPassword] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [userRole, setUserRole] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const searchTimeout = useRef<any>(null);

  // Fetch exchange rate on load
  useEffect(() => {
    fetch('/api/proxy/exchange-rate/today')
      .then(r => r.json())
      .then(data => {
        if (data?.rate) setExchangeRate(data.rate);
      });
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data?.role) setUserRole(data.role);
      });
  }, []);

  // Load pre-invoice if invoiceId is provided
  useEffect(() => {
    if (!invoiceId) return;
    setLoadingInvoice(true);
    fetch(`/api/proxy/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(data => {
        if (data?.items) {
          setExistingInvoiceId(data.id);
          setCart(data.items.map((item: any) => ({
            productId: item.productId,
            code: '',
            name: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            ivaType: item.ivaType,
            stock: 999,
          })));
          if (data.customer) {
            setCustomerId(data.customer.id);
            setCustomerName(data.customer.name);
          }
          if (data.exchangeRate) setExchangeRate(data.exchangeRate);
        }
      })
      .finally(() => setLoadingInvoice(false));
  }, [invoiceId]);

  // Product search with debounce
  const handleProductSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/proxy/products?search=${encodeURIComponent(query)}&limit=10`);
        const data = await res.json();
        setSearchResults(data.data || []);
      } catch {} finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(customerSearch)}&limit=5`);
        const data = await res.json();
        setCustomerResults(data.data || []);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  function addToCart(product: any) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        productId: product.id,
        code: product.code,
        name: product.name,
        unitPrice: product.priceDetal,
        quantity: 1,
        ivaType: product.ivaType,
        stock: product.stock?.[0]?.quantity || 0,
      }];
    });
    setSearchQuery('');
    setSearchResults([]);
  }

  function updateQuantity(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = Math.max(1, i.quantity + delta);
      return { ...i, quantity: newQty };
    }));
  }

  function updatePrice(productId: string, price: number) {
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, unitPrice: price } : i));
  }

  function removeItem(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  // Calculate totals
  const subtotalUsd = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const ivaByType: Record<string, number> = {};
  cart.forEach(i => {
    const rate = IVA_RATES[i.ivaType] || 0;
    const iva = i.unitPrice * i.quantity * rate;
    ivaByType[i.ivaType] = (ivaByType[i.ivaType] || 0) + iva;
  });
  const totalIva = Object.values(ivaByType).reduce((s, v) => s + v, 0);
  const totalUsd = subtotalUsd + totalIva;
  const totalBs = totalUsd * exchangeRate;

  // Payment calculations
  const totalPaidUsd = payments.reduce((s, p) => s + p.amountUsd, 0);
  const remaining = totalUsd - totalPaidUsd;

  function addPayment(methodKey: string) {
    const method = PAYMENT_METHODS.find(m => m.key === methodKey);
    if (!method) return;
    const amountUsd = Math.max(0, remaining);
    setPayments(prev => [...prev, {
      method: methodKey,
      amountUsd: Math.round(amountUsd * 100) / 100,
      amountBs: Math.round(amountUsd * exchangeRate * 100) / 100,
      reference: '',
    }]);
  }

  function updatePayment(idx: number, field: string, value: any) {
    setPayments(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [field]: value };
      const pm = PAYMENT_METHODS.find(m => m.key === p.method);
      if (field === 'amountUsd' && pm?.currency === 'USD') {
        updated.amountBs = Math.round(Number(value) * exchangeRate * 100) / 100;
      } else if (field === 'amountBs' && pm?.currency === 'BS') {
        updated.amountUsd = exchangeRate > 0 ? Math.round(Number(value) / exchangeRate * 100) / 100 : 0;
      }
      return updated;
    }));
  }

  function removePayment(idx: number) {
    setPayments(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSavePreInvoice() {
    if (cart.length === 0) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          items: cart.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      const data = await res.json();
      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setMessage({ type: 'success', text: `Pre-factura ${data.number} guardada` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirmPayment() {
    if (payments.length === 0 && !isCredit) return;
    if (!isCredit && remaining > 0.01) {
      setMessage({ type: 'error', text: 'El monto pagado no cubre el total' });
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      let targetInvoiceId = existingInvoiceId;

      // If no existing invoice, create one first
      if (!targetInvoiceId) {
        const createRes = await fetch('/api/proxy/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: customerId || undefined,
            items: cart.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al crear factura');
        }
        const created = await createRes.json();
        targetInvoiceId = created.id;
      }

      // Pay the invoice
      const payRes = await fetch(`/api/proxy/invoices/${targetInvoiceId}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: payments.map(p => ({
            method: p.method,
            amountUsd: Number(p.amountUsd),
            amountBs: Number(p.amountBs),
            reference: p.reference || undefined,
          })),
          isCredit,
          creditAuthPassword: isCredit ? creditAuthPassword : undefined,
          creditDays: isCredit ? creditDays : undefined,
        }),
      });
      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar pago');
      }
      const result = await payRes.json();
      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setPayments([]);
      setPayModalOpen(false);
      setIsCredit(false);
      setExistingInvoiceId(null);
      setMessage({ type: 'success', text: `Factura ${result.number} cobrada exitosamente` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  // Barcode scanner
  async function toggleScanner() {
    if (scannerActive) {
      setScannerActive(false);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScannerActive(true);

      // Use BarcodeDetector API if available
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
        const scan = async () => {
          if (!videoRef.current || !scannerActive) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              handleProductSearch(code);
              setScannerActive(false);
              stream.getTracks().forEach(t => t.stop());
              return;
            }
          } catch {}
          requestAnimationFrame(scan);
        };
        scan();
      }
    } catch {
      setMessage({ type: 'error', text: 'No se pudo acceder a la camara' });
    }
  }

  if (loadingInvoice) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col lg:flex-row gap-4 p-4">
      {/* LEFT: Product catalog */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-3 flex items-center gap-2">
          <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <Monitor className="text-green-400" size={20} />
          </div>
          <h1 className="text-xl font-bold text-white">Punto de Venta</h1>
          {exchangeRate > 0 && (
            <span className="ml-auto text-xs px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              Tasa: Bs {exchangeRate.toFixed(2)}
            </span>
          )}
        </div>

        {message && (
          <div className={`mb-3 px-4 py-2.5 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {message.text}
          </div>
        )}

        {/* Search bar */}
        <div className="card p-3 mb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Buscar producto por nombre, codigo o codigo de barras..."
                value={searchQuery}
                onChange={e => handleProductSearch(e.target.value)}
                className="input-field pl-9 !py-2.5 text-sm"
                autoFocus
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={16} />}
            </div>
            <button onClick={toggleScanner} className={`p-2.5 rounded-lg border transition-colors ${scannerActive ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white'}`} title="Escanear codigo de barras">
              <Camera size={20} />
            </button>
          </div>

          {/* Scanner video */}
          {scannerActive && (
            <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
              <video ref={videoRef} className="w-full max-h-48 object-cover" />
            </div>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="card mb-3 max-h-80 overflow-y-auto">
            {searchResults.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/40 border-b border-slate-700/30 last:border-0 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{product.code}</span>
                    <span className="text-sm text-white font-medium truncate">{product.name}</span>
                  </div>
                  {product.barcode && <span className="text-xs text-slate-600">CB: {product.barcode}</span>}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-400">${product.priceDetal?.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">Bs {(product.priceDetal * exchangeRate).toFixed(2)}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${(product.stock?.[0]?.quantity || 0) > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                    Stock: {product.stock?.[0]?.quantity || 0}
                  </span>
                  <Plus size={18} className="text-green-400" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {cart.length === 0 && searchResults.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ShoppingCart className="mx-auto text-slate-700 mb-3" size={48} />
              <p className="text-slate-500">Busca un producto para comenzar</p>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Cart */}
      <div className="w-full lg:w-[420px] flex flex-col min-h-0">
        <div className="card flex-1 flex flex-col min-h-0">
          {/* Customer selector */}
          <div className="p-3 border-b border-slate-700/50">
            <div className="relative">
              {customerId ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700/30">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-green-400" />
                    <span className="text-sm text-white">{customerName}</span>
                  </div>
                  <button onClick={() => { setCustomerId(null); setCustomerName(''); }} className="text-slate-500 hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerSearch(true); }}
                    onFocus={() => setShowCustomerSearch(true)}
                    className="input-field !py-2 text-sm"
                  />
                  {showCustomerSearch && customerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                      {customerResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerName(c.name);
                            setCustomerSearch('');
                            setShowCustomerSearch(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-700/40 text-sm text-white border-b border-slate-700/30 last:border-0"
                        >
                          {c.name} {c.rif && <span className="text-slate-500 text-xs">({c.rif})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">Carrito vacio</div>
            ) : cart.map(item => (
              <div key={item.productId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/20 border border-slate-700/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {userRole === 'ADMIN' ? (
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={e => updatePrice(item.productId, Number(e.target.value))}
                        className="w-20 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-xs text-green-400 text-right"
                        step="0.01"
                        min="0"
                      />
                    ) : (
                      <span className="text-xs text-green-400">${item.unitPrice.toFixed(2)}</span>
                    )}
                    <span className="text-xs text-slate-600">{IVA_LABELS[item.ivaType]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 rounded hover:bg-slate-600 text-slate-400">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm text-white font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 rounded hover:bg-slate-600 text-slate-400">
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-sm text-white font-medium w-16 text-right">
                  ${(item.unitPrice * item.quantity).toFixed(2)}
                </span>
                <button onClick={() => removeItem(item.productId)} className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Totals and actions */}
          <div className="border-t border-slate-700/50 p-3 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span className="text-white">${subtotalUsd.toFixed(2)}</span></div>
            {Object.entries(ivaByType).filter(([, v]) => v > 0).map(([type, amount]) => (
              <div key={type} className="flex justify-between text-xs">
                <span className="text-slate-500">IVA {IVA_LABELS[type]}</span>
                <span className="text-slate-400">${amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2">
              <span className="text-white">Total USD</span>
              <span className="text-green-400">${totalUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Bs</span>
              <span className="text-slate-300">Bs {totalBs.toFixed(2)}</span>
            </div>

            <div className="flex gap-2 pt-2">
              {userRole === 'SELLER' ? (
                <button
                  onClick={handleSavePreInvoice}
                  disabled={cart.length === 0 || processing}
                  className="btn-primary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <ShoppingCart size={16} />}
                  Guardar pre-factura
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSavePreInvoice}
                    disabled={cart.length === 0 || processing}
                    className="btn-secondary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShoppingCart size={16} /> Pre-factura
                  </button>
                  <button
                    onClick={() => { setPayments([]); setIsCredit(false); setPayModalOpen(true); }}
                    disabled={cart.length === 0 || processing}
                    className="btn-primary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <DollarSign size={16} /> Cobrar ${totalUsd.toFixed(2)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPayModalOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Cobrar Factura</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-sm text-green-400 font-medium">${totalUsd.toFixed(2)} USD</span>
                  <span className="text-sm text-slate-400">Bs {totalBs.toFixed(2)}</span>
                  <span className="text-xs text-slate-500">Tasa: {exchangeRate.toFixed(2)}</span>
                </div>
              </div>
              <button onClick={() => setPayModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Payment methods */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Metodos de Pago</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(pm => (
                    <button
                      key={pm.key}
                      onClick={() => addPayment(pm.key)}
                      className="px-3 py-2 rounded-lg border border-slate-600 hover:border-green-500/40 hover:bg-green-500/5 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment lines */}
              {payments.length > 0 && (
                <div className="space-y-3">
                  {payments.map((p, idx) => {
                    const pm = PAYMENT_METHODS.find(m => m.key === p.method);
                    return (
                      <div key={idx} className="card p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white font-medium">{pm?.label}</span>
                          <button onClick={() => removePayment(idx)} className="text-slate-500 hover:text-red-400"><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-slate-500">USD</label>
                            <input
                              type="number"
                              value={p.amountUsd}
                              onChange={e => updatePayment(idx, 'amountUsd', Number(e.target.value))}
                              className="input-field !py-1.5 text-sm"
                              step="0.01"
                              min="0"
                              readOnly={pm?.currency === 'BS'}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Bs</label>
                            <input
                              type="number"
                              value={p.amountBs}
                              onChange={e => updatePayment(idx, 'amountBs', Number(e.target.value))}
                              className="input-field !py-1.5 text-sm"
                              step="0.01"
                              min="0"
                              readOnly={pm?.currency === 'USD'}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Referencia</label>
                            <input
                              type="text"
                              value={p.reference}
                              onChange={e => updatePayment(idx, 'reference', e.target.value)}
                              className="input-field !py-1.5 text-sm"
                              placeholder="Opcional"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Remaining */}
              <div className="card p-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Pendiente por cobrar</span>
                <span className={`text-lg font-bold ${remaining <= 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
                  ${Math.max(0, remaining).toFixed(2)}
                </span>
              </div>

              {/* Credit toggle */}
              <div className="card p-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCredit}
                    onChange={e => setIsCredit(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                  />
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-blue-400" />
                    <span className="text-sm text-white">Factura a credito</span>
                  </div>
                </label>

                {isCredit && (
                  <div className="grid grid-cols-2 gap-3 pl-7">
                    <div>
                      <label className="text-xs text-slate-500 flex items-center gap-1"><Lock size={12} /> Clave de autorizacion</label>
                      <input
                        type="password"
                        value={creditAuthPassword}
                        onChange={e => setCreditAuthPassword(e.target.value)}
                        className="input-field !py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Dias de credito</label>
                      <input
                        type="number"
                        value={creditDays}
                        onChange={e => setCreditDays(Number(e.target.value))}
                        className="input-field !py-1.5 text-sm"
                        min="1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={processing || (!isCredit && remaining > 0.01)}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <DollarSign size={16} />}
                  Confirmar cobro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
