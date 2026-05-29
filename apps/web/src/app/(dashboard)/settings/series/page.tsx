'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  X,
  Loader2,
} from 'lucide-react';

interface Serie {
  id: string;
  name: string;
  prefix: string;
  type: 'SALES' | 'PURCHASES';
  isFiscal: boolean;
  isVatExempt: boolean;
  lastNumber: number;
  isActive: boolean;
  comPort: string | null;
  fiscalMachineSerial: string | null;
  createdAt: string;
}

export default function SeriesPage() {
  const router = useRouter();
  const [series, setSeries] = useState<Serie[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSerie, setEditingSerie] = useState<Serie | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrefix, setFormPrefix] = useState('');
  const [formType, setFormType] = useState<'SALES' | 'PURCHASES'>('SALES');
  const [formIsFiscal, setFormIsFiscal] = useState(false);
  const [formIsVatExempt, setFormIsVatExempt] = useState(false);
  const [formComPort, setFormComPort] = useState('');
  const [formFiscalSerial, setFormFiscalSerial] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Series | Trinity ERP';
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/series');
      if (res.ok) setSeries(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingSerie(null);
    setFormName('');
    setFormPrefix('');
    setFormType('SALES');
    setFormIsFiscal(false);
    setFormIsVatExempt(false);
    setFormComPort('');
    setFormFiscalSerial('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (serie: Serie) => {
    setEditingSerie(serie);
    setFormName(serie.name);
    setFormPrefix(serie.prefix);
    setFormType(serie.type || 'SALES');
    setFormIsFiscal(serie.isFiscal);
    setFormIsVatExempt(serie.isVatExempt);
    setFormComPort(serie.comPort || '');
    setFormFiscalSerial(serie.fiscalMachineSerial || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formPrefix.trim()) {
      setFormError('Nombre y prefijo son requeridos');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const body: any = {
        name: formName.trim(),
        prefix: formPrefix.trim().toUpperCase(),
        type: formType,
        isFiscal: formIsFiscal,
        isVatExempt: formIsVatExempt,
      };
      if (formIsFiscal) {
        body.comPort = formComPort.trim() || null;
        body.fiscalMachineSerial = formFiscalSerial.trim() || null;
      } else {
        body.comPort = null;
        body.fiscalMachineSerial = null;
      }

      const url = editingSerie
        ? `/api/proxy/series/${editingSerie.id}`
        : '/api/proxy/series';
      const method = editingSerie ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al guardar');
      }

      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (serie: Serie) => {
    try {
      await fetch(`/api/proxy/series/${serie.id}/toggle-active`, { method: 'PATCH' });
      fetchData();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers className="text-indigo-400" size={28} />
          <h1 className="text-2xl font-bold text-white">Series</h1>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nueva serie
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Prefijo</th>
              <th className="text-center px-4 py-3 font-medium">Tipo</th>
              <th className="text-center px-4 py-3 font-medium">Fiscal</th>
              <th className="text-center px-4 py-3 font-medium">Exenta IVA</th>
              <th className="text-right px-4 py-3 font-medium">Ultimo No.</th>
              <th className="text-center px-4 py-3 font-medium">Estado</th>
              <th className="text-center px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {series.map((serie) => (
              <tr
                key={serie.id}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/settings/series/${serie.id}`)}
              >
                <td className="px-4 py-3 text-white font-medium">{serie.name}</td>
                <td className="px-4 py-3">
                  <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded text-xs font-mono">
                    {serie.prefix}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {serie.type === 'PURCHASES' ? (
                    <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      COMPRAS
                    </span>
                  ) : (
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      VENTAS
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {serie.isFiscal ? (
                    <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      FISCAL
                    </span>
                  ) : (
                    <span className="bg-slate-600/30 text-slate-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      NO FISCAL
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {serie.isVatExempt ? (
                    <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      EXENTA
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-300 font-mono">
                  {serie.lastNumber}
                </td>
                <td className="px-4 py-3 text-center">
                  {serie.isActive ? (
                    <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-xs">
                      Activa
                    </span>
                  ) : (
                    <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs">
                      Inactiva
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/settings/series/${serie.id}`)}
                      className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(serie)}
                      className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                      title={serie.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {serie.isActive ? <ToggleRight size={14} className="text-green-400" /> : <ToggleLeft size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {series.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-500">
                  No hay series configuradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Create/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {editingSerie ? 'Editar serie' : 'Nueva serie'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Serie VTA"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Prefijo</label>
                <input
                  type="text"
                  value={formPrefix}
                  onChange={(e) => setFormPrefix(e.target.value.toUpperCase())}
                  placeholder="Ej: VTA"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Formato de numero: {formPrefix || 'XXX'}-26-00000001
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'SALES' | 'PURCHASES')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="SALES">Ventas</option>
                  <option value="PURCHASES">Compras</option>
                </select>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsFiscal}
                    onChange={(e) => setFormIsFiscal(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Fiscal</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsVatExempt}
                    onChange={(e) => setFormIsVatExempt(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Exenta de IVA</span>
                </label>
              </div>

              {formIsFiscal && (
                <div className="space-y-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configuracion de maquina fiscal</p>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Puerto COM</label>
                    <input
                      type="text"
                      value={formComPort}
                      onChange={(e) => setFormComPort(e.target.value)}
                      placeholder="Ej: COM3"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">Puerto donde esta conectada la impresora fiscal</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Serial de maquina fiscal</label>
                    <input
                      type="text"
                      value={formFiscalSerial}
                      onChange={(e) => setFormFiscalSerial(e.target.value)}
                      placeholder="Ej: ABC12345678"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">Se detecta automaticamente al comprobar la impresora</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving && <Loader2 className="animate-spin" size={14} />}
                {editingSerie ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
