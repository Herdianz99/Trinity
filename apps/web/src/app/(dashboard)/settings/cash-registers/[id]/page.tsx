'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Monitor, Save, Loader2, LogOut, ToggleLeft, ToggleRight, Info,
  Printer, ArrowRight,
} from 'lucide-react';

interface CashRegister {
  id: string;
  code: string;
  name: string;
  isShared: boolean;
  isActive: boolean;
  serie?: { id: string; name: string; prefix: string; isFiscal: boolean; comPort: string | null; fiscalMachineSerial: string | null } | null;
}

export default function CashRegisterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [register, setRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', isShared: false });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRegister = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/cash-registers/${id}`);
      if (!res.ok) throw new Error('Caja no encontrada');
      const data = await res.json();
      setRegister(data);
      setForm({
        name: data.name,
        isShared: data.isShared || false,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  useEffect(() => {
    if (register) document.title = `${register.name} | Trinity ERP`;
  }, [register]);

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = {
        name: form.name,
        code: register?.code,
        isShared: form.isShared,
      };
      const res = await fetch(`/api/proxy/cash-registers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Caja actualizada correctamente' });
        fetchRegister();
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err.message) ? err.message[0] : err.message;
        throw new Error(msg || 'Error al guardar');
      }
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndExit() {
    const ok = await handleSave();
    if (ok) router.push('/settings/cash-registers');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (error || !register) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error || 'Caja no encontrada'}</p>
        <button
          onClick={() => router.push('/settings/cash-registers')}
          className="btn-secondary"
        >
          Volver a cajas
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/settings/cash-registers')}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <Monitor className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{register.name}</h1>
          <p className="text-slate-400 text-sm font-mono">{register.code}</p>
        </div>
      </div>

      {/* Save message */}
      {saveMsg && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            saveMsg.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {saveMsg.text}
        </div>
      )}

      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Codigo
            </label>
            <input
              type="text"
              value={register.code}
              disabled
              className="input-field !py-2 text-sm opacity-60 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input-field !py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-300">Serie:</label>
          {register.serie ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white">{register.serie.name}</span>
              {register.serie.isFiscal ? (
                <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs">Fiscal</span>
              ) : (
                <span className="bg-slate-500/15 text-slate-400 border border-slate-500/30 px-2 py-0.5 rounded-full text-xs">No Fiscal</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-amber-400">Sin serie configurada</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-300">Compartida:</label>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isShared: !f.isShared }))}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              form.isShared
                ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}
          >
            {form.isShared ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {form.isShared ? 'Si' : 'No'}
          </button>
          <span className="text-xs text-slate-500">Visible para todos los usuarios en el POS</span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndExit}
            className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
            Guardar y salir
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary !py-2.5 text-sm flex items-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </form>

      {/* Maquina Fiscal — link to serie */}
      {register.serie?.isFiscal ? (
        <div className="mt-4 card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Printer size={18} className="text-blue-400" />
              <div>
                <p className="text-sm font-medium text-white">Maquina Fiscal</p>
                <p className="text-xs text-slate-400">
                  Serie vinculada: <span className="text-slate-200">{register.serie.name}</span>
                  {register.serie.comPort && <span className="text-slate-500"> &middot; {register.serie.comPort}</span>}
                </p>
              </div>
            </div>
            <Link
              href={`/settings/series/${register.serie.id}`}
              className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Configurar maquina fiscal
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : register.serie ? null : (
        <div className="mt-4 card p-4">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-300">
              Esta caja no tiene una serie asignada. Asigne una serie desde la lista de cajas registradoras.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
