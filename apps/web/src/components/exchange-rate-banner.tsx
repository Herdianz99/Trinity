'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

export default function ExchangeRateBanner() {
  const [hasRate, setHasRate] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [fetchingBcv, setFetchingBcv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkTodayRate();
  }, []);

  async function checkTodayRate() {
    try {
      const res = await fetch('/api/proxy/exchange-rate/today');
      if (res.ok) {
        const data = await res.json();
        setHasRate(!!data);
      } else {
        setHasRate(false);
      }
    } catch {
      setHasRate(null);
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
        }
      }
    } catch { /* ignore */ } finally {
      setFetchingBcv(false);
    }
  }

  async function handleSaveRate() {
    if (!newRate || Number(newRate) <= 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/proxy/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: Number(newRate), source: 'MANUAL' }),
      });
      if (res.ok) {
        setHasRate(true);
        setShowModal(false);
        setNewRate('');
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  if (hasRate !== false || dismissed) return null;

  return (
    <>
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-400" />
          <span className="text-sm text-amber-300">
            No hay tasa BCV registrada para hoy. Sin tasa no se puede facturar.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
          >
            Registrar tasa
          </button>
          <button onClick={() => setDismissed(true)} className="p-1 text-amber-500/60 hover:text-amber-400">
            <X size={16} />
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-white mb-4">Registrar Tasa de Hoy</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tasa (Bs/USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className="input-field !py-2 text-sm"
                  placeholder="Ej: 36.50"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleFetchBcv}
                  disabled={fetchingBcv}
                  className="btn-secondary !py-2 text-sm flex-1 flex items-center justify-center gap-2"
                >
                  {fetchingBcv && <Loader2 className="animate-spin" size={14} />}
                  Obtener del BCV
                </button>
                <button
                  onClick={handleSaveRate}
                  disabled={saving || !newRate}
                  className="btn-primary !py-2 text-sm flex-1 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="animate-spin" size={14} />}
                  Guardar
                </button>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
