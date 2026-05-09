'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';

interface CompanyConfig {
  companyName: string;
  rif: string;
  address: string;
  phone: string;
  email: string;
  exchangeRate: number;
  bregaGlobalPct: number;
  defaultWarehouseId: string;
  invoicePrefix: string;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<CompanyConfig>({
    companyName: '',
    rif: '',
    address: '',
    phone: '',
    email: '',
    exchangeRate: 0,
    bregaGlobalPct: 0,
    defaultWarehouseId: '',
    invoicePrefix: 'FAC',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

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
          exchangeRate: data.exchangeRate || 0,
          bregaGlobalPct: data.bregaGlobalPct || 0,
          defaultWarehouseId: data.defaultWarehouseId || '',
          invoicePrefix: data.invoicePrefix || 'FAC',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar la configuracion' });
    } finally {
      setLoading(false);
    }
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
          exchangeRate: Number(config.exchangeRate),
          bregaGlobalPct: Number(config.bregaGlobalPct),
          invoicePrefix: config.invoicePrefix,
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

  function handleChange(field: keyof CompanyConfig, value: string | number) {
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

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Tasa de cambio (Bs/USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={config.exchangeRate}
                onChange={(e) => handleChange('exchangeRate', e.target.value)}
                className="input-field"
              />
            </div>
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
    </div>
  );
}
