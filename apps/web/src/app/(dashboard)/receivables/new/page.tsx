'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HandCoins, Loader2, Save, Calculator } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  documentType: string;
  rif: string | null;
}

interface Serie {
  id: string;
  name: string;
  prefix: string;
  type: string;
  isFiscal: boolean;
  isActive: boolean;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return result;
}

export default function NewReceivablePage() {
  const router = useRouter();

  // Data fetching state
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [serieId, setSerieId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [originalDate, setOriginalDate] = useState(formatLocalDate(new Date()));
  const [receptionDate, setReceptionDate] = useState(formatLocalDate(new Date()));
  const [paymentTerms, setPaymentTerms] = useState('CONTADO');
  const [creditDays, setCreditDays] = useState(0);
  const [dueDate, setDueDate] = useState(formatLocalDate(new Date()));

  // Fiscal breakdown
  const [exemptBase, setExemptBase] = useState(0);
  const [taxableBase8, setTaxableBase8] = useState(0);
  const [taxableBase16, setTaxableBase16] = useState(0);
  const [taxableBase31, setTaxableBase31] = useState(0);
  const [igtfPct, setIgtfPct] = useState(0);

  // Additional
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Set page title
  useEffect(() => {
    document.title = 'Nueva CxC | Trinity ERP';
  }, []);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [rateRes, custRes, seriesRes] = await Promise.all([
          fetch('/api/proxy/exchange-rate/today'),
          fetch('/api/proxy/customers?limit=1000'),
          fetch('/api/proxy/series?type=SALES'),
        ]);

        if (rateRes.ok) {
          const rateData = await rateRes.json();
          setExchangeRate(rateData.rate || 0);
        }

        if (custRes.ok) {
          const custData = await custRes.json();
          setCustomers(Array.isArray(custData.data) ? custData.data : []);
        }

        if (seriesRes.ok) {
          const seriesData = await seriesRes.json();
          const arr = Array.isArray(seriesData) ? seriesData : Array.isArray(seriesData.data) ? seriesData.data : [];
          setSeries(arr.filter((s: Serie) => s.isActive));
        }
      } catch {
        setError('Error cargando datos iniciales');
      } finally {
        setLoadingInit(false);
      }
    }
    fetchData();
  }, []);

  // Auto-calculate due date from receptionDate + creditDays
  useEffect(() => {
    const days = paymentTerms === 'CONTADO' ? 0 : creditDays;
    const [y, m, d] = receptionDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const due = addDays(base, days);
    setDueDate(formatLocalDate(due));
  }, [paymentTerms, creditDays, receptionDate]);

  // Filtered customers for searchable select
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.rif && c.rif.toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

  // Selected customer display
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  // Selected serie
  const selectedSerie = useMemo(
    () => series.find((s) => s.id === serieId),
    [series, serieId]
  );

  const isFiscal = selectedSerie?.isFiscal ?? false;

  // Fiscal calculations
  const iva8 = useMemo(() => Math.round(taxableBase8 * 0.08 * 100) / 100, [taxableBase8]);
  const iva16 = useMemo(() => Math.round(taxableBase16 * 0.16 * 100) / 100, [taxableBase16]);
  const iva31 = useMemo(() => Math.round(taxableBase31 * 0.31 * 100) / 100, [taxableBase31]);
  const totalIva = useMemo(() => Math.round((iva8 + iva16 + iva31) * 100) / 100, [iva8, iva16, iva31]);

  const taxableBaseTotal = useMemo(
    () => Math.round((taxableBase8 + taxableBase16 + taxableBase31) * 100) / 100,
    [taxableBase8, taxableBase16, taxableBase31]
  );

  const subtotal = useMemo(
    () => Math.round((exemptBase + taxableBase8 + taxableBase16 + taxableBase31 + totalIva) * 100) / 100,
    [exemptBase, taxableBase8, taxableBase16, taxableBase31, totalIva]
  );

  const igtfAmount = useMemo(
    () => Math.round(subtotal * (igtfPct / 100) * 100) / 100,
    [subtotal, igtfPct]
  );

  const totalDoc = useMemo(
    () => Math.round((subtotal + igtfAmount) * 100) / 100,
    [subtotal, igtfAmount]
  );

  const altCurrencyTotal = useMemo(() => {
    if (!exchangeRate || exchangeRate === 0) return 0;
    if (currency === 'USD') {
      return Math.round(totalDoc * exchangeRate * 100) / 100;
    }
    return Math.round((totalDoc / exchangeRate) * 100) / 100;
  }, [totalDoc, exchangeRate, currency]);

  const altCurrencyLabel = currency === 'USD' ? 'Bs' : 'USD';
  const altCurrencySymbol = currency === 'USD' ? 'Bs' : '$';

  // Handle customer selection
  const handleSelectCustomer = useCallback((customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  }, []);

  // Handle form submit
  const handleSubmit = useCallback(async () => {
    setError('');

    if (!customerId) {
      setError('Debe seleccionar un cliente');
      return;
    }
    if (!description.trim()) {
      setError('La descripcion es obligatoria');
      return;
    }
    if (totalDoc <= 0) {
      setError('El total del documento debe ser mayor a 0');
      return;
    }

    setSaving(true);
    try {
      const effectivePaymentTerms = paymentTerms === 'CREDITO' ? `CREDITO_${creditDays}` : 'CONTADO';
      const body: Record<string, unknown> = {
        customerId,
        totalAmount: totalDoc,
        currency,
        paymentTerms: effectivePaymentTerms,
        exemptBase: exemptBase || 0,
        taxableBase8: taxableBase8 || 0,
        taxableBase16: taxableBase16 || 0,
        taxableBase31: taxableBase31 || 0,
        igtfPct: igtfPct || 0,
      };

      if (serieId) body.serieId = serieId;
      if (originalDate) body.originalDate = originalDate;
      if (receptionDate) body.receptionDate = receptionDate;
      if (dueDate) body.dueDate = dueDate;
      if (description.trim()) body.description = description.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch('/api/proxy/receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al crear la cuenta por cobrar');
      }

      const created = await res.json();
      router.push(`/receivables/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [
    customerId, totalDoc, currency, serieId, paymentTerms, creditDays,
    exemptBase, taxableBase8, taxableBase16, taxableBase31, igtfPct,
    originalDate, receptionDate, dueDate,
    description, notes, router,
  ]);

  // Number input handler
  const handleNumberInput = useCallback((setter: (v: number) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setter(isNaN(val) ? 0 : val);
    };
  }, []);

  if (loadingInit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/receivables')}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <HandCoins className="text-green-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Nueva Cuenta por Cobrar</h1>
            <p className="text-slate-400 text-sm">Registro manual de CxC</p>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Section: Datos del Documento */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Datos del Documento
          </h2>

          {/* Row 1: Customer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Searchable customer select */}
            <div className="relative md:col-span-2">
              <label className="text-sm text-slate-400 mb-1 block">Cliente *</label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                  if (!e.target.value.trim()) setCustomerId('');
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="Buscar cliente por nombre o RIF..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              {showCustomerDropdown && filteredCustomers.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg max-h-60 overflow-y-auto shadow-xl">
                  {filteredCustomers.slice(0, 50).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors text-sm ${
                        c.id === customerId ? 'bg-green-500/10 text-green-400' : 'text-slate-200'
                      }`}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.rif && (
                        <span className="text-slate-500 ml-2 text-xs">
                          {c.documentType}-{c.rif}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer && (
                <p className="text-xs text-green-400 mt-1">
                  {selectedCustomer.documentType}-{selectedCustomer.rif || 'S/N'}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">Serie</label>
              <select
                value={serieId}
                onChange={(e) => setSerieId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Sin serie (no fiscal)</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isFiscal ? '(Fiscal)' : ''}
                  </option>
                ))}
              </select>
              {selectedSerie && (
                <p className={`text-xs mt-1 ${isFiscal ? 'text-green-400' : 'text-slate-500'}`}>
                  {isFiscal ? 'Serie fiscal — genera asiento en libro de ventas' : 'Serie no fiscal'}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Moneda, Tasa */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="USD">USD - Dolares</option>
                <option value="BS">BS - Bolivares</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">Tasa del dia</label>
              <input
                type="text"
                value={exchangeRate ? `Bs ${exchangeRate.toFixed(2)}` : 'Sin tasa'}
                readOnly
                tabIndex={-1}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
              />
            </div>

          </div>
        </div>

        {/* Section: Fechas y Forma de Pago */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Fechas y Forma de Pago
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Fecha Original</label>
              <input
                type="date"
                value={originalDate}
                onChange={(e) => setOriginalDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">Fecha Recepcion</label>
              <input
                type="date"
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">Forma de Pago</label>
              <div className="flex gap-2">
                <select
                  value={paymentTerms}
                  onChange={(e) => {
                    setPaymentTerms(e.target.value);
                    if (e.target.value === 'CONTADO') setCreditDays(0);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Credito</option>
                </select>
                {paymentTerms === 'CREDITO' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={creditDays || ''}
                      onChange={(e) => setCreditDays(parseInt(e.target.value) || 0)}
                      placeholder="dias"
                      className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-center"
                    />
                    <span className="text-sm text-slate-400">dias</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Fecha Vencimiento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        </div>

        {/* Section: Montos del Documento */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Calculator size={16} className="text-green-400" />
              Montos del Documento
            </h2>

            <div className="space-y-3">
              {/* Base exenta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Base exenta</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={exemptBase || ''}
                    onChange={handleNumberInput(setExemptBase)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                  />
                </div>
                <div />
              </div>

              {/* Base imponible 8% */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Base imponible 8%</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxableBase8 || ''}
                    onChange={handleNumberInput(setTaxableBase8)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">IVA 8%</label>
                  <input
                    type="text"
                    value={iva8.toFixed(2)}
                    readOnly
                    tabIndex={-1}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              {/* Base imponible 16% */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Base imponible 16%</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxableBase16 || ''}
                    onChange={handleNumberInput(setTaxableBase16)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">IVA 16%</label>
                  <input
                    type="text"
                    value={iva16.toFixed(2)}
                    readOnly
                    tabIndex={-1}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              {/* Base imponible 31% */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">Base imponible 31%</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxableBase31 || ''}
                    onChange={handleNumberInput(setTaxableBase31)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1 block">IVA 31%</label>
                  <input
                    type="text"
                    value={iva31.toFixed(2)}
                    readOnly
                    tabIndex={-1}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              {/* Totals row */}
              <div className="border-t border-slate-700/50 pt-3 mt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">Base imponible total</label>
                    <input
                      type="text"
                      value={taxableBaseTotal.toFixed(2)}
                      readOnly
                      tabIndex={-1}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-1 block">IVA total</label>
                    <input
                      type="text"
                      value={totalIva.toFixed(2)}
                      readOnly
                      tabIndex={-1}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
        </div>

        {/* Section: Totales */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Totales
          </h2>

          <div className="space-y-4">
            {/* IGTF */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">IGTF %</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={igtfPct || ''}
                  onChange={handleNumberInput(setIgtfPct)}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">IGTF monto</label>
                <input
                  type="text"
                  value={igtfAmount.toFixed(2)}
                  readOnly
                  tabIndex={-1}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed font-mono"
                />
              </div>
            </div>

            {/* Total documento */}
            <div className="border-t border-slate-700/50 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total documento ({currency})</p>
                  <p className="text-3xl font-bold text-green-400 font-mono">
                    {currency === 'USD' ? '$' : 'Bs'} {totalDoc.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400 mb-1">Total en {altCurrencyLabel}</p>
                  <p className="text-xl font-semibold text-blue-400 font-mono">
                    {altCurrencySymbol} {altCurrencyTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Adicional */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Adicional
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Descripcion *</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Factura de servicio tecnico, Alquiler local mes junio..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas adicionales..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={saving || !customerId || totalDoc <= 0 || !description.trim()}
            className="bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-6 py-2.5 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            Guardar CxC
          </button>
        </div>
      </div>

      {/* Click outside handler for customer dropdown */}
      {showCustomerDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowCustomerDropdown(false)}
        />
      )}
    </div>
  );
}
