'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HandCoins, Loader2, Save, Search, X, Plus, Pencil, Shield } from 'lucide-react';
import CustomerFormModal from '@/components/customer-form-modal';

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
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NewReceivablePage() {
  const router = useRouter();

  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [userName, setUserName] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);

  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<'create' | 'edit'>('create');
  const [serieId, setSerieId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [originalDate, setOriginalDate] = useState(formatLocalDate(new Date()));
  const [receptionDate, setReceptionDate] = useState(formatLocalDate(new Date()));
  const [creditDays, setCreditDays] = useState(0);
  const [dueDate, setDueDate] = useState(formatLocalDate(new Date()));

  const [exemptBase, setExemptBase] = useState(0);
  const [taxableBase8, setTaxableBase8] = useState(0);
  const [taxableBase16, setTaxableBase16] = useState(0);
  const [taxableBase31, setTaxableBase31] = useState(0);
  const [igtfPct, setIgtfPct] = useState(0);

  // Retencion de IVA sufrida (cliente contribuyente especial) — solo series fiscales
  const [createRetention, setCreateRetention] = useState(false);
  const [retentionPct, setRetentionPct] = useState(75);
  const [retentionDocNumber, setRetentionDocNumber] = useState('');

  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = 'Nueva CxC | Trinity ERP'; }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [rateRes, custRes, seriesRes, configRes, profileRes] = await Promise.all([
          fetch('/api/proxy/exchange-rate/today'),
          fetch('/api/proxy/customers?limit=1000'),
          fetch('/api/proxy/series?type=SALES'),
          fetch('/api/proxy/company-config'),
          fetch('/api/auth/me'),
        ]);
        if (rateRes.ok) { const d = await rateRes.json(); setExchangeRate(d.rate || 0); }
        if (custRes.ok) { const d = await custRes.json(); setCustomers(Array.isArray(d.data) ? d.data : []); }
        if (seriesRes.ok) {
          const d = await seriesRes.json();
          const arr = Array.isArray(d) ? d : Array.isArray(d.data) ? d.data : [];
          setSeries(arr.filter((s: Serie) => s.isActive));
        }
        if (configRes.ok) { const d = await configRes.json(); const p = d.ivaRetentionPct ?? 75; setRetentionPct(p); }
        if (profileRes.ok) { const d = await profileRes.json(); setUserName(d.name || d.email || ''); }
      } catch { setError('Error cargando datos iniciales'); }
      finally { setLoadingInit(false); }
    }
    fetchData();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const [y, m, d] = originalDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    setDueDate(formatLocalDate(addDays(base, creditDays)));
  }, [creditDays, originalDate]);

  function openNewCustomer() { setCustomerModalMode('create'); setCustomerModalOpen(true); }
  function openEditCustomer() { if (customerId) { setCustomerModalMode('edit'); setCustomerModalOpen(true); } }

  // Tras crear/editar un cliente: refrescar la lista y seleccionar el guardado (si fue creado/editado).
  async function handleCustomerSaved(saved: any) {
    try {
      const res = await fetch('/api/proxy/customers?limit=1000');
      if (res.ok) { const d = await res.json(); setCustomers(Array.isArray(d.data) ? d.data : []); }
    } catch { /* ignore */ }
    if (saved?.id) { setCustomerId(saved.id); setCustomerSearch(''); setCustomerDropdownOpen(false); }
    setCustomerModalOpen(false);
  }

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(q) || (c.rif && c.rif.toLowerCase().includes(q)));
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId]);
  const selectedSerie = useMemo(() => series.find(s => s.id === serieId), [series, serieId]);
  const isFiscal = selectedSerie?.isFiscal ?? false;

  const iva8 = useMemo(() => Math.round(taxableBase8 * 0.08 * 100) / 100, [taxableBase8]);
  const iva16 = useMemo(() => Math.round(taxableBase16 * 0.16 * 100) / 100, [taxableBase16]);
  const iva31 = useMemo(() => Math.round(taxableBase31 * 0.31 * 100) / 100, [taxableBase31]);
  const totalIva = useMemo(() => Math.round((iva8 + iva16 + iva31) * 100) / 100, [iva8, iva16, iva31]);
  const subtotal = useMemo(() => Math.round((exemptBase + taxableBase8 + taxableBase16 + taxableBase31 + totalIva) * 100) / 100, [exemptBase, taxableBase8, taxableBase16, taxableBase31, totalIva]);
  const igtfAmount = useMemo(() => Math.round(subtotal * (igtfPct / 100) * 100) / 100, [subtotal, igtfPct]);
  const totalDoc = useMemo(() => Math.round((subtotal + igtfAmount) * 100) / 100, [subtotal, igtfAmount]);

  const altTotal = useMemo(() => {
    if (!exchangeRate || exchangeRate === 0) return 0;
    return currency === 'USD' ? Math.round(totalDoc * exchangeRate * 100) / 100 : Math.round((totalDoc / exchangeRate) * 100) / 100;
  }, [totalDoc, exchangeRate, currency]);

  const sym = currency === 'USD' ? '$' : 'Bs';
  const retentionAmount = useMemo(() => createRetention ? Math.round(totalIva * (retentionPct / 100) * 100) / 100 : 0, [createRetention, totalIva, retentionPct]);
  const retentionAmountBs = useMemo(() => {
    if (!exchangeRate || !createRetention) return 0;
    return currency === 'USD' ? Math.round(retentionAmount * exchangeRate * 100) / 100 : retentionAmount;
  }, [retentionAmount, exchangeRate, currency, createRetention]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!customerId) { setError('Debe seleccionar un cliente'); return; }
    if (!description.trim()) { setError('La descripcion es obligatoria'); return; }
    if (totalDoc <= 0) { setError('El total del documento debe ser mayor a 0'); return; }
    if (!exchangeRate || exchangeRate <= 0) { setError('La tasa del dia debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      const pt = creditDays > 0 ? `CREDITO_${creditDays}` : 'CONTADO';
      const body: Record<string, unknown> = {
        customerId, totalAmount: totalDoc, currency, paymentTerms: pt,
        exchangeRate,
        exemptBase: exemptBase || 0, taxableBase8: taxableBase8 || 0,
        taxableBase16: taxableBase16 || 0, taxableBase31: taxableBase31 || 0,
        igtfPct: igtfPct || 0,
      };
      if (serieId) body.serieId = serieId;
      if (documentNumber.trim()) body.documentNumber = documentNumber.trim();
      if (originalDate) body.originalDate = originalDate;
      if (receptionDate) body.receptionDate = receptionDate;
      if (dueDate) body.dueDate = dueDate;
      if (description.trim()) body.description = description.trim();
      if (notes.trim()) body.notes = notes.trim();
      // Retencion de IVA sufrida: solo tiene sentido en serie fiscal con IVA
      if (createRetention && isFiscal && totalIva > 0) {
        body.createRetention = true;
        body.retentionPct = retentionPct;
        if (retentionDocNumber.trim()) body.retentionDocNumber = retentionDocNumber.trim();
      }

      const res = await fetch('/api/proxy/receivables', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error al crear'); }
      const created = await res.json();
      router.push(`/receivables/${created.id}`);
    } catch (err: any) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }, [customerId, totalDoc, currency, serieId, documentNumber, creditDays, exchangeRate, exemptBase, taxableBase8, taxableBase16, taxableBase31, igtfPct, originalDate, receptionDate, dueDate, description, notes, createRetention, isFiscal, totalIva, retentionPct, retentionDocNumber, router]);

  const numInput = useCallback((setter: (v: number) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => { setter(parseFloat(e.target.value) || 0); };
  }, []);

  if (loadingInit) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/receivables')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <HandCoins className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nueva Cuenta por Cobrar</h1>
          <p className="text-slate-400 text-sm">
            Registra un documento de cuenta por cobrar
            {isFiscal && <span className="ml-2 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded font-bold">Fiscal</span>}
          </p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm border bg-red-500/10 text-red-400 border-red-500/20">{error}</div>
      )}

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

        {/* === COLUMNA IZQUIERDA === */}
        <div className="space-y-4">
          <div className="card p-6 relative z-20">
            {/* ARRIBA: Cliente, Serie, Responsable, Descripcion */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:2fr_1fr_1fr] gap-4">
              {/* Col 1: Cliente + Descripcion */}
              <div className="space-y-1.5">
                <div ref={customerRef} className="relative">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-[10px] font-medium text-slate-400">Cliente *</label>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={openNewCustomer}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors">
                        <Plus size={11} /> Nuevo
                      </button>
                      <button type="button" onClick={openEditCustomer} disabled={!customerId}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <Pencil size={11} /> Editar
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text"
                      value={customerDropdownOpen ? customerSearch : (selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.rif ? ` (${selectedCustomer.documentType}-${selectedCustomer.rif})` : ''}` : '')}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerDropdownOpen(true); }}
                      onFocus={() => { setCustomerDropdownOpen(true); setCustomerSearch(''); }}
                      className="input-field !py-1 text-sm pl-9"
                      placeholder="Buscar por nombre o RIF..."
                    />
                    {customerId && !customerDropdownOpen && (
                      <button type="button" onClick={() => { setCustomerId(''); setCustomerSearch(''); setCustomerDropdownOpen(true); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {customerDropdownOpen && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-slate-400">Sin resultados</div>
                      ) : (
                        filteredCustomers.slice(0, 30).map(c => (
                          <button key={c.id} type="button"
                            onClick={() => { setCustomerId(c.id); setCustomerDropdownOpen(false); setCustomerSearch(''); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors ${c.id === customerId ? 'bg-green-500/10 text-green-400' : 'text-white'}`}>
                            <span className="font-medium">{c.name}</span>
                            {c.rif && <span className="ml-2 text-slate-400 text-xs">{c.documentType}-{c.rif}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Descripcion *</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Ej: Factura servicio tecnico, Alquiler local..."
                    className="input-field !py-1 text-sm" />
                </div>
              </div>

              {/* Col 2: Nro. Documento + Serie + Notas */}
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Nro. Documento</label>
                  <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                    placeholder="N° de la factura" className="input-field !py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Serie</label>
                  <select value={serieId} onChange={e => setSerieId(e.target.value)} className="input-field !py-1 text-sm">
                    <option value="">Sin serie</option>
                    {series.map(s => <option key={s.id} value={s.id}>{s.name} {s.isFiscal ? '(Fiscal)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Notas</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Notas adicionales..."
                    className="input-field !py-1 text-sm" />
                </div>
              </div>

              {/* Col 3: Responsable */}
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Responsable</label>
                  <input type="text" value={userName} readOnly tabIndex={-1}
                    className="input-field !py-1 text-sm bg-slate-900/60 text-slate-500 cursor-not-allowed" />
                </div>
              </div>
            </div>

            {/* ABAJO: Todas las fechas + forma de pago + tasa */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-3 pt-3 border-t border-slate-700/50">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Fecha original</label>
                <input type="date" value={originalDate} onChange={e => {
                  const d = e.target.value;
                  setOriginalDate(d);
                  if (d) {
                    fetch(`/api/proxy/exchange-rate/by-date?date=${d}`)
                      .then(r => r.ok ? r.json() : null)
                      .then(data => { if (data?.rate) setExchangeRate(data.rate); })
                      .catch(() => {});
                  }
                }} className="input-field !py-1 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Fecha recepcion</label>
                <input type="date" value={receptionDate} onChange={e => setReceptionDate(e.target.value)} className="input-field !py-1 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Dias de credito</label>
                <input type="number" min="0" value={creditDays || ''} onChange={e => setCreditDays(parseInt(e.target.value) || 0)}
                  placeholder="0" className="input-field !py-1 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Fecha vencimiento</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-field !py-1 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Tasa del dia</label>
                <input type="number" step="0.01" min="0" value={exchangeRate || ''} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                  placeholder="0.00" className="input-field !py-1 text-sm font-mono" />
              </div>
            </div>
          </div>
        </div>

        {/* === COLUMNA DERECHA: Montos (sticky) === */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <div className="card p-6">
            {/* Currency toggle at top */}
            <div className="mb-4">
              <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Moneda</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                <button type="button" onClick={() => setCurrency('USD')}
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  USD
                </button>
                <button type="button" onClick={() => setCurrency('BS')}
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${currency === 'BS' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  Bs
                </button>
              </div>
            </div>

            <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">Desglose ({currency})</h3>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">Base exenta</span>
                <input type="number" step="0.01" min="0" value={exemptBase || ''} onChange={numInput(setExemptBase)}
                  placeholder="0.00" className="input-field !py-0.5 text-sm font-mono flex-1" />
                <span className="w-16" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">Base 8%</span>
                <input type="number" step="0.01" min="0" value={taxableBase8 || ''} onChange={numInput(setTaxableBase8)}
                  placeholder="0.00" className="input-field !py-0.5 text-sm font-mono flex-1" />
                <span className="w-16 text-right text-[10px] font-mono text-cyan-400">{fmt(iva8)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">Base 16%</span>
                <input type="number" step="0.01" min="0" value={taxableBase16 || ''} onChange={numInput(setTaxableBase16)}
                  placeholder="0.00" className="input-field !py-0.5 text-sm font-mono flex-1" />
                <span className="w-16 text-right text-[10px] font-mono text-cyan-400">{fmt(iva16)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">Base 31%</span>
                <input type="number" step="0.01" min="0" value={taxableBase31 || ''} onChange={numInput(setTaxableBase31)}
                  placeholder="0.00" className="input-field !py-0.5 text-sm font-mono flex-1" />
                <span className="w-16 text-right text-[10px] font-mono text-cyan-400">{fmt(iva31)}</span>
              </div>
              <div className="border-t border-slate-700/50 pt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">IVA total</span>
                <div className="flex-1" />
                <span className="w-16 text-right text-sm font-mono font-semibold text-cyan-400">{fmt(totalIva)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-20 shrink-0">IGTF</span>
                <div className="flex items-center gap-1 flex-1">
                  <input type="number" step="0.01" min="0" value={igtfPct || ''} onChange={numInput(setIgtfPct)}
                    placeholder="0" className="input-field !py-0.5 text-sm font-mono w-14 text-center" />
                  <span className="text-[10px] text-slate-500">%</span>
                </div>
                <span className="w-16 text-right text-[10px] font-mono text-orange-400">{fmt(igtfAmount)}</span>
              </div>
            </div>

            {/* Total */}
            <div className="mt-4 pt-3 border-t border-slate-700/50">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-medium text-slate-400">Total {currency}</span>
                <span className="text-xl font-bold text-green-400 font-mono">
                  {currency === 'USD' ? '$' : 'Bs'} {fmt(totalDoc)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-slate-500">Total {currency === 'USD' ? 'Bs' : 'USD'}</span>
                <span className="text-sm font-semibold text-blue-400 font-mono">
                  {currency === 'USD' ? 'Bs' : '$'} {fmt(altTotal)}
                </span>
              </div>
            </div>

          </div>

          {/* Retencion IVA sufrida (solo fiscal) */}
          {isFiscal && (
            <div className="card p-6 border-orange-500/30">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="text-orange-400" size={14} />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={createRetention} onChange={e => setCreateRetention(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-orange-500 focus:ring-orange-500" />
                  <span className="text-xs font-medium text-slate-300">Crear retencion IVA</span>
                </label>
              </div>
              {createRetention && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-24 shrink-0">% Retencion</span>
                    <input type="number" min={0} max={100} step={0.01} value={retentionPct} onChange={numInput(setRetentionPct)}
                      className="input-field !py-0.5 text-sm font-mono w-20 text-center" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-0.5">N° del comprobante (documento del cliente)</label>
                    <input type="text" value={retentionDocNumber} onChange={e => setRetentionDocNumber(e.target.value)}
                      placeholder="Ej: 20260700000001" className="input-field !py-1 text-sm font-mono" />
                    <p className="text-[10px] text-slate-500 mt-0.5">Se registra en el libro de ventas.</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">IVA facturado</span>
                    <span className="text-xs font-mono text-cyan-400">{sym} {fmt(totalIva)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">IVA retenido</span>
                    <span className="text-sm font-mono text-orange-400 font-semibold">{sym} {fmt(retentionAmount)}</span>
                  </div>
                  {currency === 'USD' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">IVA retenido Bs</span>
                      <span className="text-xs font-mono text-orange-300">Bs {fmt(retentionAmountBs)}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-700/50">Declara la retencion en el libro de ventas (linea negativa). No modifica el monto de la CxC.</p>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit}
            disabled={saving || !customerId || totalDoc <= 0 || !description.trim()}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors text-sm">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Guardar CxC
          </button>
        </div>
      </div>

      {/* Modal crear/editar cliente (mismo patron que la compra con proveedores) */}
      <CustomerFormModal
        open={customerModalOpen}
        mode={customerModalMode}
        customerId={customerModalMode === 'edit' ? customerId : null}
        onClose={() => setCustomerModalOpen(false)}
        onSaved={handleCustomerSaved}
      />
    </div>
  );
}
