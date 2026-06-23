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
  UserCheck,
  ShoppingCart,
  CreditCard,
  Lock,
  Pencil,
  MoreHorizontal,
  Clock,
  PanelRightOpen,
  FileCheck,
  ArrowRightLeft,
  Percent,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import SeniatModal from '@/components/seniat-modal';

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

interface PaymentMethodData {
  id: string;
  name: string;
  isDivisa: boolean;
  createsReceivable: boolean;
  isActive: boolean;
  sortOrder: number;
  fiscalCode: string | null;
  parentId: string | null;
  children?: PaymentMethodData[];
}

const DOC_TYPES = ['V', 'E', 'J', 'G', 'C', 'P'];

interface CartItem {
  productId: string;
  code: string;
  name: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  ivaType: string;
  stock: number;
  priceOverridden: boolean;
  discountPct: number;
}

interface PaymentLine {
  methodId: string;
  methodName: string;
  isDivisa: boolean;
  amountUsd: number;
  amountBs: number;
  reference: string;
  createsReceivable?: boolean;
}

// Input de cantidad que permite borrar, escribir decimales (0.25) y el punto en movil.
// Mantiene el texto crudo mientras se edita y confirma al salir; revierte si queda invalido/0.
function QtyInput({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (qty: number) => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera (botones +/-), refrescar el texto cuando no se esta editando.
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // permitir solo digitos y un punto
        let v = e.target.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        setText(v);
      }}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(text);
        if (!isNaN(n) && n > 0) onCommit(n);
        else setText(String(value)); // revertir: nunca queda en vacio/0/negativo
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

// Input de monto (USD/Bs) que permite escribir el punto decimal sin que se borre.
// Mantiene el texto crudo mientras se edita y avisa el numero parseado en cada cambio
// (para que el campo enlazado USD<->Bs se recalcule en vivo). Al salir, normaliza a numero.
function MoneyInput({
  value,
  onChange,
  className,
  readOnly,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera (auto-relleno, campo enlazado), refrescar cuando no se edita.
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      readOnly={readOnly}
      onFocus={(e) => {
        if (readOnly) return;
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // permitir solo digitos y un punto
        let v = e.target.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        setText(v);
        const n = parseFloat(v);
        onChange(isNaN(n) ? 0 : n);
      }}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(text);
        setText(String(isNaN(n) ? 0 : n)); // normaliza ("12." -> "12", "" -> "0")
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
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
  const [customerIsSpecial, setCustomerIsSpecial] = useState(false);
  const [customerIsDefault, setCustomerIsDefault] = useState(false);
  // Aviso (no bloqueante) al aparcar una factura que quedaria con el cliente por defecto
  const [showCustomerReminder, setShowCustomerReminder] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [isCredit, setIsCredit] = useState(false);
  const [creditAuthPassword, setCreditAuthPassword] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [companyConfig, setCompanyConfig] = useState<{ isIGTFContributor: boolean; igtfPct: number; fiscalCreditCode?: string; companyName?: string; rif?: string; address?: string; phone?: string; allowNegativeStock?: boolean; defaultCustomerId?: string | null } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const searchTimeout = useRef<any>(null);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);

  // Price override state
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // Client modal state
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [clientForm, setClientForm] = useState({ documentType: 'V', rif: '', name: '', address: '', phone: '' });
  const [savingClient, setSavingClient] = useState(false);
  const [seniatOpen, setSeniatOpen] = useState(false);
  const [clientRifWarning, setClientRifWarning] = useState('');
  const [clientRifMatch, setClientRifMatch] = useState<any>(null);

  // Cash register selection
  const [selectedCashRegister, setSelectedCashRegister] = useState<any>(null);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashRegisters, setCashRegisters] = useState<any[]>([]);
  const [loadingCash, setLoadingCash] = useState(true);
  const [openingBalanceUsd, setOpeningBalanceUsd] = useState('');
  const [openingBalanceBs, setOpeningBalanceBs] = useState('');
  const [openingCashId, setOpeningCashId] = useState<string | null>(null);

  // Pending invoices drawer
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmRetake, setConfirmRetake] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [pendingFilterMine, setPendingFilterMine] = useState(true);

  // Seller state
  const [sellers, setSellers] = useState<any[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [userSellerName, setUserSellerName] = useState<string | null>(null);
  const [mySellerId, setMySellerId] = useState<string | null>(null);

  // Credit balance state
  const [creditBalance, setCreditBalance] = useState<{ hasBalance: boolean; totalUsd: number; totalBs: number } | null>(null);
  const [changeMethodId, setChangeMethodId] = useState<string | null>(null);

  // Anticipo modal state
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceAmountBs, setAdvanceAmountBs] = useState('');
  const [advanceMethodId, setAdvanceMethodId] = useState('');
  const [advanceReference, setAdvanceReference] = useState('');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);

  const canOverridePrice = userRole === 'ADMIN' || userPermissions.includes('OVERRIDE_PRICE');
  const canSelectSeller = (userRole === 'ADMIN' || userRole === 'SUPERVISOR') && !userSellerName;

  // Hay alguna linea de pago que genera CxC (cashea/crediagro/etc) sin referencia cargada
  const hasMissingCxcReference = payments.some(p => p.createsReceivable && !p.reference.trim());

  // Drawer de facturas en espera: filtro "mis facturas" (solo si el usuario tiene vendedor propio)
  const visiblePendingInvoices = (mySellerId && pendingFilterMine)
    ? pendingInvoices.filter(inv => inv.seller?.id === mySellerId)
    : pendingInvoices;

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'search' | 'cart'>('search');
  const [cartStripCollapsed, setCartStripCollapsed] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [showSellerModal, setShowSellerModal] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { document.title = 'POS | Trinity ERP'; }, []);

  // Fetch exchange rate and user info on load
  useEffect(() => {
    fetch('/api/proxy/exchange-rate/today')
      .then(r => r.text())
      .then(text => {
        if (text) { try { const data = JSON.parse(text); if (data?.rate) setExchangeRate(data.rate); } catch {} }
      });
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data?.id) setUserId(data.id);
        if (data?.role) setUserRole(data.role);
        if (data?.permissions) setUserPermissions(data.permissions || []);
        // Fetch user's linked seller
        if (data?.seller) {
          setSelectedSellerId(data.seller.id);
          setUserSellerName(data.seller.name);
          setMySellerId(data.seller.id);
        }
        // Fetch all sellers for ADMIN/SUPERVISOR dropdown
        if (data?.role === 'ADMIN' || data?.role === 'SUPERVISOR') {
          fetch('/api/proxy/sellers?isActive=true')
            .then(r2 => r2.json())
            .then(sellersData => {
              if (Array.isArray(sellersData)) setSellers(sellersData);
            })
            .catch(() => {});
        }
      });
    fetch('/api/proxy/config')
      .then(r => r.json())
      .then(data => {
        if (data) setCompanyConfig({
          isIGTFContributor: data.isIGTFContributor || false,
          igtfPct: data.igtfPct ?? 3,
          fiscalCreditCode: data.fiscalCreditCode || '10',
          companyName: data.companyName || '',
          rif: data.rif || '',
          address: data.address || '',
          phone: data.phone || '',
          allowNegativeStock: data.allowNegativeStock ?? true,
          defaultCustomerId: data.defaultCustomerId || null,
        });
      });
    fetch('/api/proxy/payment-methods')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPaymentMethods(data);
      })
      .catch(() => {});
  }, []);

  // Cash register selection — check localStorage on mount
  // SELLER role: no cash modal needed, they can't charge
  const isSeller = userRole === 'SELLER';

  const fetchCashRegisters = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/cash-registers/available');
      const data = await res.json();
      if (Array.isArray(data)) setCashRegisters(data);
    } catch {}
    setLoadingCash(false);
  }, []);

  useEffect(() => {
    if (isSeller) { setLoadingCash(false); return; }
    const savedId = localStorage.getItem('selectedCashRegisterId');
    if (savedId) {
      fetch(`/api/proxy/cash-registers/${savedId}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          // Verify register still has open session
          if (data.sessions?.length > 0) {
            setSelectedCashRegister(data);
          } else {
            localStorage.removeItem('selectedCashRegisterId');
            setShowCashModal(true);
            fetchCashRegisters();
          }
          setLoadingCash(false);
        })
        .catch(() => { localStorage.removeItem('selectedCashRegisterId'); setShowCashModal(true); fetchCashRegisters(); });
    } else {
      setShowCashModal(true);
      fetchCashRegisters();
    }
  }, [fetchCashRegisters, isSeller]);

  function selectCashRegister(cr: any) {
    setSelectedCashRegister(cr);
    localStorage.setItem('selectedCashRegisterId', cr.id);
    setShowCashModal(false);
  }

  async function openCashSession(cashRegisterId: string) {
    try {
      const res = await fetch(`/api/proxy/cash-registers/${cashRegisterId}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalanceUsd: parseFloat(openingBalanceUsd) || 0,
          openingBalanceBs: parseFloat(openingBalanceBs) || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al abrir sesion');
      }
      setOpeningBalanceUsd('');
      setOpeningBalanceBs('');
      setOpeningCashId(null);
      await fetchCashRegisters();
      const detail = await fetch(`/api/proxy/cash-registers/${cashRegisterId}`).then(r => r.json());
      selectCashRegister(detail);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  // Load pre-invoice if invoiceId is provided
  useEffect(() => {
    if (!invoiceId) return;
    setLoadingInvoice(true);
    fetch(`/api/proxy/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(data => {
        if (data?.items) {
          setExistingInvoiceId(data.id);
          setCart(data.items.map((item: any) => {
            // Use product's current priceDetal (with IVA) if available,
            // otherwise reconstruct from stored base price
            let priceWithIva: number;
            if (item.priceDetal != null && !item.priceOverridden) {
              priceWithIva = item.priceDetal;
            } else {
              const ivaRate = IVA_RATES[item.ivaType] || 0;
              priceWithIva = Math.round(item.unitPrice * (1 + ivaRate) * 100) / 100;
            }
            return {
              productId: item.productId,
              code: '',
              name: item.productName,
              unitPrice: priceWithIva,
              originalPrice: priceWithIva,
              quantity: item.quantity,
              ivaType: item.ivaType,
              stock: 999,
              priceOverridden: item.priceOverridden || false,
              discountPct: item.discountPct || 0,
            };
          }));
          if (data.customer) {
            setCustomerId(data.customer.id);
            setCustomerName(data.customer.name);
          }
          if (data.exchangeRate) setExchangeRate(data.exchangeRate);
        }
      })
      .finally(() => setLoadingInvoice(false));
  }, [invoiceId]);

  // Fetch pending invoices count (polling every 30s)
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/invoices/pending?today=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPendingInvoices(data);
        setPendingCount(data.length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

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
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(customerSearch)}&limit=5&isActive=true`);
        const data = await res.json();
        setCustomerResults(data.data || []);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Check for duplicate RIF in client form
  useEffect(() => {
    const rif = clientForm.rif?.replace(/[-\s]/g, '') || '';
    if (rif.length < 5) { setClientRifWarning(''); setClientRifMatch(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(rif)}&limit=5&isActive=true`);
        const data = await res.json();
        const match = (data.data || []).find((c: any) =>
          c.id !== customerId
          && c.rif && c.rif.replace(/[-\s]/g, '').toUpperCase() === rif.toUpperCase()
          && c.documentType === clientForm.documentType
        );
        setClientRifWarning(match ? `Ya existe un cliente con este documento: ${match.name}` : '');
        setClientRifMatch(match || null);
      } catch { setClientRifWarning(''); setClientRifMatch(null); }
    }, 500);
    return () => clearTimeout(t);
  }, [clientForm.rif, clientForm.documentType, customerId]);

  // Fetch credit balance when customer changes
  const refreshCreditBalance = useCallback(() => {
    if (!customerId) { setCreditBalance(null); return; }
    fetch(`/api/proxy/customers/${customerId}/credit-balance`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCreditBalance(data); })
      .catch(() => setCreditBalance(null));
  }, [customerId]);

  useEffect(() => { refreshCreditBalance(); }, [refreshCreditBalance]);

  // Fetch contribuyente especial / cliente default flags when customer changes
  useEffect(() => {
    if (!customerId) { setCustomerIsSpecial(false); setCustomerIsDefault(false); return; }
    fetch(`/api/proxy/customers/${customerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCustomerIsSpecial(!!data.isSpecialTaxpayer);
          setCustomerIsDefault(!!data.isDefault);
        }
      })
      .catch(() => { /* ignore */ });
  }, [customerId]);

  const toggleSpecialTaxpayer = async () => {
    if (!customerId || customerIsDefault) return;
    const newValue = !customerIsSpecial;
    setCustomerIsSpecial(newValue); // optimista
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSpecialTaxpayer: newValue }),
      });
      if (!res.ok) setCustomerIsSpecial(!newValue); // revertir
    } catch {
      setCustomerIsSpecial(!newValue);
    }
  };

  async function submitAdvance() {
    if (!customerId || !advanceAmount || !advanceMethodId) return;
    const posSessionId = selectedCashRegister?.sessions?.[0]?.id;
    if (!posSessionId) {
      setMessage({ type: 'error', text: 'No hay sesion de caja abierta' });
      return;
    }
    setSavingAdvance(true);
    try {
      const res = await fetch('/api/proxy/customer-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          amountUsd: Number(advanceAmount),
          methodId: advanceMethodId,
          cashSessionId: posSessionId,
          reference: advanceReference || undefined,
          notes: advanceNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al registrar anticipo');
      }
      setMessage({ type: 'success', text: 'Anticipo registrado exitosamente' });
      setAdvanceModalOpen(false);
      setAdvanceAmount('');
      setAdvanceAmountBs('');
      setAdvanceMethodId('');
      setAdvanceReference('');
      setAdvanceNotes('');
      refreshCreditBalance();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingAdvance(false);
    }
  }

  function addToCart(product: any) {
    const stockQty = product.stock?.[0]?.quantity || 0;
    const blockNoStock = companyConfig?.allowNegativeStock === false;

    if (blockNoStock && stockQty <= 0) return;

    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [{
        productId: product.id,
        code: product.code,
        name: product.name,
        unitPrice: product.priceDetal,
        originalPrice: product.priceDetal,
        quantity: 1,
        ivaType: product.ivaType,
        stock: stockQty,
        priceOverridden: false,
        discountPct: 0,
      }, ...prev];
    });
    setSearchQuery('');
    setSearchResults([]);
  }

  function updateQuantity(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = Math.max(0.01, Math.round((i.quantity + delta) * 100) / 100);
      return { ...i, quantity: newQty };
    }));
  }

  function setQuantity(productId: string, qty: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const newQty = Math.max(0.01, Math.round(qty * 100) / 100);
      return { ...i, quantity: newQty };
    }));
  }

  function confirmPriceOverride(productId: string) {
    const val = parseFloat(editingPriceValue);
    if (!isNaN(val) && val >= 0) {
      setCart(prev => prev.map(i => i.productId === productId ? { ...i, unitPrice: val, priceOverridden: val !== i.originalPrice } : i));
    }
    setEditingPriceItemId(null);
  }

  function removeItem(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  // Calculate totals — priceDetal includes IVA, extract base for proper breakdown
  const serieIsVatExempt = selectedCashRegister?.serie?.isVatExempt === true;
  const ivaByType: Record<string, number> = {};
  let subtotalUsd = 0;
  let subtotalBsAccum = 0;
  let ivaBsAccum = 0;
  cart.forEach(i => {
    const originalRate = IVA_RATES[i.ivaType] || 0;
    const effectiveRate = serieIsVatExempt ? 0 : originalRate;
    const discountMultiplier = 1 - (i.discountPct || 0) / 100;
    // Always extract base using original product IVA rate (priceDetal includes IVA)
    const basePrice = (i.unitPrice / (1 + originalRate)) * discountMultiplier;
    const lineSubtotal = basePrice * i.quantity;
    const iva = lineSubtotal * effectiveRate;
    subtotalUsd += lineSubtotal;
    const effectiveIvaType = serieIsVatExempt ? 'EXEMPT' : i.ivaType;
    ivaByType[effectiveIvaType] = (ivaByType[effectiveIvaType] || 0) + iva;
    // Bs driven: calculate from rounded Bs subtotal to match fiscal printer
    const lineSubtotalBs = Math.round(lineSubtotal * exchangeRate * 100) / 100;
    const lineIvaBs = Math.round(lineSubtotalBs * effectiveRate * 100) / 100;
    subtotalBsAccum += lineSubtotalBs;
    ivaBsAccum += lineIvaBs;
  });
  const totalIva = Object.values(ivaByType).reduce((s, v) => s + v, 0);
  const totalUsd = subtotalUsd + totalIva;
  const totalBs = Math.round((subtotalBsAccum + ivaBsAccum) * 100) / 100;

  // IGTF: se calcula una sola vez sobre el primer pago en divisas (solo en caja fiscal)
  const firstForeignPayment = payments.find(p => p.isDivisa);
  const isIGTFApplicable = companyConfig?.isIGTFContributor && selectedCashRegister?.serie?.isFiscal && firstForeignPayment && firstForeignPayment.amountUsd > 0;
  const igtfUsd = isIGTFApplicable
    ? Math.round(firstForeignPayment.amountUsd * ((companyConfig?.igtfPct || 3) / 100) * 100) / 100
    : 0;
  const igtfBs = Math.round(igtfUsd * exchangeRate * 100) / 100;
  const grandTotalUsd = totalUsd + igtfUsd;
  const grandTotalBs = totalBs + igtfBs;

  // Payment calculations
  const totalPaidUsd = payments.reduce((s, p) => s + p.amountUsd, 0);
  const remaining = Math.round((grandTotalUsd - totalPaidUsd) * 100) / 100;
  const totalPaidBs = payments.reduce((s, p) => s + p.amountBs, 0);
  const remainingBs = Math.round((grandTotalBs - totalPaidBs) * 100) / 100;

  // Change (vuelto) calculation: only when USD payments exceed total
  const totalPaidDivisaUsd = payments
    .filter(p => p.isDivisa)
    .reduce((s, p) => s + p.amountUsd, 0);
  const changeUsd = totalPaidDivisaUsd > grandTotalUsd + 0.01
    ? Math.round((totalPaidDivisaUsd - grandTotalUsd) * 100) / 100
    : 0;
  const changeBsCalc = Math.round(changeUsd * exchangeRate * 100) / 100;
  const hasChange = changeUsd > 0.01;

  function addPayment(pm: PaymentMethodData) {
    if (pm.isDivisa) {
      // USD method: fill with remaining USD, derive Bs
      const amountUsd = Math.round(Math.max(0, remaining) * 100) / 100;
      setPayments(prev => [...prev, {
        methodId: pm.id,
        methodName: pm.name,
        isDivisa: true,
        amountUsd,
        amountBs: Math.round(amountUsd * exchangeRate * 100) / 100,
        reference: '',
        createsReceivable: pm.createsReceivable,
      }]);
    } else {
      // Bs method: fill with remaining Bs, use remaining USD directly to avoid rounding discrepancy
      const amountBs = Math.round(Math.max(0, remainingBs) * 100) / 100;
      const amountUsd = Math.round(Math.max(0, remaining) * 100) / 100;
      setPayments(prev => [...prev, {
        methodId: pm.id,
        methodName: pm.name,
        isDivisa: false,
        amountUsd,
        amountBs,
        reference: '',
        createsReceivable: pm.createsReceivable,
      }]);
    }
    setExpandedGroup(null);
  }

  function updatePayment(idx: number, field: string, value: any) {
    setPayments(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      let numValue = Number(value);
      // Cap saldo a favor to available balance
      if (p.methodId === 'pm_saldo_favor' && field === 'amountUsd' && creditBalance) {
        numValue = Math.min(numValue, creditBalance.totalUsd);
      }
      const updated = { ...p, [field]: p.methodId === 'pm_saldo_favor' && field === 'amountUsd' ? numValue : value };
      if (field === 'amountUsd' && p.isDivisa) {
        updated.amountBs = Math.round(Number(updated.amountUsd) * exchangeRate * 100) / 100;
      } else if (field === 'amountBs' && !p.isDivisa) {
        updated.amountUsd = exchangeRate > 0 ? Math.round(Number(value) / exchangeRate * 100) / 100 : 0;
      }
      return updated;
    }));
  }

  function removePayment(idx: number) {
    setPayments(prev => prev.filter((_, i) => i !== idx));
  }

  // Guardar/Aparcar: si la factura quedaria con el cliente por defecto (sin cliente
  // elegido -> el backend le asigna el por defecto, o con el cliente marcado por defecto),
  // avisar al vendedor antes de aparcar. Es solo informativo: NO bloquea el aparcado.
  function handleSaveInvoice() {
    if (cart.length === 0) return;
    // La factura queda con el cliente por defecto si: no hay cliente elegido (el backend
    // le asigna config.defaultCustomerId), o el cliente actual ES ese por defecto (caso al
    // retomar una factura ya aparcada). Se compara contra config.defaultCustomerId — el flag
    // Customer.isDefault no es confiable (el "Cliente Final" lo tiene en false).
    const isDefaultCustomer =
      !customerId || customerIsDefault || customerId === companyConfig?.defaultCustomerId;
    if (isDefaultCustomer) {
      setShowCustomerReminder(true);
      return;
    }
    doSaveInvoice();
  }

  // Abre el buscador de cliente en el sitio que corresponde al dispositivo:
  // en movil/tablet el modal "Seleccionar Cliente" a pantalla completa; en PC el
  // buscador del carrito (al limpiar el cliente por defecto queda visible el input).
  function goAssignCustomer() {
    setShowCustomerReminder(false);
    setCustomerId(null);
    setCustomerName('');
    setShowCustomerSearch(true);
    // En PC el buscador del carrito queda visible al limpiar el cliente: lo enfocamos
    // (en movil/tablet el modal full-screen ya hace autoFocus). El timeout deja
    // montar el input tras el re-render.
    setTimeout(() => customerSearchInputRef.current?.focus(), 100);
  }

  async function doSaveInvoice() {
    if (cart.length === 0) return;
    setProcessing(true);
    setMessage(null);
    try {
      const invoiceBody = {
        customerId: customerId || undefined,
        cashRegisterId: selectedCashRegister?.id || undefined,
        sellerId: selectedSellerId || undefined,
        items: cart.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct || 0,
          priceOverridden: i.priceOverridden || false,
        })),
      };

      let res: Response;
      if (existingInvoiceId) {
        // Update existing invoice items and release lock
        res = await fetch(`/api/proxy/invoices/${existingInvoiceId}/update-items`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoiceBody),
        });
      } else {
        // Create new invoice
        res = await fetch('/api/proxy/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoiceBody),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }
      const data = await res.json();
      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setExistingInvoiceId(null);
      setMobileView('search'); // volver a la pantalla de busqueda para la siguiente factura
      setMessage({ type: 'success', text: 'Factura guardada en espera' });
      fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleSaveQuotation() {
    if (cart.length === 0) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/proxy/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          items: cart.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountPct: i.discountPct || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar cotizacion');
      }
      const data = await res.json();
      setMessage({ type: 'success', text: `Cotizacion ${data.number} guardada` });
      if (confirm('¿Limpiar carrito para nueva venta?')) {
        setCart([]);
        setCustomerId(null);
        setCustomerName('');
        setExistingInvoiceId(null);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  // Empuja el carrito actual (descuentos/cantidades/precios editados) a una factura
  // que YA existe en la BD, antes de cobrar. Sin esto, pay() valida el pago contra el
  // total guardado (viejo) y rechaza el cobro con "El monto pagado es menor al total".
  async function syncExistingInvoiceItems(targetInvoiceId: string) {
    const res = await fetch(`/api/proxy/invoices/${targetInvoiceId}/update-items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customerId || undefined,
        cashRegisterId: selectedCashRegister?.id || undefined,
        sellerId: selectedSellerId || undefined,
        items: cart.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct || 0,
          priceOverridden: i.priceOverridden || false,
        })),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al actualizar la factura antes de cobrar');
    }
  }

  async function handleConfirmCredit() {
    if (!customerId) {
      setMessage({ type: 'error', text: 'Debe asignar un cliente para facturar a credito' });
      return;
    }
    if (!creditAuthPassword) {
      setMessage({ type: 'error', text: 'Debe ingresar la clave de autorizacion' });
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      let targetInvoiceId = existingInvoiceId;

      if (!targetInvoiceId) {
        const createRes = await fetch('/api/proxy/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId,
            cashRegisterId: selectedCashRegister?.id || undefined,
            sellerId: selectedSellerId || undefined,
            items: cart.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountPct: i.discountPct || 0,
            })),
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al crear factura');
        }
        const created = await createRes.json();
        targetInvoiceId = created.id;
      } else {
        // Factura existente (retomada/cargada): sincronizar el carrito antes de cobrar
        await syncExistingInvoiceItems(targetInvoiceId);
      }

      const payRes = await fetch(`/api/proxy/invoices/${targetInvoiceId}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [],
          isCredit: true,
          creditAuthPassword,
          creditDays,
          cashRegisterId: selectedCashRegister?.id || undefined,
        }),
      });
      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar credito');
      }
      const result = await payRes.json();

      // Fiscal register: generate fiscal commands; otherwise print thermal receipt
      if (selectedCashRegister?.serie?.isFiscal) {
        if (!selectedCashRegister?.serie?.comPort) {
          setMessage({ type: 'error', text: 'Configura el puerto COM en la serie de esta caja antes de imprimir fiscalmente' });
          return;
        }
        try {
          const { buildFiscalCommands, sendToFiscalPrinter } = await import('@/lib/fiscal-printer');
          const cartCodeMap = new Map(cart.map(c => [c.productId, c.code]));
          const enrichedResult = {
            ...result,
            items: (result.items || []).map((item: any) => ({
              ...item,
              productCode: cartCodeMap.get(item.productId) || '',
            })),
          };
          const commands = buildFiscalCommands(enrichedResult, companyConfig || {});
          console.log('[FISCAL-CREDITO] Comandos:', JSON.stringify(commands));
          const fiscal = await sendToFiscalPrinter(commands, selectedCashRegister?.serie?.comPort, true);

          if (fiscal) {
            try {
              await fetch(`/api/proxy/invoices/${result.id}/fiscal-info`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fiscalNumber: fiscal.invoiceFiscalNumber,
                  machineSerial: fiscal.machineSerial,
                }),
              });
            } catch {}
          }
        } catch (fiscalErr: any) {
          console.error('[FISCAL-CREDITO] ERROR:', fiscalErr.message);
        }
      } else if (selectedCashRegister) {
        try {
          const { printReceipt } = await import('@/lib/print-receipt');
          await printReceipt(result, companyConfig || {});
        } catch {}
      }

      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setCreditAuthPassword('');
      setCreditModalOpen(false);
      setExistingInvoiceId(null);
      setMessage({ type: 'success', text: `Factura ${result.number} registrada a credito` });
      fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirmPayment() {
    if (payments.length === 0) return;

    // Build final payments adjusting last one to close tiny USD/Bs rounding gaps
    const finalPayments = payments.map(p => ({
      methodId: p.methodId,
      amountUsd: Number(p.amountUsd),
      amountBs: Number(p.amountBs),
      reference: p.reference || undefined,
    }));
    if (finalPayments.length > 0) {
      const lastIdx = finalPayments.length - 1;
      const prevUsd = finalPayments.slice(0, lastIdx).reduce((s, p) => s + p.amountUsd, 0);
      const prevBs = finalPayments.slice(0, lastIdx).reduce((s, p) => s + p.amountBs, 0);
      const gapUsd = Math.round((grandTotalUsd - prevUsd) * 100) / 100;
      const gapBs = Math.round((grandTotalBs - prevBs) * 100) / 100;
      const diffUsd = Math.abs(gapUsd - finalPayments[lastIdx].amountUsd);
      const diffBs = Math.abs(gapBs - finalPayments[lastIdx].amountBs);
      if (diffUsd <= 0.02 && diffBs <= 0.02 && gapUsd >= 0 && gapBs >= 0) {
        finalPayments[lastIdx].amountUsd = gapUsd;
        finalPayments[lastIdx].amountBs = gapBs;
      }
    }

    const finalPaidUsd = finalPayments.reduce((s, p) => s + p.amountUsd, 0);
    const finalRemaining = grandTotalUsd - finalPaidUsd;
    if (finalRemaining > 0.01 && !hasChange) {
      setMessage({ type: 'error', text: 'El monto pagado no cubre el total' });
      return;
    }
    if (hasChange && !changeMethodId) {
      setMessage({ type: 'error', text: 'Seleccione un metodo de vuelto' });
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      let targetInvoiceId = existingInvoiceId;

      if (!targetInvoiceId) {
        const createRes = await fetch('/api/proxy/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: customerId || undefined,
            cashRegisterId: selectedCashRegister?.id || undefined,
            sellerId: selectedSellerId || undefined,
            items: cart.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountPct: i.discountPct || 0,
            })),
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.message || 'Error al crear factura');
        }
        const created = await createRes.json();
        targetInvoiceId = created.id;
      } else {
        // Factura existente (retomada/cargada): sincronizar el carrito antes de cobrar
        await syncExistingInvoiceItems(targetInvoiceId);
      }

      const payRes = await fetch(`/api/proxy/invoices/${targetInvoiceId}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: finalPayments,
          isCredit: false,
          changeMethodId: hasChange ? changeMethodId : undefined,
          cashRegisterId: selectedCashRegister?.id || undefined,
        }),
      });
      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar pago');
      }
      const result = await payRes.json();

      // Fiscal register: generate fiscal commands; otherwise print thermal receipt
      if (selectedCashRegister?.serie?.isFiscal) {
        if (!selectedCashRegister?.serie?.comPort) {
          setMessage({ type: 'error', text: 'Configura el puerto COM en la serie de esta caja antes de imprimir fiscalmente' });
          return;
        }
        try {
          const { buildFiscalCommands, sendToFiscalPrinter } = await import('@/lib/fiscal-printer');
          // Enrich invoice items with product codes from cart
          const cartCodeMap = new Map(cart.map(c => [c.productId, c.code]));
          const enrichedResult = {
            ...result,
            items: (result.items || []).map((item: any) => ({
              ...item,
              productCode: cartCodeMap.get(item.productId) || '',
            })),
          };
          const commands = buildFiscalCommands(enrichedResult, companyConfig || {});
          console.log('[FISCAL-CONTADO] Comandos:', JSON.stringify(commands));
          const fiscal = await sendToFiscalPrinter(commands, selectedCashRegister?.serie?.comPort, true);

          if (fiscal) {
            try {
              await fetch(`/api/proxy/invoices/${result.id}/fiscal-info`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fiscalNumber: fiscal.invoiceFiscalNumber,
                  machineSerial: fiscal.machineSerial,
                }),
              });
            } catch {}
          }
        } catch (fiscalErr: any) {
          console.error('[FISCAL-CONTADO] ERROR:', fiscalErr.message);
        }
      } else if (selectedCashRegister) {
        try {
          const { printReceipt } = await import('@/lib/print-receipt');
          await printReceipt(result, companyConfig || {});
        } catch {}
      }

      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setPayments([]);
      setPayModalOpen(false);
      setExistingInvoiceId(null);
      setMessage({ type: 'success', text: `Factura ${result.number} cobrada exitosamente` });
      fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  }

  // SENIAT lookup from POS client modal
  function handleSeniatResult(data: { name: string; documentType: string; documentNumber: string }) {
    setClientForm(f => ({
      ...f,
      name: data.name,
      documentType: data.documentType || f.documentType,
      rif: data.documentNumber || f.rif,
    }));
    setMessage({ type: 'success', text: 'Datos importados del SENIAT' });
  }

  // Client modal functions
  // Abre el modal de nuevo cliente precargando lo escrito en la busqueda.
  // Si parece documento (prefijo opcional V/E/J/G/C/P + 5+ digitos) lo pone en RIF; si no, en Nombre.
  function openCreateClient() {
    const raw = customerSearch.trim();
    const cleaned = raw.replace(/[\s.\-]/g, '');
    const m = cleaned.match(/^([VEJGCP])?(\d{5,})$/i);
    if (m) {
      setClientForm({ documentType: (m[1] || 'V').toUpperCase(), rif: m[2], name: '', address: '', phone: '' });
    } else {
      setClientForm({ documentType: 'V', rif: '', name: raw, address: '', phone: '' });
    }
    setShowCreateClient(true);
  }

  async function handleSaveClient(isEdit: boolean) {
    setSavingClient(true);
    try {
      const url = isEdit ? `/api/proxy/customers/${customerId}` : '/api/proxy/customers';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar cliente');
      }
      const data = await res.json();
      setCustomerId(data.id);
      setCustomerName(data.name);
      setShowCreateClient(false);
      setShowEditClient(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingClient(false);
    }
  }

  function openEditClient() {
    if (!customerId) return;
    fetch(`/api/proxy/customers/${customerId}`)
      .then(r => r.json())
      .then(data => {
        setClientForm({
          documentType: data.documentType || 'V',
          rif: data.rif || '',
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
        });
        setShowEditClient(true);
      });
  }

  // Retake pending invoice — lock it first
  async function retakeInvoice(inv: any) {
    try {
      const res = await fetch(`/api/proxy/invoices/${inv.id}/retake`, { method: 'PATCH' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo retomar la factura');
      }
      const fullInvoice = await res.json();
      setCart(fullInvoice.items.map((item: any) => {
        // Use product's current priceDetal (with IVA) if available,
        // otherwise reconstruct from stored base price
        let priceWithIva: number;
        if (item.priceDetal != null && !item.priceOverridden) {
          priceWithIva = item.priceDetal;
        } else {
          const ivaRate = IVA_RATES[item.ivaType] || 0;
          priceWithIva = Math.round(item.unitPrice * (1 + ivaRate) * 100) / 100;
        }
        return {
          productId: item.productId,
          code: '',
          name: item.productName,
          unitPrice: priceWithIva,
          originalPrice: priceWithIva,
          quantity: item.quantity,
          ivaType: item.ivaType || 'GENERAL',
          stock: 999,
          priceOverridden: item.priceOverridden || false,
          discountPct: item.discountPct || 0,
        };
      }));
      if (fullInvoice.customer) {
        setCustomerId(fullInvoice.customer.id);
        setCustomerName(fullInvoice.customer.name);
      } else {
        setCustomerId(null);
        setCustomerName('');
      }
      // Preserve the original seller so commissions stay with whoever sold it
      setSelectedSellerId(fullInvoice.seller?.id ?? null);
      setExistingInvoiceId(inv.id);
      setPendingDrawerOpen(false);
      setConfirmRetake(null);
      fetchPending();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setConfirmRetake(null);
    }
  }

  async function deletePendingInvoice(id: string) {
    try {
      await fetch(`/api/proxy/invoices/${id}`, { method: 'DELETE' });
      fetchPending();
      setConfirmCancel(null);
    } catch {}
  }

  // Time ago helper
  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}min`;
  }

  // ── Escaner de codigos de barras HIBRIDO ──────────────────────────────────
  // Usa el motor NATIVO del navegador (BarcodeDetector) cuando existe — instantaneo
  // en Android/Chrome (tablets y telefonos), el mismo tipo de motor que usan las
  // apps nativas. En iPhone/Safari (sin BarcodeDetector) cae a ZXing calibrado.
  // En ambos: formatos restringidos a los 1D de tienda, camara trasera forzada y
  // confirmacion de 2 lecturas iguales seguidas (evita lecturas erroneas).
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });

  // Formatos nativos (BarcodeDetector) — EAN/UPC de fabrica + CODE-128/39 para etiquetas propias
  const NATIVE_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
  // Restriccion de camara: trasera + buena resolucion para enfocar el codigo nitido
  const SCANNER_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  };

  function stopScanner() {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    lastScanRef.current = { code: '', count: 0 };
  }

  // Exige 2 lecturas identicas seguidas antes de aceptar (mata los falsos positivos)
  function confirmScan(code: string): boolean {
    if (lastScanRef.current.code === code) {
      lastScanRef.current.count += 1;
    } else {
      lastScanRef.current = { code, count: 1 };
    }
    return lastScanRef.current.count >= 2;
  }

  function finishScan(code: string) {
    handleProductSearch(code);
    setScannerActive(false);
    stopScanner();
  }

  // Intenta el motor nativo. Devuelve true si arranco, false si no esta soportado.
  async function startNativeDetector(): Promise<boolean> {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return false;
    let formats = NATIVE_BARCODE_FORMATS;
    try {
      const supported: string[] = await BD.getSupportedFormats();
      formats = NATIVE_BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return false;
    } catch {
      // si getSupportedFormats falla, intentamos con la lista por defecto
    }
    const detector = new BD({ formats });
    const stream = await navigator.mediaDevices.getUserMedia(SCANNER_VIDEO_CONSTRAINTS);
    if (!videoRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    videoRef.current.srcObject = stream;
    await videoRef.current.play().catch(() => {});

    let stopped = false;
    let rafId = 0;
    const tick = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const code = codes[0].rawValue as string;
          if (code && confirmScan(code)) {
            finishScan(code);
            return;
          }
        }
      } catch {
        // errores por frame (video no listo, etc.) se ignoran
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    scannerControlsRef.current = {
      stop: () => {
        stopped = true;
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      },
    };
    return true;
  }

  // Fallback ZXing calibrado (iPhone/Safari y navegadores viejos)
  async function startZxingScanner() {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const hints = new Map<number, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
    ]);
    const codeReader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
    if (!videoRef.current) throw new Error('No se pudo inicializar el video');
    const controls = await codeReader.decodeFromConstraints(
      SCANNER_VIDEO_CONSTRAINTS,
      videoRef.current,
      (result) => {
        if (result) {
          const code = result.getText();
          if (code && confirmScan(code)) finishScan(code);
        }
      },
    );
    scannerControlsRef.current = { stop: () => controls.stop() };
  }

  async function toggleScanner() {
    if (scannerActive) {
      setScannerActive(false);
      stopScanner();
      return;
    }

    // getUserMedia requires HTTPS (secure context) on mobile browsers
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setMessage({ type: 'error', text: 'La camara requiere conexion HTTPS. No funciona en HTTP.' });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage({ type: 'error', text: 'Este navegador no soporta acceso a la camara' });
      return;
    }

    try {
      lastScanRef.current = { code: '', count: 0 };
      setScannerActive(true);

      // Wait for React to render the <video> element before attaching the stream
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Motor nativo primero (Android -> instantaneo); si no, ZXing (iPhone)
      const startedNative = await startNativeDetector();
      if (!startedNative) {
        await startZxingScanner();
      }
    } catch (err) {
      console.error('Scanner error:', err);
      const errorMsg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Permiso de camara denegado. Verifica los permisos del navegador.'
        : err instanceof DOMException && err.name === 'NotFoundError'
        ? 'No se encontro ninguna camara en este dispositivo.'
        : 'No se pudo acceder a la camara';
      setMessage({ type: 'error', text: errorMsg });
      setScannerActive(false);
      stopScanner();
    }
  }

  useEffect(() => {
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    };
  }, []);

  if (loadingInvoice || loadingCash) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  // Cash register selection modal (fullscreen, non-dismissable)
  if (showCashModal && !isSeller) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/98 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 mb-4">
              <Monitor className="text-green-400" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white">Selecciona una caja para comenzar</h2>
            <p className="text-slate-400 mt-2">Elige la caja donde vas a operar</p>
          </div>

          {/* Available registers (from /available endpoint — user's own + shared) */}
          {cashRegisters.length > 0 && (
            <div className="mb-6">
              <div className="grid gap-3">
                {cashRegisters.map(cr => (
                  <div key={cr.id} className="card p-4 flex items-center justify-between hover:border-green-500/30 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{cr.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Cod: {cr.code}</span>
                        {cr.serie?.isFiscal && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">Fiscal</span>}
                        {!cr.serie && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">Sin serie</span>}
                        {cr.isShared && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">Compartida</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {cr.sessions?.map((s: any) => s.openedBy?.name).join(', ')}
                      </p>
                    </div>
                    <button onClick={() => selectCashRegister(cr)} className="btn-primary text-sm px-4 py-2">Usar esta caja</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cashRegisters.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">No hay cajas abiertas disponibles. Abre una caja primero.</p>
              <button onClick={() => window.location.href = '/cash'} className="btn-primary px-6 py-2">Ir a cajas</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Mobile POS Render ────────────────────────────────────────────────────
  const renderMobileLayout = () => (
    <div className="h-[calc(100vh-64px)] flex flex-col relative">
      {message && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      {mobileView === 'search' ? (
        /* ═══ Mobile Search View ═══ */
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-2 pb-32">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">POS</h1>
              {selectedCashRegister && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 border border-slate-600 text-slate-400">{selectedCashRegister.name}</span>
              )}
            </div>
            <button
              onClick={() => setMobileOptionsOpen(true)}
              className="p-2 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-400"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          {/* Search bar */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={searchQuery}
                onChange={e => handleProductSearch(e.target.value)}
                className="input-field pl-9 !py-3 text-base w-full"
                autoFocus
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" size={16} />}
            </div>
            <button onClick={toggleScanner} className={`p-3 rounded-lg border ${scannerActive ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-slate-700/50 border-slate-600 text-slate-400'}`}>
              <Camera size={20} />
            </button>
          </div>

          {scannerActive && (
            <div className="mb-2 rounded-lg overflow-hidden border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-32 object-cover" />
            </div>
          )}

          {/* Product results grid */}
          <div className={`flex-1 overflow-y-auto ${cart.length > 0 ? 'pb-64' : ''}`}>
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map(product => {
                  const prodStock = product.stock?.[0]?.quantity || 0;
                  const blockNoStock = companyConfig?.allowNegativeStock === false && prodStock <= 0;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={blockNoStock}
                      className={`text-left p-3 rounded-xl border transition-all active:scale-95 ${blockNoStock ? 'opacity-40 border-slate-700/30' : 'border-slate-700/50 bg-slate-800/50 hover:border-green-500/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center mb-2">
                        <ShoppingCart size={16} className="text-slate-500" />
                      </div>
                      <p className="text-sm text-white font-medium line-clamp-2 leading-tight">{product.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{product.code}{product.supplierRef ? ` - ${product.supplierRef}` : ''}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm font-semibold text-green-400">${product.priceDetal?.toFixed(2)}</p>
                        {!blockNoStock && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${prodStock > 0 ? 'text-green-400 bg-green-500/10' : 'text-amber-400 bg-amber-500/10'}`}>Stock: {prodStock}</span>
                        )}
                      </div>
                      {blockNoStock && <p className="text-[10px] text-red-400 mt-0.5">Sin stock</p>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <ShoppingCart className="mx-auto text-slate-700 mb-2" size={40} />
                  <p className="text-slate-500 text-sm">Busca un producto</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ═══ Mobile Cart View ═══ */
        <div className="flex-1 flex flex-col min-h-0 pb-[240px]">
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-700/50">
            <button onClick={() => setMobileView('search')} className="text-sm text-emerald-400 flex items-center gap-1">
              ← Agregar
            </button>
            <h2 className="text-lg font-bold text-white flex-1">Mi carrito</h2>
            <span className="text-xs text-slate-400">{cart.length} items</span>
          </div>

          {/* Customer section */}
          <div className="px-3 py-2 border-b border-slate-700/30">
            {customerId ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <User size={14} className="text-green-400" />
                  <span className="text-sm text-white">{customerName}</span>
                  {!customerIsDefault && (
                    <button
                      onClick={toggleSpecialTaxpayer}
                      title="Contribuyente especial: el sistema generará la retención de IVA al facturar a crédito"
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                        customerIsSpecial
                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                          : 'bg-slate-700/40 border-slate-600 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {customerIsSpecial ? '✓ Contribuyente especial' : 'Contribuyente?'}
                    </button>
                  )}
                </div>
                <button onClick={() => { setCustomerId(null); setCustomerName(''); }} className="text-xs text-red-400">Quitar</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomerSearch(true)}
                className="text-sm text-slate-400 flex items-center gap-1.5 py-1"
              >
                <Plus size={14} /> Agregar cliente
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">Carrito vacio</p>
            ) : cart.map(item => {
              const discountMult = 1 - (item.discountPct || 0) / 100;
              const lineTotal = item.unitPrice * item.quantity * discountMult;
              return (
                <div key={item.productId} className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm font-medium text-white line-clamp-2 leading-tight" title={item.name}>{item.name}</p>
                      <p className="text-xs text-slate-500">${item.unitPrice.toFixed(2)} c/u</p>
                    </div>
                    <button onClick={() => removeItem(item.productId)} className="p-1 text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.productId, -1)} className="w-8 h-8 rounded-lg bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                        <Minus size={14} />
                      </button>
                      <QtyInput
                        value={item.quantity}
                        onCommit={(q) => setQuantity(item.productId, q)}
                        className="w-14 text-center text-sm font-semibold text-white bg-slate-700/60 border border-slate-600 rounded-lg px-1 py-1 focus:outline-none focus:border-green-500/50"
                      />
                      <button onClick={() => updateQuantity(item.productId, 1)} className="w-8 h-8 rounded-lg bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-green-400">${lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fixed bottom: totals + actions */}
          <div className="fixed bottom-14 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 px-4 py-3 z-30">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Subtotal</span><span className="text-white">${subtotalUsd.toFixed(2)}</span>
            </div>
            {Object.entries(ivaByType).filter(([, v]) => v > 0).map(([type, amount]) => (
              <div key={type} className="flex justify-between text-xs">
                <span className="text-slate-500">IVA {IVA_LABELS[type]}</span><span className="text-slate-400">${(amount as number).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-lg font-bold mt-1 mb-3">
              <span className="text-white">Total</span><span className="text-green-400">${totalUsd.toFixed(2)}</span>
            </div>
            {userRole === 'SELLER' ? (
              <button
                onClick={handleSaveInvoice}
                disabled={cart.length === 0 || processing}
                className="w-full py-3.5 rounded-xl bg-green-500 text-white font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {processing ? 'Guardando...' : 'Guardar pre-factura'}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveInvoice}
                  disabled={cart.length === 0 || processing}
                  className="py-3.5 px-4 rounded-xl border border-slate-600 text-slate-300 text-sm disabled:opacity-50"
                >
                  <Clock size={16} />
                </button>
                <button
                  onClick={() => { setPayments([]); setChangeMethodId(null); setPayModalOpen(true); }}
                  disabled={cart.length === 0 || processing}
                  className="flex-1 py-3.5 rounded-xl bg-green-500 text-white font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  Cobrar ${totalUsd.toFixed(2)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tira de agregados (solo en la vista de busqueda) */}
      {mobileView === 'search' && cart.length > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50">
          {/* Cabecera / toggle */}
          <button
            onClick={() => setCartStripCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-4 py-2"
          >
            <span className="text-xs font-semibold text-slate-300">En esta factura ({cart.length})</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              ${totalUsd.toFixed(2)}
              {cartStripCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {/* Lista de items (expandida) */}
          {!cartStripCollapsed && (
            <div className="max-h-44 overflow-y-auto px-3 pb-2 space-y-1.5">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/40 rounded-lg px-2 py-1.5">
                  <span className="flex-1 min-w-0 text-xs text-white truncate" title={item.name}>{item.name}</span>
                  <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 rounded-md bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                    <Minus size={12} />
                  </button>
                  <QtyInput
                    value={item.quantity}
                    onCommit={(q) => setQuantity(item.productId, q)}
                    className="w-12 text-center text-xs font-semibold text-white bg-slate-700/60 border border-slate-600 rounded-md px-1 py-1 focus:outline-none focus:border-green-500/50"
                  />
                  <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 rounded-md bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                    <Plus size={12} />
                  </button>
                  <span className="w-14 text-right text-xs font-bold text-green-400">
                    ${(item.unitPrice * item.quantity * (1 - (item.discountPct || 0) / 100)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Guardar pre-factura + Ir a cobrar */}
          <div className="px-3 pb-2 flex gap-2">
            <button
              onClick={handleSaveInvoice}
              disabled={cart.length === 0 || processing}
              className="shrink-0 py-2.5 px-3 rounded-xl border border-slate-600 text-slate-200 font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              <Clock size={16} /> {processing ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => setMobileView('cart')}
              className="flex-1 py-2.5 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <ShoppingCart size={16} /> Ir a cobrar — ${totalUsd.toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Mobile options bottom sheet */}
      {mobileOptionsOpen && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOptionsOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 rounded-t-2xl p-4 pb-8 z-50 animate-in slide-in-from-bottom safe-area-bottom">
            <div className="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-4" />
            <div className="space-y-1">
              <button onClick={() => { setMobileOptionsOpen(false); setShowCustomerSearch(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-slate-200 hover:bg-slate-700/50 active:bg-slate-700/70">
                <User size={18} className="text-blue-400" /> Seleccionar cliente
              </button>
              <button onClick={() => { setMobileOptionsOpen(false); fetchPending(); setPendingDrawerOpen(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-slate-200 hover:bg-slate-700/50 active:bg-slate-700/70">
                <Clock size={18} className="text-amber-400" /> Facturas en espera
                {pendingCount > 0 && <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-black">{pendingCount}</span>}
              </button>
              <button onClick={() => { setMobileOptionsOpen(false); handleSaveQuotation(); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-slate-200 hover:bg-slate-700/50 active:bg-slate-700/70">
                <FileCheck size={18} className="text-cyan-400" /> Guardar cotizacion
              </button>
              <button onClick={() => { setMobileOptionsOpen(false); fetchCashRegisters(); setShowCashModal(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-slate-200 hover:bg-slate-700/50 active:bg-slate-700/70">
                <Monitor size={18} className="text-green-400" /> Cambiar caja
              </button>
              {canSelectSeller && (
                <button onClick={() => { setMobileOptionsOpen(false); setShowSellerModal(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-slate-200 hover:bg-slate-700/50 active:bg-slate-700/70">
                  <User size={18} className="text-violet-400" /> Cambiar vendedor
                  {selectedSellerId && sellers.length > 0 && (
                    <span className="ml-auto text-xs text-slate-500">{sellers.find(s => s.id === selectedSellerId)?.name || ''}</span>
                  )}
                </button>
              )}
            </div>
            <button onClick={() => setMobileOptionsOpen(false)} className="w-full mt-3 py-3 rounded-xl border border-slate-600 text-slate-400 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Shared Modals (rendered in both mobile & desktop) ─────────────────
  const renderSharedModals = () => (
    <>
      {/* Payment Modal — full-screen on mobile */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex md:items-start md:justify-center md:pt-4 md:px-4">
          <div className="hidden md:block fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPayModalOpen(false)} />
          <div className="relative bg-slate-800 w-full h-full md:h-auto md:border md:border-slate-700 md:rounded-2xl md:shadow-2xl md:max-w-2xl md:max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 px-4 md:px-6 py-4 flex items-center justify-between md:rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-bold text-white">Cobrar Factura</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-sm text-green-400 font-medium">${grandTotalUsd.toFixed(2)} USD</span>
                  <span className="text-sm text-slate-400">Bs {grandTotalBs.toFixed(2)}</span>
                  <span className="text-xs text-slate-500">Tasa: {exchangeRate.toFixed(2)}</span>
                </div>
              </div>
              <button onClick={() => setPayModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>

            <div className="p-4 md:p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Metodos de Pago</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {paymentMethods.filter(pm => pm.isActive && pm.id !== 'pm_saldo_favor').map(pm => (
                    pm.children && pm.children.filter(c => c.isActive).length > 0 ? (
                      <div key={pm.id} className="relative">
                        <button
                          onClick={() => setExpandedGroup(expandedGroup === pm.id ? null : pm.id)}
                          className={`w-full px-3 py-3 md:py-2 rounded-lg border text-xs transition-colors ${expandedGroup === pm.id ? 'border-green-500/40 bg-green-500/10 text-white' : 'border-slate-600 hover:border-green-500/40 hover:bg-green-500/5 text-slate-300 hover:text-white'}`}
                        >
                          {pm.name} ▾
                        </button>
                        {expandedGroup === pm.id && (
                          <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                            {pm.children.filter(c => c.isActive).map(child => (
                              <button
                                key={child.id}
                                onClick={() => addPayment(child)}
                                className="w-full px-3 py-3 md:py-2 text-xs text-slate-300 hover:bg-green-500/10 hover:text-white text-left transition-colors"
                              >
                                {child.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        key={pm.id}
                        onClick={() => addPayment(pm)}
                        className="px-3 py-3 md:py-2 rounded-lg border border-slate-600 hover:border-green-500/40 hover:bg-green-500/5 text-xs text-slate-300 hover:text-white transition-colors"
                      >
                        {pm.name}
                      </button>
                    )
                  ))}
                </div>
              </div>

              {/* Credit balance banner */}
              {creditBalance?.hasBalance && remaining > 0.01 && !payments.some(p => p.methodId === 'pm_saldo_favor') && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div>
                    <span className="text-sm text-green-300 font-medium">Saldo a favor del cliente</span>
                    <div className="text-xs text-green-400/70 mt-0.5">
                      ${creditBalance.totalUsd.toFixed(2)} USD / Bs {creditBalance.totalBs.toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const useAmount = Math.min(creditBalance.totalUsd, remaining);
                      setPayments(prev => [...prev, {
                        methodId: 'pm_saldo_favor',
                        methodName: 'Saldo a Favor',
                        isDivisa: true,
                        amountUsd: Math.round(useAmount * 100) / 100,
                        amountBs: Math.round(useAmount * exchangeRate * 100) / 100,
                        reference: '',
                      }]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-medium hover:bg-green-500/30 transition-colors"
                  >
                    Usar saldo
                  </button>
                </div>
              )}

              {payments.length > 0 && (
                <div className="space-y-3">
                  {payments.map((p, idx) => (
                    <div key={idx} className="card p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white font-medium">{p.methodName}</span>
                        <button onClick={() => removePayment(idx)} className="text-slate-500 hover:text-red-400"><X size={14} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-slate-500">USD</label>
                          <MoneyInput
                            value={p.amountUsd}
                            onChange={n => updatePayment(idx, 'amountUsd', n)}
                            className="input-field !py-2.5 md:!py-1.5 text-sm"
                            readOnly={!p.isDivisa}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Bs</label>
                          <MoneyInput
                            value={p.amountBs}
                            onChange={n => updatePayment(idx, 'amountBs', n)}
                            className="input-field !py-2.5 md:!py-1.5 text-sm"
                            readOnly={p.isDivisa}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Referencia{p.createsReceivable && <span className="text-red-400"> *</span>}</label>
                          <input
                            type="text"
                            value={p.reference}
                            onChange={e => updatePayment(idx, 'reference', e.target.value)}
                            className={`input-field !py-2.5 md:!py-1.5 text-sm ${p.createsReceivable && !p.reference.trim() ? '!border-red-500/70 focus:!border-red-500' : ''}`}
                            placeholder={p.createsReceivable ? 'Obligatoria' : 'Opcional'}
                          />
                          {p.createsReceivable && !p.reference.trim() && (
                            <p className="text-[11px] text-red-400 mt-1">Referencia obligatoria para credito</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Invoice Summary */}
              <div className="card p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Subtotal</span>
                  <div className="text-right">
                    <span className="text-white">${subtotalUsd.toFixed(2)}</span>
                    <span className="text-slate-500 text-xs ml-2">Bs {(subtotalUsd * exchangeRate).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">IVA</span>
                  <div className="text-right">
                    <span className="text-white">${totalIva.toFixed(2)}</span>
                    <span className="text-slate-500 text-xs ml-2">Bs {(totalIva * exchangeRate).toFixed(2)}</span>
                  </div>
                </div>
                {igtfUsd > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-400">IGTF ({companyConfig?.igtfPct || 3}%)</span>
                    <div className="text-right">
                      <span className="text-amber-400">${igtfUsd.toFixed(2)}</span>
                      <span className="text-amber-400/60 text-xs ml-2">Bs {igtfBs.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-slate-700/50 pt-1">
                  <span className="text-slate-300">Total</span>
                  <div className="text-right">
                    <span className="text-green-400">${grandTotalUsd.toFixed(2)}</span>
                    <span className="text-slate-400 text-xs ml-2">Bs {grandTotalBs.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Pendiente / Vuelto */}
              {!hasChange ? (
                <div className="card p-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">Pendiente por cobrar</span>
                  <span className={`text-lg font-bold ${remaining <= 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
                    ${Math.max(0, remaining).toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-300 uppercase tracking-wider">Vuelto</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-amber-400">${changeUsd.toFixed(2)}</span>
                      <span className="text-slate-400 mx-2">×</span>
                      <span className="text-sm text-slate-400">{exchangeRate.toFixed(2)} Bs/$</span>
                      <span className="text-slate-400 mx-2">=</span>
                      <span className="text-lg font-bold text-amber-300">Bs {changeBsCalc.toFixed(2)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Metodo de vuelto</label>
                    <select
                      value={changeMethodId || ''}
                      onChange={e => setChangeMethodId(e.target.value || null)}
                      className="input-field !py-2 text-sm w-full"
                    >
                      <option value="">Seleccionar metodo...</option>
                      {paymentMethods
                        .flatMap(pm => pm.children && pm.children.filter(c => c.isActive).length > 0 ? pm.children.filter(c => c.isActive) : [pm])
                        .filter(pm => !pm.isDivisa && pm.isActive)
                        .map(pm => (
                          <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={processing || (!hasChange && remaining > 0.01) || (hasChange && !changeMethodId) || hasMissingCxcReference}
                  className="btn-primary !py-3 md:!py-2.5 text-sm flex items-center gap-2 disabled:opacity-50 w-full md:w-auto justify-center"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <DollarSign size={16} />}
                  Confirmar cobro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Modal — full-screen on mobile */}
      {creditModalOpen && (
        <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:px-4">
          <div className="hidden md:block fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCreditModalOpen(false)} />
          <div className="relative bg-slate-800 w-full h-full md:h-auto md:border md:border-slate-700 md:rounded-2xl md:shadow-2xl md:max-w-md overflow-y-auto">
            <div className="px-4 md:px-6 pt-5 pb-4">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <CreditCard size={20} className="text-blue-400" />
                    Factura a Credito
                  </h2>
                  <div className="flex gap-4 mt-1">
                    <span className="text-sm text-green-400 font-medium">${grandTotalUsd.toFixed(2)} USD</span>
                    <span className="text-sm text-slate-400">Bs {grandTotalBs.toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={() => setCreditModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
                  <X size={18} />
                </button>
              </div>

              {!customerId && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
                  Debe asignar un cliente para facturar a credito. No se puede facturar a credito como consumidor final.
                </div>
              )}

              {customerId && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm mb-4">
                  Cliente: <span className="font-medium text-white">{customerName}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block flex items-center gap-1.5">
                    <Lock size={14} /> Clave de autorizacion
                  </label>
                  <input
                    type="password"
                    value={creditAuthPassword}
                    onChange={e => setCreditAuthPassword(e.target.value)}
                    className="input-field !py-3 md:!py-2"
                    placeholder="Ingrese la clave de autorizacion"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">Dias de credito</label>
                  <input
                    type="number"
                    value={creditDays}
                    onChange={e => setCreditDays(Number(e.target.value))}
                    className="input-field !py-3 md:!py-2"
                    min="1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button onClick={() => setCreditModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmCredit}
                  disabled={processing || !customerId || !creditAuthPassword}
                  className="!py-3 md:!py-2.5 text-sm flex items-center gap-2 disabled:opacity-50 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 transition-colors"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
                  Confirmar credito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Client Modal — full-screen on mobile */}
      {(showCreateClient || showEditClient) && (
        <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:px-4">
          <div className="hidden md:block fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowCreateClient(false); setShowEditClient(false); }} />
          <div className="relative bg-slate-800 w-full h-full md:h-auto md:border md:border-slate-700 md:rounded-2xl md:shadow-2xl md:max-w-md overflow-y-auto">
            <div className="px-4 md:px-6 pt-5 pb-4">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">{showEditClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                <button onClick={() => { setShowCreateClient(false); setShowEditClient(false); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="w-20">
                    <label className="text-xs text-slate-500 mb-1 block">Tipo</label>
                    <select
                      value={clientForm.documentType}
                      onChange={e => setClientForm(f => ({ ...f, documentType: e.target.value }))}
                      className="input-field !py-3 md:!py-2 text-sm"
                    >
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">RIF / Documento</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={clientForm.rif}
                        onChange={e => setClientForm(f => ({ ...f, rif: e.target.value }))}
                        className="input-field !py-3 md:!py-2 text-sm flex-1"
                        placeholder="12345678"
                      />
                      <button
                        type="button"
                        onClick={() => setSeniatOpen(true)}
                        className="btn-secondary !py-2 text-xs flex items-center gap-1 whitespace-nowrap"
                        title="Consultar SENIAT"
                      >
                        <Search size={13} />
                        SENIAT
                      </button>
                    </div>
                  </div>
                </div>
                {clientRifWarning && (
                  <div className="p-2.5 rounded-lg border text-xs bg-amber-500/10 border-amber-500/20 text-amber-400 flex flex-col gap-2">
                    <span>{clientRifWarning}</span>
                    {clientRifMatch && !showEditClient && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(clientRifMatch.id);
                          setCustomerName(clientRifMatch.name);
                          setShowCreateClient(false);
                          setShowCustomerSearch(false);
                          setCustomerSearch('');
                          setClientRifWarning('');
                          setClientRifMatch(null);
                        }}
                        className="self-start px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium hover:bg-amber-500/30 transition-colors"
                      >
                        Usar este cliente
                      </button>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Nombre completo</label>
                  <input
                    type="text"
                    value={clientForm.name}
                    onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))}
                    className="input-field !py-3 md:!py-2 text-sm"
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Direccion</label>
                  <input
                    type="text"
                    value={clientForm.address}
                    onChange={e => setClientForm(f => ({ ...f, address: e.target.value }))}
                    className="input-field !py-3 md:!py-2 text-sm"
                    placeholder="Direccion"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Telefono</label>
                  <input
                    type="text"
                    value={clientForm.phone}
                    onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))}
                    className="input-field !py-3 md:!py-2 text-sm"
                    placeholder="0414-1234567"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowCreateClient(false); setShowEditClient(false); }} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={() => handleSaveClient(showEditClient)}
                  disabled={savingClient || !clientForm.name.trim()}
                  className="btn-primary !py-3 md:!py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {savingClient && <Loader2 className="animate-spin" size={14} />}
                  {showEditClient ? 'Guardar cambios' : 'Guardar y seleccionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seller Selection Modal — full-screen on mobile */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:px-4">
          <div className="hidden md:block fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSellerModal(false)} />
          <div className="relative bg-slate-800 w-full h-full md:h-auto md:border md:border-slate-700 md:rounded-2xl md:shadow-2xl md:max-w-sm overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Seleccionar Vendedor</h2>
              <button onClick={() => setShowSellerModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-2 space-y-1">
              <button
                onClick={() => { setSelectedSellerId(null); setShowSellerModal(false); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl transition-colors ${!selectedSellerId ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'hover:bg-slate-700/40 active:bg-slate-700/60 text-slate-300'}`}
              >
                <p className="text-sm font-medium">Sin vendedor</p>
              </button>
              {sellers.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSellerId(s.id); setShowSellerModal(false); }}
                  className={`w-full text-left px-4 py-3.5 rounded-xl transition-colors ${selectedSellerId === s.id ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'hover:bg-slate-700/40 active:bg-slate-700/60 text-slate-300'}`}
                >
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.code}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Customer Search Modal — full-screen on mobile */}
      {showCustomerSearch && isMobile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-800 md:hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3">
            <button onClick={() => { setShowCustomerSearch(false); setCustomerSearch(''); setCustomerResults([]); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-white">Seleccionar Cliente</h2>
          </div>
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, RIF..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="input-field pl-9 !py-3 text-base w-full"
                  autoFocus
                />
              </div>
              <button
                onClick={() => {
                  openCreateClient();
                  setShowCustomerSearch(false);
                  setCustomerSearch('');
                }}
                title="Crear nuevo cliente"
                className="shrink-0 w-12 h-12 rounded-xl bg-green-500 text-white flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-green-500/20"
              >
                <Plus size={22} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {customerResults.length > 0 ? (
              <div className="space-y-1">
                {customerResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setCustomerSearch('');
                      setCustomerResults([]);
                      setShowCustomerSearch(false);
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-xl hover:bg-slate-700/40 active:bg-slate-700/60 transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    {c.rif && <p className="text-xs text-slate-500 mt-0.5">{c.documentType || 'V'}-{c.rif}</p>}
                  </button>
                ))}
              </div>
            ) : customerSearch.trim() ? (
              <p className="text-center text-slate-500 text-sm py-8">No se encontraron clientes</p>
            ) : (
              <p className="text-center text-slate-500 text-sm py-8">Escribe para buscar clientes</p>
            )}
          </div>
          <div className="px-4 py-3 border-t border-slate-700/50">
            <button
              onClick={() => {
                openCreateClient();
                setShowCustomerSearch(false);
                setCustomerSearch('');
              }}
              className="w-full py-3 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium flex items-center justify-center gap-2 active:bg-green-500/20"
            >
              <Plus size={16} /> Crear nuevo cliente
            </button>
          </div>
        </div>
      )}

      {/* Aviso (no bloqueante): la factura quedaria con el cliente por defecto */}
      {showCustomerReminder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl max-w-sm w-full p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <User size={18} className="text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Cliente no asignado</h3>
                <p className="text-sm text-slate-300 mt-1">
                  Esta factura se va a aparcar con el{' '}
                  <span className="font-semibold text-amber-300">cliente por defecto</span>. ¿Deseas asignarle un cliente?
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowCustomerReminder(false); doSaveInvoice(); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-700/50 transition-colors"
              >
                No, aparcar asi
              </button>
              <button
                onClick={goAssignCustomer}
                className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors"
              >
                Si, asignar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invoices Drawer — full-screen on mobile */}
      {pendingDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden md:block flex-1 bg-black/50" onClick={() => setPendingDrawerOpen(false)} />
          <div className="w-full md:max-w-md bg-slate-800 md:border-l md:border-slate-700 flex flex-col shadow-2xl">
            <div className="px-4 md:px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PanelRightOpen size={18} className="text-amber-400" />
                <h2 className="text-lg font-bold text-white">Facturas en espera</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400">{visiblePendingInvoices.length}</span>
              </div>
              <button onClick={() => setPendingDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>

            {mySellerId && (
              <div className="px-4 md:px-5 py-2.5 border-b border-slate-700/50 flex gap-2">
                <button
                  onClick={() => setPendingFilterMine(true)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${pendingFilterMine ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-slate-700/30 text-slate-400 border border-transparent hover:bg-slate-700/50'}`}
                >
                  Mis facturas
                </button>
                <button
                  onClick={() => setPendingFilterMine(false)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${!pendingFilterMine ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-slate-700/30 text-slate-400 border border-transparent hover:bg-slate-700/50'}`}
                >
                  Todas
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {visiblePendingInvoices.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-sm">{mySellerId && pendingFilterMine ? 'No tienes facturas en espera' : 'No hay facturas en espera'}</div>
              ) : visiblePendingInvoices.map(inv => {
                const lockedByOther = inv.lockedById && inv.lockedById !== userId;
                const lockedByMe = inv.lockedById && inv.lockedById === userId;
                return (
                <div key={inv.id} className={`card p-4 space-y-2 ${lockedByOther ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-green-400">{inv.number || 'Sin numero'}</span>
                    <span className="text-xs text-slate-500">{timeAgo(inv.createdAt)}</span>
                  </div>
                  {(lockedByOther || lockedByMe) && (
                    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${lockedByOther ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                      <Lock size={11} />
                      {lockedByOther ? `Editando: ${inv.lockedByName || 'otro usuario'}` : 'Editando por ti'}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-slate-500" />
                    <span className="text-sm text-slate-300">{inv.customer?.name || 'Sin cliente'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserCheck size={12} className="text-slate-500" />
                    <span className="text-xs text-slate-400">{inv.seller?.name || 'Sin vendedor'}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {inv.items?.slice(0, 2).map((it: any, i: number) => (
                      <span key={i}>{it.productName} x{it.quantity}{i < 1 && inv.items.length > 1 ? ', ' : ''}</span>
                    ))}
                    {(inv.totalItems || inv.items?.length || 0) > 2 && (
                      <span className="text-slate-600"> y {(inv.totalItems || inv.items?.length || 0) - 2} mas</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                    <span className="text-sm font-bold text-white">${inv.totalUsd?.toFixed(2)}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (cart.length > 0) { setConfirmRetake(inv.id); } else { retakeInvoice(inv); }
                        }}
                        disabled={!!lockedByOther}
                        className="px-3 py-2 md:py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-500/10"
                      >
                        Retomar
                      </button>
                      <button
                        onClick={() => setConfirmCancel(inv.id)}
                        disabled={!!lockedByOther}
                        className="px-3 py-2 md:py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-500/10"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Confirm retake */}
                  {confirmRetake === inv.id && (
                    <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-amber-300 mb-2">Descartar la venta actual y retomar esta factura?</p>
                      <div className="flex gap-2">
                        <button onClick={() => retakeInvoice(inv)} className="px-3 py-1 rounded text-xs font-medium bg-amber-500 text-black hover:bg-amber-400">Si, retomar</button>
                        <button onClick={() => setConfirmRetake(null)} className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white">No</button>
                      </div>
                    </div>
                  )}

                  {/* Confirm delete */}
                  {confirmCancel === inv.id && (
                    <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-red-300 mb-2">Eliminar esta factura?</p>
                      <div className="flex gap-2">
                        <button onClick={() => deletePendingInvoice(inv.id)} className="px-3 py-1 rounded text-xs font-medium bg-red-500 text-white hover:bg-red-400">Si, eliminar</button>
                        <button onClick={() => setConfirmCancel(null)} className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white">No</button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <SeniatModal
        isOpen={seniatOpen}
        onClose={() => setSeniatOpen(false)}
        onResult={handleSeniatResult}
        initialRif={clientForm.rif ? `${clientForm.documentType}${clientForm.rif.replace(/\D/g, '')}` : ''}
      />
    </>
  );

  // ── Unified return with modals ──────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {renderMobileLayout()}
        {renderSharedModals()}
      </>
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
          {selectedCashRegister && (
            <button
              onClick={() => { fetchCashRegisters(); setShowCashModal(true); }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-700/60 border border-slate-600 text-slate-300 hover:border-green-500/30 hover:text-white transition-colors"
              title="Cambiar caja"
            >
              <ArrowRightLeft size={12} />
              {selectedCashRegister.name}
            </button>
          )}
          {exchangeRate > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
              Tasa: Bs {exchangeRate.toFixed(2)}
            </span>
          )}
          {/* Pending invoices button */}
          <button
            onClick={() => { fetchPending(); setPendingDrawerOpen(true); }}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 hover:border-amber-500/40 hover:bg-amber-500/5 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <Clock size={16} className="text-amber-400" />
            En espera
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-black min-w-[20px] text-center">{pendingCount}</span>
            )}
          </button>
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

          {scannerActive && (
            <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
            </div>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="card mb-3 max-h-80 overflow-y-auto">
            {searchResults.map(product => {
              const prodStock = product.stock?.[0]?.quantity || 0;
              const blockNoStock = companyConfig?.allowNegativeStock === false && prodStock <= 0;
              return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={blockNoStock}
                className={`w-full flex items-center justify-between px-4 py-3 border-b border-slate-700/30 last:border-0 text-left transition-colors ${blockNoStock ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700/40'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">{product.code}{product.supplierRef ? ` - ${product.supplierRef}` : ''}</span>
                    <span className="text-sm text-white font-medium truncate">{product.name}</span>
                  </div>
                  {product.barcode && <span className="text-xs text-slate-600">CB: {product.barcode}</span>}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-400">${product.priceDetal?.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">Bs {(product.priceDetal * exchangeRate).toFixed(2)}</div>
                  </div>
                  {blockNoStock ? (
                    <span className="text-xs px-2 py-0.5 rounded-full text-red-400 bg-red-500/10 border border-red-500/20 font-medium">Sin stock</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${prodStock > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                      Stock: {prodStock}
                    </span>
                  )}
                  <Plus size={18} className={blockNoStock ? 'text-slate-600' : 'text-green-400'} />
                </div>
              </button>
              );
            })}
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
                    {creditBalance?.hasBalance && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                        Saldo: ${creditBalance.totalUsd.toFixed(2)}
                      </span>
                    )}
                    {!customerIsDefault && (
                      <button
                        onClick={toggleSpecialTaxpayer}
                        title="Contribuyente especial: el sistema generará la retención de IVA al facturar a crédito"
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                          customerIsSpecial
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                            : 'bg-slate-700/40 border-slate-600 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {customerIsSpecial ? '✓ Especial' : 'Contrib.?'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedCashRegister?.sessions?.[0] && (
                      <button
                        onClick={() => { setAdvanceMethodId(''); setAdvanceAmount(''); setAdvanceReference(''); setAdvanceNotes(''); setAdvanceModalOpen(true); }}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                        title="Registrar anticipo"
                      >
                        + Anticipo
                      </button>
                    )}
                    <button onClick={openEditClient} className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-blue-400" title="Editar cliente">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { setCustomerId(null); setCustomerName(''); }} className="p-1 rounded hover:bg-slate-600 text-slate-500 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={customerSearchInputRef}
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
                            {c.name} {c.rif && <span className="text-slate-500 text-xs">({c.documentType || 'V'}-{c.rif})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={openCreateClient}
                    className="p-2 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    title="Crear cliente"
                  >
                    <Plus size={18} />
                  </button>
                </div>
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
                  <p className="text-sm text-white line-clamp-2 leading-tight" title={item.name}>{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {editingPriceItemId === item.productId ? (
                      <input
                        type="number"
                        value={editingPriceValue}
                        onChange={e => setEditingPriceValue(e.target.value)}
                        onBlur={() => confirmPriceOverride(item.productId)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmPriceOverride(item.productId); if (e.key === 'Escape') setEditingPriceItemId(null); }}
                        className="w-20 px-1.5 py-0.5 rounded bg-slate-800 border border-green-500/50 text-xs text-green-400 text-right focus:outline-none"
                        step="0.01"
                        min="0"
                        autoFocus
                      />
                    ) : (
                      <span className="text-xs text-green-400">${item.unitPrice.toFixed(2)}</span>
                    )}
                    {canOverridePrice && editingPriceItemId !== item.productId && (
                      <button
                        onClick={() => { setEditingPriceItemId(item.productId); setEditingPriceValue(item.unitPrice.toString()); }}
                        className="text-slate-600 hover:text-slate-400"
                        title="Modificar precio"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    )}
                    {item.priceOverridden && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Precio modificado</span>
                    )}
                    <span className="text-xs text-slate-600">{IVA_LABELS[item.ivaType]}</span>
                    <div className="flex items-center gap-0.5 ml-1">
                      <Percent size={10} className="text-slate-600" />
                      <input
                        type="number"
                        value={item.discountPct || ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          const pct = isNaN(v) ? 0 : Math.min(100, Math.max(0, v));
                          setCart(prev => prev.map(c => c.productId === item.productId ? { ...c, discountPct: pct } : c));
                        }}
                        placeholder="0"
                        className="w-12 px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-orange-400 text-right focus:outline-none focus:border-orange-500/50"
                        step="0.5"
                        min="0"
                        max="100"
                      />
                    </div>
                    {item.discountPct > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">-{item.discountPct}%</span>
                    )}
                  </div>
                  {companyConfig?.allowNegativeStock === false && item.quantity > item.stock && (
                    <p className="text-[10px] text-red-400 mt-0.5">Stock disponible: {item.stock}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 rounded hover:bg-slate-600 text-slate-400">
                    <Minus size={14} />
                  </button>
                  <QtyInput
                    value={item.quantity}
                    onCommit={(q) => setQuantity(item.productId, q)}
                    className="w-14 text-center text-sm text-white font-medium bg-slate-800 border border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:border-green-500/50"
                  />
                  <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 rounded hover:bg-slate-600 text-slate-400">
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-sm text-white font-medium w-16 text-right">
                  ${(item.unitPrice * item.quantity * (1 - (item.discountPct || 0) / 100)).toFixed(2)}
                </span>
                <button onClick={() => removeItem(item.productId)} className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Seller section */}
          {(userSellerName || canSelectSeller) && (
            <div className="px-3 py-2 border-t border-slate-700/50">
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-500" />
                {canSelectSeller ? (
                  <select
                    value={selectedSellerId || ''}
                    onChange={e => setSelectedSellerId(e.target.value || null)}
                    className="input-field !py-1 !text-xs flex-1"
                  >
                    <option value="">Sin vendedor</option>
                    {sellers.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400">Vendedor: <span className="text-white">{userSellerName}</span></span>
                )}
              </div>
            </div>
          )}

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
              <button
                onClick={handleSaveQuotation}
                disabled={cart.length === 0 || processing}
                className="btn-secondary !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                title="Guardar cotizacion"
              >
                <FileCheck size={16} />
              </button>
              {userRole === 'SELLER' ? (
                <button
                  onClick={handleSaveInvoice}
                  disabled={cart.length === 0 || processing}
                  className="btn-primary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <ShoppingCart size={16} />}
                  Guardar pre-factura
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveInvoice}
                    disabled={cart.length === 0 || processing}
                    className="btn-secondary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="animate-spin" size={16} /> : <Clock size={16} />}
                    Aparcar
                  </button>
                  <button
                    onClick={() => { setPayments([]); setChangeMethodId(null); setPayModalOpen(true); }}
                    disabled={cart.length === 0 || processing}
                    className="btn-primary flex-1 !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <DollarSign size={16} /> Cobrar
                  </button>
                  <button
                    onClick={() => { setCreditAuthPassword(''); setCreditDays(30); setCreditModalOpen(true); }}
                    disabled={cart.length === 0 || processing}
                    className="!py-3 px-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    title="Facturar a credito"
                  >
                    <CreditCard size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {renderSharedModals()}

      {/* Anticipo Modal */}
      {advanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAdvanceModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-semibold text-slate-100">Registrar Anticipo</h2>
              <button onClick={() => setAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-400">
                Cliente: <span className="text-white font-medium">{customerName}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto USD *</label>
                  <input type="number" value={advanceAmount} onChange={e => {
                    const usd = e.target.value;
                    setAdvanceAmount(usd);
                    setAdvanceAmountBs(usd && exchangeRate > 0 ? (Number(usd) * exchangeRate).toFixed(2) : '');
                  }} step="0.01" min="0.01"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Monto Bs</label>
                  <input type="number" value={advanceAmountBs} onChange={e => {
                    const bs = e.target.value;
                    setAdvanceAmountBs(bs);
                    setAdvanceAmount(bs && exchangeRate > 0 ? (Number(bs) / exchangeRate).toFixed(2) : '');
                  }} step="0.01" min="0.01"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="0.00" />
                  {exchangeRate > 0 && <p className="text-xs text-slate-500 mt-1">Tasa: {exchangeRate.toFixed(2)} Bs/$</p>}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Metodo de pago *</label>
                <select value={advanceMethodId} onChange={e => setAdvanceMethodId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="">Seleccionar...</option>
                  {paymentMethods.filter(pm => pm.isActive && pm.id !== 'pm_saldo_favor').map(pm => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Referencia</label>
                <input type="text" value={advanceReference} onChange={e => setAdvanceReference(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="Opcional" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notas</label>
                <input type="text" value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="Opcional" />
              </div>
              <button
                onClick={submitAdvance}
                disabled={!advanceAmount || Number(advanceAmount) <= 0 || !advanceMethodId || savingAdvance}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 transition-colors"
              >
                {savingAdvance ? 'Guardando...' : 'Registrar Anticipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
