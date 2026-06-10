'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Monitor, Save, Loader2, LogOut, ToggleLeft, ToggleRight, Info,
  Printer, ArrowRight,
} from 'lucide-react';

interface Serie {
  id: string;
  name: string;
  prefix: string;
  isFiscal: boolean;
  cashRegister: { id: string } | null;
}

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
  const [allSeries, setAllSeries] = useState<Serie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', isShared: false, serieId: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRegister = useCallback(async () => {
    setLoading(true);
    try {
      const [regRes, seriesRes] = await Promise.all([
        fetch(`/api/proxy/cash-registers/${id}`),
        fetch('/api/proxy/series'),
      ]);
      if (!regRes.ok) throw new Error('Caja no encontrada');
      const data = await regRes.json();
      setRegister(data);
      setForm({
        name: data.name,
        isShared: data.isShared || false,
        serieId: data.serie?.id || '',
      });
      if (seriesRes.ok) {
        setAllSeries(await seriesRes.json());
      }
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

  // Series available: not linked to another register, or linked to the current one
  const availableSeries = allSeries.filter(
    (s) => !s.cashRegister || s.cashRegister.id === id,
  );

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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err.message) ? err.message[0] : err.message;
        throw new Error(msg || 'Error al guardar');
      }

      // Update serie linkage if changed
      const oldSerieId = register?.serie?.id || '';
      if (oldSerieId !== form.serieId) {
        // Unlink old serie
        if (oldSerieId) {
          await fetch(`/api/proxy/series/${oldSerieId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cashRegisterId: null }),
          });
        }
        // Link new serie
        if (form.serieId) {
          const linkRes = await fetch(`/api/proxy/series/${form.serieId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cashRegisterId: id }),
          });
          if (!linkRes.ok) {
            const err = await linkRes.json().catch(() => ({}));
            throw new Error(err.message || 'Error al vincular serie');
          }
        }
      }

      setSaveMsg({ type: 'success', text: 'Caja actualizada correctamente' });
      fetchRegister();
      return true;
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

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Serie vinculada
          </label>
          <select
            value={form.serieId}
            onChange={(e) => setForm((f) => ({ ...f, serieId: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
          >
            <option value="">Sin serie</option>
            {availableSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.prefix}) {s.isFiscal ? '— Fiscal' : ''}
              </option>
            ))}
          </select>
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

      {/* Maquina Fiscal — link to serie config */}
      {register.serie?.isFiscal && (
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
      )}
    </div>
  );
}
