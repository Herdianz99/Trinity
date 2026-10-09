'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Wallet, FileClock, Receipt } from 'lucide-react';

// Modal de cierre de corrida: al cerrar se genera el gasto "Nomina" por el TOTAL BRUTO
// (sin restar deducciones) y aquí se elige de dónde sale el dinero, igual que en un gasto
// manual: caja abierta (+ método), a crédito (CxP a un proveedor) o sin caja.

type Source = 'cash' | 'credit' | 'none';

export interface ClosePayload {
  cashSessionId?: string;
  methodId?: string;
  isCredit?: boolean;
  supplierId?: string;
  creditDays?: number;
}

interface Props {
  runNumber: string | null;
  totalGrossBs: number;
  exchangeRate: number;
  closing: boolean;
  onCancel: () => void;
  onConfirm: (payload: ClosePayload) => void;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CloseRunModal({ runNumber, totalGrossBs, exchangeRate, closing, onCancel, onConfirm }: Props) {
  const [source, setSource] = useState<Source>('cash');
  const [sessions, setSessions] = useState<any[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; rif?: string | null; isActive: boolean }[]>([]);
  const [cashSessionId, setCashSessionId] = useState('');
  const [methodId, setMethodId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [creditDays, setCreditDays] = useState('0');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/proxy/cash-sessions?status=OPEN').then((r) => r.json()).catch(() => []),
      fetch('/api/proxy/payment-methods/flat').then((r) => r.json()).catch(() => []),
      fetch('/api/proxy/suppliers').then((r) => r.json()).catch(() => []),
    ]).then(([s, m, sup]) => {
      const sess = Array.isArray(s) ? s : [];
      setSessions(sess);
      setMethods(Array.isArray(m) ? m : []);
      setSuppliers(Array.isArray(sup) ? sup : sup?.data || []);
      if (sess.length === 1) setCashSessionId(sess[0].id);
      if (sess.length === 0) setSource('none');
      setLoaded(true);
    });
  }, []);

  const grossUsd = exchangeRate > 0 ? totalGrossBs / exchangeRate : 0;
  const invalid =
    (source === 'cash' && !cashSessionId) ||
    (source === 'credit' && !supplierId);

  function confirm() {
    if (invalid) return;
    if (source === 'cash') onConfirm({ cashSessionId, methodId: methodId || undefined });
    else if (source === 'credit') onConfirm({ isCredit: true, supplierId, creditDays: parseInt(creditDays, 10) || 0 });
    else onConfirm({});
  }

  const option = (value: Source, icon: React.ReactNode, title: string, hint: string, disabled = false) => (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed border-slate-700/50' :
        source === value ? 'border-blue-500/60 bg-blue-500/10 cursor-pointer' : 'border-slate-700 hover:border-slate-600 cursor-pointer'
      }`}
    >
      <input
        type="radio" name="close-source" className="mt-1 accent-blue-500"
        checked={source === value} disabled={disabled}
        onChange={() => setSource(value)}
      />
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-slate-200">{title}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
    </label>
  );

  const selectCls = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !closing && onCancel()} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-1">Cerrar corrida {runNumber}</h2>
        <p className="text-sm text-slate-400 mb-4">La corrida no podrá editarse después.</p>

        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 mb-4">
          <p className="text-xs text-slate-400">Se registrará un gasto en la categoría <span className="text-slate-200 font-medium">Nomina</span> por el total bruto (sin restar deducciones):</p>
          <p className="mt-1 text-xl font-bold text-white tabular-nums">Bs {fmt(totalGrossBs)}</p>
          <p className="text-xs text-slate-400 tabular-nums">≈ ${fmt(grossUsd)} · tasa {fmt(exchangeRate)}</p>
          <p className="mt-2 text-[11px] text-amber-400/90">Ya no hace falta cargar este gasto a mano en Gastos.</p>
        </div>

        <p className="text-xs font-medium text-slate-400 mb-2">¿De dónde sale el dinero?</p>
        {!loaded ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-400" size={22} /></div>
        ) : (
          <div className="space-y-2">
            {option('cash', <Wallet size={16} />, 'De una caja', sessions.length ? 'Se descuenta de la caja abierta que elijas.' : 'No hay cajas abiertas en este momento.', sessions.length === 0)}
            {source === 'cash' && sessions.length > 0 && (
              <div className="pl-9 space-y-2">
                <select value={cashSessionId} onChange={(e) => setCashSessionId(e.target.value)} className={selectCls}>
                  <option value="">Seleccionar caja...</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.cashRegister?.name || s.cashRegister?.code || 'Caja'} — {s.openedBy?.name}
                    </option>
                  ))}
                </select>
                <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={selectCls}>
                  <option value="">Método de pago (opcional)</option>
                  {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            {option('credit', <FileClock size={16} />, 'A crédito', 'Genera una cuenta por pagar; se paga luego con un recibo de pago.')}
            {source === 'credit' && (
              <div className="pl-9 grid grid-cols-3 gap-2">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${selectCls} col-span-2`}>
                  <option value="">Proveedor...</option>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.rif ? ` (${s.rif})` : ''}</option>
                  ))}
                </select>
                <input
                  type="number" min="0" value={creditDays} onChange={(e) => setCreditDays(e.target.value)}
                  className={selectCls} title="Días de crédito" placeholder="Días"
                />
              </div>
            )}

            {option('none', <Receipt size={16} />, 'Sin caja', 'Solo se registra el gasto, sin descontar de ninguna caja.')}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={confirm} disabled={closing || !loaded || invalid}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {closing ? <Loader2 className="animate-spin" size={15} /> : <Lock size={15} />} Cerrar y registrar gasto
          </button>
          <button onClick={onCancel} disabled={closing} className="w-full text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
