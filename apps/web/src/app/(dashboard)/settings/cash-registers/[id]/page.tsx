'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Monitor, Save, Loader2, LogOut, ToggleLeft, ToggleRight, Info,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface CashRegister {
  id: string;
  code: string;
  name: string;
  isFiscal: boolean;
  isShared: boolean;
  isActive: boolean;
  comPort: string | null;
}

export default function CashRegisterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [register, setRegister] = useState<CashRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', isFiscal: false, isShared: false, comPort: '' });
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
        isFiscal: data.isFiscal,
        isShared: data.isShared || false,
        comPort: data.comPort || '',
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

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = {
        name: form.name,
        code: register?.code,
        isFiscal: form.isFiscal,
        isShared: form.isShared,
        comPort: form.comPort || undefined,
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

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="fiscal">Maquina Fiscal</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Info General ═══ */}
        <TabsContent value="info">
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
              <label className="text-sm font-medium text-slate-300">Es fiscal:</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isFiscal: !f.isFiscal }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.isFiscal
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                }`}
              >
                {form.isFiscal ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {form.isFiscal ? 'Si' : 'No'}
              </button>
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
        </TabsContent>

        {/* ═══ TAB: Maquina Fiscal ═══ */}
        <TabsContent value="fiscal">
          <div className="card p-6 space-y-4">
            {!form.isFiscal ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Info size={20} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-300">
                  Esta caja no esta configurada como fiscal. Active la opcion
                  &quot;Es fiscal&quot; en la pestana Informacion General.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Puerto COM
                  </label>
                  <input
                    type="text"
                    value={form.comPort}
                    onChange={(e) => setForm((f) => ({ ...f, comPort: e.target.value }))}
                    className="input-field !py-2 text-sm max-w-xs"
                    placeholder="COM3"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">
                    Puerto COM donde esta conectada la impresora fiscal (ej: COM1, COM3)
                  </p>
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
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave()}
                    className="btn-primary !py-2.5 text-sm flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Guardar cambios
                  </button>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
