'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Save, Loader2, Printer, Eye, EyeOff, Upload, Trash2, ImageIcon } from 'lucide-react';

interface CompanyConfig {
  companyName: string;
  rif: string;
  address: string;
  phone: string;
  email: string;
  bregaGlobalPct: number;
  defaultGananciaPct: number;
  defaultGananciaMayorPct: number;
  defaultWarehouseId: string;
  invoicePrefix: string;
  quotationValidityDays: number;
  overdueWarningDays: number;
  ivaRetentionPct: number;
  islrRetentionPct: number;
  isIGTFContributor: boolean;
  igtfPct: number;
  allowNegativeStock: boolean;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<CompanyConfig>({
    companyName: '',
    rif: '',
    address: '',
    phone: '',
    email: '',
    bregaGlobalPct: 0,
    defaultGananciaPct: 0,
    defaultGananciaMayorPct: 0,
    defaultWarehouseId: '',
    invoicePrefix: 'FAC',
    quotationValidityDays: 30,
    overdueWarningDays: 3,
    ivaRetentionPct: 75,
    islrRetentionPct: 0,
    isIGTFContributor: false,
    igtfPct: 3,
    allowNegativeStock: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Credit auth password
  const [creditAuthPassword, setCreditAuthPassword] = useState('');
  const [showCreditPassword, setShowCreditPassword] = useState(false);

  // Exchange rate state
  const [todayRate, setTodayRate] = useState<{ rate: number; source: string } | null>(null);
  const [rateHistory, setRateHistory] = useState<any[]>([]);
  const [newRate, setNewRate] = useState('');
  const [rateFromBcv, setRateFromBcv] = useState(false);
  const [fetchingBcv, setFetchingBcv] = useState(false);
  const [savingRate, setSavingRate] = useState(false);

  // Logo state
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Print area state
  const [printAreas, setPrintAreas] = useState<{ id: string; name: string }[]>([]);
  const [selectedPrintAreaId, setSelectedPrintAreaId] = useState('');

  useEffect(() => {
    fetchConfig();
    fetchExchangeRate();
    fetchPrintAreas();
    setSelectedPrintAreaId(localStorage.getItem('printAreaId') || '');
  }, []);

  async function fetchPrintAreas() {
    try {
      const res = await fetch('/api/proxy/print-areas');
      if (res.ok) {
        const data = await res.json();
        setPrintAreas(data.filter((a: any) => a.isActive));
      }
    } catch { /* ignore */ }
  }

  function handlePrintAreaChange(id: string) {
    setSelectedPrintAreaId(id);
    if (id) {
      localStorage.setItem('printAreaId', id);
    } else {
      localStorage.removeItem('printAreaId');
    }
    setMessage({ type: 'success', text: 'Area de impresion configurada para esta PC' });
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/api/proxy/config');
      if (res.ok) {
        const data = await res.json();
        setConfig({
          companyName: data.companyName || '',
          rif: data.rif || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          bregaGlobalPct: data.bregaGlobalPct || 0,
          defaultGananciaPct: data.defaultGananciaPct || 0,
          defaultGananciaMayorPct: data.defaultGananciaMayorPct || 0,
          defaultWarehouseId: data.defaultWarehouseId || '',
          invoicePrefix: data.invoicePrefix || 'FAC',
          quotationValidityDays: data.quotationValidityDays || 30,
          overdueWarningDays: data.overdueWarningDays || 3,
          ivaRetentionPct: data.ivaRetentionPct ?? 75,
          islrRetentionPct: data.islrRetentionPct ?? 0,
          isIGTFContributor: data.isIGTFContributor || false,
          igtfPct: data.igtfPct ?? 3,
          allowNegativeStock: data.allowNegativeStock ?? true,
        });
        if (data.logo) {
          setLogo(data.logo);
          setLogoPreview(data.logo);
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar la configuracion' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchExchangeRate() {
    try {
      const [todayRes, historyRes] = await Promise.all([
        fetch('/api/proxy/exchange-rate/today'),
        fetch('/api/proxy/exchange-rate'),
      ]);
      if (todayRes.ok) {
        const text = await todayRes.text();
        if (text) { try { const data = JSON.parse(text); if (data) setTodayRate(data); } catch {} }
      }
      if (historyRes.ok) {
        setRateHistory(await historyRes.json());
      }
    } catch { /* ignore */ }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/proxy/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: config.companyName,
          rif: config.rif || undefined,
          address: config.address || undefined,
          phone: config.phone || undefined,
          email: config.email || undefined,
          bregaGlobalPct: Number(config.bregaGlobalPct),
          defaultGananciaPct: Number(config.defaultGananciaPct),
          defaultGananciaMayorPct: Number(config.defaultGananciaMayorPct),
          invoicePrefix: config.invoicePrefix,
          quotationValidityDays: Number(config.quotationValidityDays),
          overdueWarningDays: Number(config.overdueWarningDays),
          ivaRetentionPct: Number(config.ivaRetentionPct),
          islrRetentionPct: Number(config.islrRetentionPct),
          isIGTFContributor: config.isIGTFContributor,
          igtfPct: Number(config.igtfPct),
          allowNegativeStock: config.allowNegativeStock,
          ...(creditAuthPassword ? { creditAuthPassword } : {}),
          ...(logoChanged ? { logo } : {}),
        }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuracion guardada exitosamente' });
      } else {
        throw new Error('Error al guardar');
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al guardar la configuracion' });
    } finally {
      setSaving(false);
    }
  }

  async function handleFetchBcv() {
    setFetchingBcv(true);
    try {
      const res = await fetch('/api/proxy/exchange-rate/fetch-bcv');
      if (res.ok) {
        const data = await res.json();
        if (data.rate) {
          setNewRate(data.rate.toString());
          setRateFromBcv(true);
          setMessage({ type: 'success', text: `Tasa obtenida del BCV: Bs ${data.rate.toFixed(2)} — Confirma y registra` });
        } else {
          setMessage({ type: 'error', text: data.error || 'No se pudo obtener la tasa del BCV. Ingresa manualmente.' });
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al consultar BCV. Ingresa la tasa manualmente.' });
    } finally {
      setFetchingBcv(false);
    }
  }

  async function handleSaveRate(source: 'MANUAL' | 'BCV') {
    if (!newRate || Number(newRate) <= 0) return;
    setSavingRate(true);
    try {
      const res = await fetch('/api/proxy/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: Number(newRate), source }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Tasa registrada exitosamente' });
        setNewRate('');
        fetchExchangeRate();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSavingRate(false);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      setMessage({ type: 'error', text: 'La imagen debe pesar menos de 500KB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setLogo(dataUri);
      setLogoPreview(dataUri);
      setLogoChanged(true);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogo(null);
    setLogoPreview(null);
    setLogoChanged(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleChange(field: keyof CompanyConfig, value: string | number | boolean) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Settings className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Configuracion de Empresa</h1>
          <p className="text-slate-400 text-sm mt-0.5">Datos generales y parametros del sistema</p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-6 max-w-3xl">
        {/* Exchange Rate Section */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Tasa de Cambio</h2>
          <div className="mb-4">
            {todayRate ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">Tasa de hoy:</span>
                <span className="text-xl font-bold text-green-400 font-mono">{todayRate.rate.toFixed(2)} Bs/USD</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{todayRate.source}</span>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                No hay tasa registrada para hoy. Registra la tasa para poder facturar.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nueva tasa (Bs/USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={newRate}
                onChange={(e) => { setNewRate(e.target.value); setRateFromBcv(false); }}
                className="input-field !py-2 text-sm w-40"
                placeholder="Ej: 36.50"
              />
            </div>
            <button
              type="button"
              onClick={handleFetchBcv}
              disabled={fetchingBcv}
              className="btn-secondary !py-2 text-sm flex items-center gap-2"
            >
              {fetchingBcv && <Loader2 className="animate-spin" size={14} />}
              Obtener del BCV
            </button>
            <button
              type="button"
              onClick={() => { handleSaveRate(rateFromBcv ? 'BCV' : 'MANUAL'); setRateFromBcv(false); }}
              disabled={savingRate || !newRate}
              className="btn-primary !py-2 text-sm flex items-center gap-2"
            >
              {savingRate && <Loader2 className="animate-spin" size={14} />}
              {rateFromBcv ? 'Confirmar y guardar' : 'Registrar tasa'}
            </button>
          </div>

          {/* History */}
          {rateHistory.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Historial reciente</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {rateHistory.slice(0, 15).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-400">{new Date(r.date).toLocaleDateString('es-VE')}</span>
                    <span className="font-mono text-white">{r.rate.toFixed(2)} Bs</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{r.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Logo Section */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <ImageIcon size={20} className="text-green-400" />
            <h2 className="text-lg font-semibold text-white">Logo de la Empresa</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Este logo aparecera en facturas, cotizaciones, recibos y notas de credito/debito. Maximo 500KB.
          </p>
          <div className="flex items-start gap-6">
            {logoPreview ? (
              <div className="relative group">
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="h-24 w-auto max-w-[200px] object-contain rounded-lg border border-slate-700 bg-white p-2"
                />
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar logo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div className="h-24 w-32 flex items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-800/50">
                <ImageIcon size={28} className="text-slate-600" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary !py-2 text-sm flex items-center gap-2"
              >
                <Upload size={14} />
                {logoPreview ? 'Cambiar logo' : 'Subir logo'}
              </button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="btn-secondary !py-2 text-sm flex items-center gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              )}
              <p className="text-xs text-slate-500">PNG, JPG o SVG. Se guardara al presionar &quot;Guardar configuracion&quot;.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Company info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Datos de la Empresa</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Nombre de la empresa
                </label>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">RIF</label>
                <input
                  type="text"
                  value={config.rif}
                  onChange={(e) => handleChange('rif', e.target.value)}
                  className="input-field"
                  placeholder="J-12345678-9"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Direccion</label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Telefono</label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={config.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Financial params */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Parametros Financieros</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Brecha global (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={config.bregaGlobalPct}
                  onChange={(e) => handleChange('bregaGlobalPct', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Prefijo de factura
                </label>
                <input
                  type="text"
                  value={config.invoicePrefix}
                  onChange={(e) => handleChange('invoicePrefix', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Validez de cotizaciones (dias)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.quotationValidityDays}
                  onChange={(e) => handleChange('quotationValidityDays', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Alerta de vencimiento CxC (dias antes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.overdueWarningDays}
                  onChange={(e) => handleChange('overdueWarningDays', e.target.value)}
                  className="input-field"
                />
                <p className="text-xs text-slate-500 mt-1">Dias antes del vencimiento para mostrar alerta amarilla</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Retencion IVA (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={config.ivaRetentionPct}
                  onChange={(e) => handleChange('ivaRetentionPct', e.target.value)}
                  className="input-field"
                />
                <p className="text-xs text-slate-500 mt-1">Porcentaje de retencion IVA aplicado a proveedores agentes de retencion (75% por ley venezolana)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Retencion ISLR por defecto (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={config.islrRetentionPct}
                  onChange={(e) => handleChange('islrRetentionPct', e.target.value)}
                  className="input-field"
                />
                <p className="text-xs text-slate-500 mt-1">Porcentaje de retencion ISLR por defecto en ordenes de compra</p>
              </div>
            </div>
          </div>

          {/* IGTF Tax Configuration */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Impuestos - IGTF</h2>
            <p className="text-sm text-slate-400 mb-4">
              Impuesto a las Grandes Transacciones Financieras. Aplica a pagos en divisas (Efectivo USD, Zelle).
            </p>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isIGTFContributor}
                  onChange={(e) => handleChange('isIGTFContributor', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                <div>
                  <span className="text-sm text-white">Contribuyente IGTF</span>
                  <p className="text-xs text-slate-500">Aplica IGTF a pagos en divisas (Efectivo USD y Zelle)</p>
                </div>
              </label>
              {config.isIGTFContributor && (
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Porcentaje IGTF (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={config.igtfPct}
                    onChange={(e) => handleChange('igtfPct', e.target.value)}
                    className="input-field"
                  />
                  <p className="text-xs text-slate-500 mt-1">Actualmente 3% por ley venezolana</p>
                </div>
              )}
            </div>
          </div>

          {/* Sales config */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Ventas</h2>
            <p className="text-sm text-slate-400 mb-4">
              Configuracion general de ventas y facturacion.
            </p>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowNegativeStock}
                  onChange={(e) => handleChange('allowNegativeStock', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                <div>
                  <span className="text-sm text-white">Permitir ventas sin stock</span>
                  <p className="text-xs text-slate-500">Si esta desactivado, no se podran facturar productos con stock insuficiente</p>
                </div>
              </label>
            </div>
          </div>

          {/* Credit auth */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Ventas a Credito</h2>
            <p className="text-sm text-slate-400 mb-4">
              Clave de autorizacion para aprobar ventas a credito desde el POS.
            </p>
            <div className="w-full md:w-80">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Clave de autorizacion
              </label>
              <div className="relative">
                <input
                  type={showCreditPassword ? 'text' : 'password'}
                  value={creditAuthPassword}
                  onChange={(e) => setCreditAuthPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Dejar vacio para no cambiar"
                />
                <button
                  type="button"
                  onClick={() => setShowCreditPassword(!showCreditPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showCreditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Se pedira esta clave al cajero cuando intente facturar a credito</p>
            </div>
          </div>

          {/* Default profit margins */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Precios por defecto</h2>
            <p className="text-sm text-slate-400 mb-4">
              Se aplicara automaticamente a los productos nuevos que no tengan ganancia configurada.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Ganancia detal por defecto (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={config.defaultGananciaPct}
                  onChange={(e) => handleChange('defaultGananciaPct', e.target.value)}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Ganancia mayor por defecto (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={config.defaultGananciaMayorPct}
                  onChange={(e) => handleChange('defaultGananciaMayorPct', e.target.value)}
                  className="input-field"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        </form>

        {/* Print area for this PC */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Printer size={20} className="text-green-400" />
            <h2 className="text-lg font-semibold text-white">Area de Impresion de esta PC</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Selecciona el area de impresion que esta PC monitoreara. Al cobrar una factura,
            se imprimiran automaticamente los tickets de los productos asignados a esta area.
          </p>
          <select
            value={selectedPrintAreaId}
            onChange={(e) => handlePrintAreaChange(e.target.value)}
            className="input-field w-full md:w-80"
          >
            <option value="">Ninguna (no imprimir)</option>
            {printAreas.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
