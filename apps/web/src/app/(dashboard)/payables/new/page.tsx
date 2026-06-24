'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Receipt, Loader2, Save, Search, X, Shield } from 'lucide-react';

interface Supplier { id: string; name: string; rif: string | null; }
interface Serie { id: string; name: string; prefix: string; type: string; isFiscal: boolean; isActive: boolean; }

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}
function addDays(d: Date, days: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days); }
function fmt(n: number): string { return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function NewPayablePage() {
  const router = useRouter();

  const [exchangeRate, setExchangeRate] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [userName, setUserName] = useState('');
  const [defaultRetentionPct, setDefaultRetentionPct] = useState(75);
  const [loadingInit, setLoadingInit] = useState(true);

  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [serieId, setSerieId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [controlFiscal, setControlFiscal] = useState('');
  const [serie, setSerie] = useState(''); // serie alfanumerica de la factura del proveedor (ej. "A")
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');

  const [originalDate, setOriginalDate] = useState(localDateStr(new Date()));
  const [receptionDate, setReceptionDate] = useState(localDateStr(new Date()));
  const [creditDays, setCreditDays] = useState(0);
  const [dueDate, setDueDate] = useState(localDateStr(new Date()));

  const [exemptBase, setExemptBase] = useState(0);
  const [taxableBase8, setTaxableBase8] = useState(0);
  const [taxableBase16, setTaxableBase16] = useState(0);
  const [taxableBase31, setTaxableBase31] = useState(0);
  const [igtfPct, setIgtfPct] = useState(0);

  const [createRetention, setCreateRetention] = useState(false);
  const [retentionPct, setRetentionPct] = useState(75);

  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supplierRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = 'Nueva CxP | Trinity ERP'; }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [rateRes, supRes, seriesRes, configRes, profileRes] = await Promise.all([
          fetch('/api/proxy/exchange-rate/today'),
          fetch('/api/proxy/suppliers?limit=1000'),
          fetch('/api/proxy/series?type=PURCHASES'),
          fetch('/api/proxy/company-config'),
          fetch('/api/auth/me'),
        ]);
        if (rateRes.ok) { const d = await rateRes.json(); setExchangeRate(d.rate || 0); }
        if (supRes.ok) { const d = await supRes.json(); setSuppliers(Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : []); }
        if (seriesRes.ok) {
          const d = await seriesRes.json();
          const arr = Array.isArray(d) ? d : Array.isArray(d.data) ? d.data : [];
          setSeries(arr.filter((s: Serie) => s.isActive));
        }
        if (configRes.ok) { const d = await configRes.json(); const p = d.ivaRetentionPct ?? 75; setDefaultRetentionPct(p); setRetentionPct(p); }
        if (profileRes.ok) { const d = await profileRes.json(); setUserName(d.name || d.email || ''); }
      } catch { setError('Error al cargar datos iniciales'); }
      finally { setLoadingInit(false); }
    }
    fetchData();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const [y, m, d] = originalDate.split('-').map(Number);
    setDueDate(localDateStr(addDays(new Date(y, m - 1, d), creditDays)));
  }, [creditDays, originalDate]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q) || (s.rif && s.rif.toLowerCase().includes(q)));
  }, [suppliers, supplierSearch]);

  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId]);
  const selectedSerie = useMemo(() => series.find(s => s.id === serieId), [series, serieId]);
  const isFiscal = selectedSerie?.isFiscal ?? false;

  const iva8 = useMemo(() => Math.round(taxableBase8 * 0.08 * 100) / 100, [taxableBase8]);
  const iva16 = useMemo(() => Math.round(taxableBase16 * 0.16 * 100) / 100, [taxableBase16]);
  const iva31 = useMemo(() => Math.round(taxableBase31 * 0.31 * 100) / 100, [taxableBase31]);
  const totalIva = useMemo(() => Math.round((iva8 + iva16 + iva31) * 100) / 100, [iva8, iva16, iva31]);
  const subtotal = useMemo(() => Math.round((exemptBase + taxableBase8 + taxableBase16 + taxableBase31 + totalIva) * 100) / 100, [exemptBase, taxableBase8, taxableBase16, taxableBase31, totalIva]);
  const igtfAmount = useMemo(() => Math.round(subtotal * (igtfPct / 100) * 100) / 100, [subtotal, igtfPct]);
  const totalDoc = useMemo(() => Math.round((subtotal + igtfAmount) * 100) / 100, [subtotal, igtfAmount]);

  const retentionIvaAmount = useMemo(() => createRetention ? Math.round(totalIva * (retentionPct / 100) * 100) / 100 : 0, [createRetention, totalIva, retentionPct]);
  const retentionIvaBs = useMemo(() => {
    if (!exchangeRate || !createRetention) return 0;
    return currency === 'USD' ? Math.round(retentionIvaAmount * exchangeRate * 100) / 100 : retentionIvaAmount;
  }, [retentionIvaAmount, exchangeRate, currency, createRetention]);

  const altTotal = useMemo(() => {
    if (!exchangeRate) return 0;
    return currency === 'USD' ? Math.round(totalDoc * exchangeRate * 100) / 100 : Math.round((totalDoc / exchangeRate) * 100) / 100;
  }, [totalDoc, exchangeRate, currency]);

  const sym = currency === 'USD' ? '$' : 'Bs';

  async function handleSubmit() {
    if (!supplierId) { setError('Debe seleccionar un proveedor'); return; }
    if (!description.trim()) { setError('La descripcion es obligatoria'); return; }
    if (totalDoc <= 0) { setError('El total del documento debe ser mayor a 0'); return; }
    if (!exchangeRate || exchangeRate <= 0) { setError('La tasa del dia debe ser mayor a 0'); return; }

    setSaving(true); setError('');
    try {
      const pt = creditDays > 0 ? `CREDITO_${creditDays}` : 'CONTADO';
      const body: Record<string, any> = { supplierId, totalAmount: totalDoc, currency, exchangeRate };
      if (serieId) body.serieId = serieId;
      if (documentNumber.trim()) body.documentNumber = documentNumber.trim();
      if (controlFiscal.trim()) body.controlFiscal = controlFiscal.trim();
      if (serie.trim()) body.serie = serie.trim();
      if (originalDate) body.originalDate = originalDate;
      if (receptionDate) body.receptionDate = receptionDate;
      body.paymentTerms = pt;
      if (dueDate) body.dueDate = dueDate;
      if (exemptBase > 0) body.exemptBase = exemptBase;
      if (taxableBase8 > 0) body.taxableBase8 = taxableBase8;
      if (taxableBase16 > 0) body.taxableBase16 = taxableBase16;
      if (taxableBase31 > 0) body.taxableBase31 = taxableBase31;
      if (igtfPct > 0) body.igtfPct = igtfPct;
      if (createRetention && isFiscal) { body.createRetention = true; body.retentionPct = retentionPct; }
      if (description.trim()) body.description = description.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch('/api/proxy/payables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Error al crear'); }
      const created = await res.json();
      router.push(`/payables/${created.id}`);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  const numInput = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => setter(parseFloat(e.target.value) || 0);

  if (loadingInit) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-500" size={32} /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/payables')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <Receipt className="text-red-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nueva Cuenta por Pagar</h1>
          <p className="text-slate-400 text-sm">
            Registra un documento de cuenta por pagar
            {isFiscal && <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded font-bold">Fiscal</span>}
          </p>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-lg text-sm border bg-red-500/10 text-red-400 border-red-500/20">{error}</div>}

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

        {/* === COLUMNA IZQUIERDA === */}
        <div className="space-y-4">
          <div className="card p-6 relative z-20">
            {/* ARRIBA: Proveedor, Nro Doc, Control, Serie, Responsable, Descripcion */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:2fr_1fr_1fr] gap-4">
              {/* Col 1: Proveedor + Descripcion */}
              <div className="space-y-1.5">
                <div ref={supplierRef} className="relative">
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Proveedor *</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text"
                      value={supplierDropdownOpen ? supplierSearch : (selectedSupplier ? `${selectedSupplier.name}${selectedSupplier.rif ? ` (${selectedSupplier.rif})` : ''}` : '')}
                      onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                      onFocus={() => { setSupplierDropdownOpen(true); setSupplierSearch(''); }}
                      className="input-field !py-1 text-sm pl-9"
                      placeholder="Buscar por nombre o RIF..."
                    />
                    {supplierId && !supplierDropdownOpen && (
                      <button type="button" onClick={() => { setSupplierId(''); setSupplierSearch(''); setSupplierDropdownOpen(true); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {supplierDropdownOpen && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filteredSuppliers.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-slate-400">Sin resultados</div>
                      ) : (
                        filteredSuppliers.slice(0, 30).map(s => (
                          <button key={s.id} type="button"
                            onClick={() => { setSupplierId(s.id); setSupplierDropdownOpen(false); setSupplierSearch(''); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors ${s.id === supplierId ? 'bg-red-500/10 text-red-400' : 'text-white'}`}>
                            <span className="font-medium">{s.name}</span>
                            {s.rif && <span className="ml-2 text-slate-400 text-xs">{s.rif}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Descripcion *</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Ej: Factura compra material, Servicio transporte..."
                    className="input-field !py-1 text-sm" />
                </div>
              </div>

              {/* Col 2: Nro Documento + Control Fiscal + Serie */}
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Nro. Documento</label>
                  <input type="text" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                    placeholder="FAC-00123" className="input-field !py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Control Fiscal</label>
                  <input type="text" value={controlFiscal} onChange={e => setControlFiscal(e.target.value)}
                    placeholder="00-12345678" className="input-field !py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Serie (factura proveedor)</label>
                  <input type="text" value={serie} onChange={e => setSerie(e.target.value)}
                    placeholder="A" maxLength={5} className="input-field !py-1 text-sm" />
                </div>
              </div>

              {/* Col 3: Responsable + Notas + Serie fiscal */}
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Responsable</label>
                  <input type="text" value={userName} readOnly tabIndex={-1}
                    className="input-field !py-1 text-sm bg-slate-900/60 text-slate-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Notas</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Notas adicionales..."
                    className="input-field !py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Serie fiscal</label>
                  <select value={serieId} onChange={e => setSerieId(e.target.value)} className="input-field !py-1 text-sm">
                    <option value="">Sin serie</option>
                    {series.map(s => <option key={s.id} value={s.id}>{s.name} {s.isFiscal ? '(Fiscal)' : ''}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ABAJO: Todas las fechas + forma de pago + tasa */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-3 pt-3 border-t border-slate-700/50">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Fecha original</label>
                <input type="date" value={originalDate} onChange={e => setOriginalDate(e.target.value)} className="input-field !py-1 text-sm" />
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
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  USD
                </button>
                <button type="button" onClick={() => setCurrency('BS')}
                  className={`flex-1 py-1 text-sm font-medium transition-colors ${currency === 'BS' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
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
                <span className="text-xl font-bold text-red-400 font-mono">{sym} {fmt(totalDoc)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-slate-500">Total {currency === 'USD' ? 'Bs' : 'USD'}</span>
                <span className="text-sm font-semibold text-blue-400 font-mono">{currency === 'USD' ? 'Bs' : '$'} {fmt(altTotal)}</span>
              </div>
            </div>
          </div>

          {/* Retencion card (solo fiscal) */}
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
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-24 shrink-0">% Retencion</span>
                    <input type="number" min={0} max={100} step={0.01} value={retentionPct} onChange={numInput(setRetentionPct)}
                      className="input-field !py-0.5 text-sm font-mono w-20 text-center" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">IVA facturado</span>
                    <span className="text-xs font-mono text-cyan-400">{sym} {fmt(totalIva)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">IVA retenido</span>
                    <span className="text-sm font-mono text-orange-400 font-semibold">{sym} {fmt(retentionIvaAmount)}</span>
                  </div>
                  {currency === 'USD' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">IVA retenido Bs</span>
                      <span className="text-xs font-mono text-orange-300">Bs {fmt(retentionIvaBs)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit button */}
          <button onClick={handleSubmit}
            disabled={saving || !supplierId || totalDoc <= 0 || !description.trim()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors text-sm">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Guardar CxP
          </button>
        </div>
      </div>
    </div>
  );
}
