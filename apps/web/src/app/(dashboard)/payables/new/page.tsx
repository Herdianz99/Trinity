'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Receipt, Loader2, Save, Calculator, Shield } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
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

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return result;
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NewPayablePage() {
  const router = useRouter();

  // Fetched data
  const [exchangeRate, setExchangeRate] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [defaultRetentionPct, setDefaultRetentionPct] = useState(75);
  const [loadingInit, setLoadingInit] = useState(true);

  // Form fields - Datos del Documento
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [serieId, setSerieId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [controlFiscal, setControlFiscal] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Fechas y Forma de Pago
  const [originalDate, setOriginalDate] = useState(localDateStr(new Date()));
  const [receptionDate, setReceptionDate] = useState(localDateStr(new Date()));
  const [paymentTerms, setPaymentTerms] = useState('CONTADO');
  const [creditDays, setCreditDays] = useState(0);
  const [dueDate, setDueDate] = useState(localDateStr(new Date()));

  // Desglose Fiscal
  const [exemptBase, setExemptBase] = useState(0);
  const [taxableBase8, setTaxableBase8] = useState(0);
  const [taxableBase16, setTaxableBase16] = useState(0);
  const [taxableBase31, setTaxableBase31] = useState(0);

  // Totales
  const [igtfPct, setIgtfPct] = useState(0);

  // Retencion
  const [createRetention, setCreateRetention] = useState(false);
  const [retentionPct, setRetentionPct] = useState(75);

  // Adicional
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Set page title
  useEffect(() => {
    document.title = 'Nueva CxP | Trinity ERP';
  }, []);

  // Fetch initial data
  const fetchInitData = useCallback(async () => {
    setLoadingInit(true);
    try {
      const [rateRes, supRes, seriesRes, configRes] = await Promise.all([
        fetch('/api/proxy/exchange-rate/today'),
        fetch('/api/proxy/suppliers?limit=1000'),
        fetch('/api/proxy/series?type=PURCHASES'),
        fetch('/api/proxy/company-config'),
      ]);

      if (rateRes.ok) {
        const rateData = await rateRes.json();
        setExchangeRate(rateData.rate || 0);
      }

      if (supRes.ok) {
        const supData = await supRes.json();
        setSuppliers(Array.isArray(supData.data) ? supData.data : Array.isArray(supData) ? supData : []);
      }

      if (seriesRes.ok) {
        const seriesData = await seriesRes.json();
        const arr = Array.isArray(seriesData) ? seriesData : Array.isArray(seriesData.data) ? seriesData.data : [];
        setSeries(arr.filter((s: Serie) => s.isActive));
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        const pct = configData.ivaRetentionPct ?? 75;
        setDefaultRetentionPct(pct);
        setRetentionPct(pct);
      }
    } catch (err: any) {
      setError('Error al cargar datos iniciales');
    } finally {
      setLoadingInit(false);
    }
  }, []);

  useEffect(() => {
    fetchInitData();
  }, [fetchInitData]);

  // Auto-calculate due date from receptionDate + creditDays
  useEffect(() => {
    const days = paymentTerms === 'CONTADO' ? 0 : creditDays;
    const [y, m, d] = receptionDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const result = addDays(base, days);
    setDueDate(localDateStr(result));
  }, [paymentTerms, creditDays, receptionDate]);

  // Filtered suppliers for searchable select
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.rif && s.rif.toLowerCase().includes(q))
    );
  }, [suppliers, supplierSearch]);

  // Selected supplier name
  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === supplierId);
  }, [suppliers, supplierId]);

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

  const totalTaxableBase = useMemo(
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

  // Retention calculations
  const retentionIvaAmount = useMemo(
    () => createRetention ? Math.round(totalIva * (retentionPct / 100) * 100) / 100 : 0,
    [createRetention, totalIva, retentionPct]
  );

  const retentionIvaBs = useMemo(() => {
    if (!exchangeRate || exchangeRate === 0 || !createRetention) return 0;
    if (currency === 'USD') return Math.round(retentionIvaAmount * exchangeRate * 100) / 100;
    return retentionIvaAmount;
  }, [retentionIvaAmount, exchangeRate, currency, createRetention]);

  const altCurrencyTotal = useMemo(() => {
    if (!exchangeRate || exchangeRate === 0) return 0;
    if (currency === 'USD') {
      return Math.round(totalDoc * exchangeRate * 100) / 100;
    } else {
      return Math.round((totalDoc / exchangeRate) * 100) / 100;
    }
  }, [totalDoc, exchangeRate, currency]);

  const altCurrencyLabel = currency === 'USD' ? 'Bs' : 'USD';
  const currencySymbol = currency === 'USD' ? '$' : 'Bs';

  // Submit handler
  async function handleSubmit() {
    if (!supplierId) {
      setError('Debe seleccionar un proveedor');
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
    setError('');

    try {
      const effectivePaymentTerms = paymentTerms === 'CREDITO' ? `CREDITO_${creditDays}` : 'CONTADO';
      const body: Record<string, any> = {
        supplierId,
        totalAmount: totalDoc,
        currency,
      };

      if (serieId) body.serieId = serieId;
      if (documentNumber.trim()) body.documentNumber = documentNumber.trim();
      if (controlFiscal.trim()) body.controlFiscal = controlFiscal.trim();
      if (originalDate) body.originalDate = originalDate;
      if (receptionDate) body.receptionDate = receptionDate;
      if (effectivePaymentTerms) body.paymentTerms = effectivePaymentTerms;
      if (dueDate) body.dueDate = dueDate;
      if (exemptBase > 0) body.exemptBase = exemptBase;
      if (taxableBase8 > 0) body.taxableBase8 = taxableBase8;
      if (taxableBase16 > 0) body.taxableBase16 = taxableBase16;
      if (taxableBase31 > 0) body.taxableBase31 = taxableBase31;
      if (igtfPct > 0) body.igtfPct = igtfPct;
      if (createRetention && isFiscal) {
        body.createRetention = true;
        body.retentionPct = retentionPct;
      }
      if (description.trim()) body.description = description.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch('/api/proxy/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al crear la cuenta por pagar');
      }

      const created = await res.json();
      router.push(`/payables/${created.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Number input handler helper
  function handleNumberInput(setter: (v: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setter(isNaN(val) ? 0 : val);
    };
  }

  const inputClass =
    'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-red-500';
  const readonlyClass =
    'w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 cursor-not-allowed';
  const labelClass = 'block text-sm text-slate-400 mb-1';
  const sectionHeaderClass = 'text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3';
  const cardClass = 'bg-slate-800/50 border border-slate-700/50 rounded-xl p-5';

  if (loadingInit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/payables')}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <Receipt className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Nueva Cuenta por Pagar</h1>
            <p className="text-slate-400 text-sm">Crear CxP manual con desglose fiscal</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Section: Datos del Documento */}
      <div className={cardClass}>
        <h3 className={sectionHeaderClass}>Datos del Documento</h3>

        {/* Row 1: Proveedor, Serie */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Searchable Supplier Select */}
          <div className="relative md:col-span-2">
            <label className={labelClass}>Proveedor *</label>
            <input
              type="text"
              value={supplierId ? (selectedSupplier ? `${selectedSupplier.name}${selectedSupplier.rif ? ` (${selectedSupplier.rif})` : ''}` : '') : supplierSearch}
              onChange={(e) => {
                setSupplierSearch(e.target.value);
                setSupplierId('');
                setShowSupplierDropdown(true);
              }}
              onFocus={() => setShowSupplierDropdown(true)}
              placeholder="Buscar proveedor..."
              className={inputClass}
            />
            {showSupplierDropdown && !supplierId && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {filteredSuppliers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">Sin resultados</div>
                ) : (
                  filteredSuppliers.slice(0, 50).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierSearch('');
                        setShowSupplierDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      {s.name}
                      {s.rif && <span className="text-slate-500 ml-2">({s.rif})</span>}
                    </button>
                  ))
                )}
              </div>
            )}
            {/* Close dropdown on click outside */}
            {showSupplierDropdown && !supplierId && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSupplierDropdown(false)}
              />
            )}
          </div>

          <div>
            <label className={labelClass}>Serie</label>
            <select
              value={serieId}
              onChange={(e) => setSerieId(e.target.value)}
              className={inputClass}
            >
              <option value="">Sin serie (no fiscal)</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isFiscal ? '(Fiscal)' : ''}
                </option>
              ))}
            </select>
            {selectedSerie && (
              <p className={`text-xs mt-1 ${isFiscal ? 'text-red-400' : 'text-slate-500'}`}>
                {isFiscal ? 'Serie fiscal — genera asiento en libro de compras' : 'Serie no fiscal'}
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Nro. Documento, Control Fiscal, Moneda */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClass}>Nro. Documento</label>
            <input
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="Ej: FAC-00123"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Control Fiscal</label>
            <input
              type="text"
              value={controlFiscal}
              onChange={(e) => setControlFiscal(e.target.value)}
              placeholder="Ej: 00-12345678"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Moneda</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              <option value="USD">USD - Dolares</option>
              <option value="BS">BS - Bolivares</option>
            </select>
          </div>
        </div>

        {/* Row 3: Tasa, Correlativo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Tasa del dia</label>
            <input
              type="text"
              value={exchangeRate ? `Bs ${fmt(exchangeRate)}` : 'Sin tasa'}
              readOnly
              tabIndex={-1}
              className={readonlyClass}
            />
          </div>

        </div>
      </div>

      {/* Section: Fechas y Forma de Pago */}
      <div className={cardClass}>
        <h3 className={sectionHeaderClass}>Fechas y Forma de Pago</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClass}>Fecha Original</label>
            <input
              type="date"
              value={originalDate}
              onChange={(e) => setOriginalDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Fecha Recepcion</label>
            <input
              type="date"
              value={receptionDate}
              onChange={(e) => setReceptionDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Forma de Pago</label>
            <div className="flex gap-2">
              <select
                value={paymentTerms}
                onChange={(e) => {
                  setPaymentTerms(e.target.value);
                  if (e.target.value === 'CONTADO') setCreditDays(0);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-center"
                  />
                  <span className="text-sm text-slate-400">dias</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Fecha Vencimiento</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Section: Montos del Documento */}
      <div className={cardClass}>
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="text-slate-400" size={16} />
            <h3 className={`${sectionHeaderClass} mb-0`}>Montos del Documento ({currency})</h3>
          </div>

          <div className="space-y-3">
            {/* Base exenta */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className={labelClass}>Base exenta</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={exemptBase || ''}
                  onChange={handleNumberInput(setExemptBase)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2" />
            </div>

            {/* Base imponible 8% */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className={labelClass}>Base imponible 8%</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={taxableBase8 || ''}
                  onChange={handleNumberInput(setTaxableBase8)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>IVA 8%</label>
                <input
                  type="text"
                  value={fmt(iva8)}
                  readOnly
                  tabIndex={-1}
                  className={`${readonlyClass} font-mono`}
                />
              </div>
            </div>

            {/* Base imponible 16% */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className={labelClass}>Base imponible 16%</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={taxableBase16 || ''}
                  onChange={handleNumberInput(setTaxableBase16)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>IVA 16%</label>
                <input
                  type="text"
                  value={fmt(iva16)}
                  readOnly
                  tabIndex={-1}
                  className={`${readonlyClass} font-mono`}
                />
              </div>
            </div>

            {/* Base imponible 31% */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className={labelClass}>Base imponible 31%</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={taxableBase31 || ''}
                  onChange={handleNumberInput(setTaxableBase31)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>IVA 31%</label>
                <input
                  type="text"
                  value={fmt(iva31)}
                  readOnly
                  tabIndex={-1}
                  className={`${readonlyClass} font-mono`}
                />
              </div>
            </div>

            {/* Totals row */}
            <div className="border-t border-slate-700/50 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className={labelClass}>Base imponible total</label>
                  <input
                    type="text"
                    value={fmt(totalTaxableBase)}
                    readOnly
                    tabIndex={-1}
                    className={`${readonlyClass} font-mono`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>IVA total</label>
                  <input
                    type="text"
                    value={fmt(totalIva)}
                    readOnly
                    tabIndex={-1}
                    className={`${readonlyClass} font-mono`}
                  />
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Section: Totales */}
      <div className={cardClass}>
        <h3 className={sectionHeaderClass}>Totales</h3>

        <div className="space-y-4">
          {/* IGTF row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className={labelClass}>IGTF %</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={igtfPct || ''}
                onChange={handleNumberInput(setIgtfPct)}
                placeholder="0"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>IGTF monto</label>
              <input
                type="text"
                value={fmt(igtfAmount)}
                readOnly
                tabIndex={-1}
                className={`${readonlyClass} font-mono`}
              />
            </div>
          </div>

          {/* Total documento */}
          <div className="border-t border-slate-700/50 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Total documento</label>
                <p className="text-red-400 font-mono font-bold text-2xl">
                  {currencySymbol} {fmt(totalDoc)}
                </p>
              </div>
              <div>
                <label className={labelClass}>Total en {altCurrencyLabel}</label>
                <p className="text-blue-400 font-mono font-semibold text-lg">
                  {altCurrencyLabel === 'Bs' ? 'Bs' : '$'} {fmt(altCurrencyTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Retencion de IVA — only when serie is fiscal */}
      {isFiscal && (
        <div className={`${cardClass} border-orange-500/20`}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="text-orange-400" size={16} />
            <h3 className={`${sectionHeaderClass} mb-0`}>Retencion de IVA</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createRetention}
                onChange={(e) => setCreateRetention(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-300">Crear comprobante de retencion</span>
            </label>

            {createRetention && (
              <div className="space-y-3 pl-6 border-l-2 border-orange-500/30">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className={labelClass}>% Retencion</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={retentionPct}
                      onChange={handleNumberInput(setRetentionPct)}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>IVA facturado ({currencySymbol})</label>
                    <input
                      type="text"
                      value={fmt(totalIva)}
                      readOnly
                      tabIndex={-1}
                      className={`${readonlyClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>IVA retenido ({currencySymbol})</label>
                    <input
                      type="text"
                      value={fmt(retentionIvaAmount)}
                      readOnly
                      tabIndex={-1}
                      className={`${readonlyClass} font-mono text-orange-400`}
                    />
                  </div>
                </div>
                {currency === 'USD' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-start-3">
                      <label className={labelClass}>IVA retenido (Bs)</label>
                      <input
                        type="text"
                        value={`Bs ${fmt(retentionIvaBs)}`}
                        readOnly
                        tabIndex={-1}
                        className={`${readonlyClass} font-mono text-orange-300`}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section: Adicional */}
      <div className={cardClass}>
        <h3 className={sectionHeaderClass}>Adicional</h3>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Descripcion *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Factura compra material electrico, Servicio de transporte..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas adicionales..."
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSubmit}
          disabled={saving || !supplierId || totalDoc <= 0 || !description.trim()}
          className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-6 py-2.5 disabled:opacity-50 flex items-center gap-2 transition-colors"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Guardar CxP
        </button>
      </div>
    </div>
  );
}
