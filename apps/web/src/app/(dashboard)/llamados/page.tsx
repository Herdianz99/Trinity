'use client';

// Llamados del tótem Clover (Sesión 193): lista de clientes que pidieron un vendedor en la pantalla
// del piso de venta, con "Voy yo" (el primero gana), y el panel para activar los avisos push en
// este equipo. Es la pantalla a la que abren las notificaciones push (/llamados?id=...).

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, BellOff, Hand, RotateCw, Send } from 'lucide-react';
import { attendTotemCall, minutesAgo, TotemCall } from '@/components/totem-calls-alert';
import { disablePush, enablePush, getPushState, PushState, sendTestPush } from '@/lib/push';

const REFRESH_MS = 5_000;

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: 'Este navegador no admite notificaciones push (necesita HTTPS y Chrome o Edge). Los avisos dentro de Trinity siguen funcionando.',
  'server-off': 'El servidor todavía no tiene las llaves VAPID configuradas, así que los avisos push están apagados. Los avisos dentro de Trinity siguen funcionando.',
  denied: 'Las notificaciones de Trinity están bloqueadas en este navegador. En Chrome toca el candado junto a la dirección → Permisos → Notificaciones → Permitir, y recarga la página.',
  off: 'Activa los avisos para que te llegue una notificación cuando un cliente pida un vendedor en el tótem, aunque Trinity esté cerrado o la tablet bloqueada.',
  on: 'Este equipo recibe los avisos del tótem y de los pedidos online, aunque Trinity esté cerrado o la pantalla bloqueada.',
};

export default function LlamadosPage() {
  const [calls, setCalls] = useState<TotemCall[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    document.title = 'Llamados del tótem | Trinity ERP';
    // El id viene de la notificación push; se lee aquí (y no con useSearchParams) para no exigir Suspense.
    setHighlight(new URLSearchParams(window.location.search).get('id'));
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/totem-calls/pending');
      if (!res.ok || !alive.current) return;
      const data = await res.json();
      if (!alive.current) return;
      setEnabled(!!data.enabled);
      setCalls(Array.isArray(data.calls) ? data.calls : []);
    } catch {
      // sin red: se reintenta en el siguiente ciclo
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    // El service worker avisa cuando llega un push: se refresca al instante.
    const onSw = (e: MessageEvent) => { if (e.data?.type === 'trinity-push') load(); };
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => { clearInterval(t); navigator.serviceWorker?.removeEventListener('message', onSw); };
  }, [load]);

  useEffect(() => {
    getPushState().then((s) => alive.current && setPushState(s));
  }, []);

  const attend = async (id: string) => {
    setBusy(id);
    await attendTotemCall(id);
    setBusy(null);
    await load();
  };

  const activate = async () => {
    setPushBusy(true); setPushMsg('');
    setPushState(await enablePush());
    setPushBusy(false);
  };

  const deactivate = async () => {
    setPushBusy(true); setPushMsg('');
    setPushState(await disablePush());
    setPushBusy(false);
  };

  const test = async () => {
    setPushBusy(true); setPushMsg('');
    const sent = await sendTestPush();
    setPushMsg(sent > 0
      ? `Aviso de prueba enviado a ${sent} navegador(es). Debería aparecer en unos segundos.`
      : 'No se pudo enviar el aviso de prueba. Revisa que los avisos estén activados en este equipo.');
    setPushBusy(false);
  };

  const open = calls.filter((c) => !c.attendedBy);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BellRing className="text-amber-400" size={26} />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Llamados del tótem</h1>
            <p className="text-sm text-slate-400">Clientes que pidieron un vendedor en la pantalla de Clover (últimos 20 min)</p>
          </div>
        </div>
        <button onClick={() => load()} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
          <RotateCw size={16} /> Actualizar
        </button>
      </div>

      {/* Avisos push de este equipo */}
      {pushState && pushState !== 'unsupported' && (
        <div className={`mb-6 rounded-xl border p-4 ${pushState === 'on' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
          <div className="flex items-start gap-3">
            {pushState === 'on'
              ? <BellRing size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              : <BellOff size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100">
                {pushState === 'on' ? 'Avisos activados en este equipo' : 'Avisos en este equipo'}
              </p>
              <p className="mt-1 text-sm text-slate-400">{PUSH_TEXT[pushState]}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {pushState === 'off' && (
                  <button onClick={activate} disabled={pushBusy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                    {pushBusy ? 'Activando…' : 'Activar avisos'}
                  </button>
                )}
                {pushState === 'on' && (
                  <>
                    <button onClick={test} disabled={pushBusy} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-60">
                      <Send size={14} /> Probar aviso
                    </button>
                    <button onClick={deactivate} disabled={pushBusy} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-60">
                      Desactivar
                    </button>
                  </>
                )}
              </div>
              {pushMsg && <p className="mt-2 text-sm text-slate-300">{pushMsg}</p>}
            </div>
          </div>
        </div>
      )}
      {pushState === 'unsupported' && (
        <p className="mb-6 text-sm text-slate-500">{PUSH_TEXT.unsupported}</p>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-500">Cargando…</div>
      ) : !enabled ? (
        <div className="text-center py-16 text-slate-500 rounded-xl border border-slate-700/50">
          Los llamados del tótem les llegan solo a los vendedores.
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-16 text-slate-500 rounded-xl border border-slate-700/50">
          No hay llamados en los últimos 20 minutos.
        </div>
      ) : (
        <div className="space-y-3">
          {open.length > 0 && (
            <p className="text-sm font-semibold text-amber-300">
              {open.length === 1 ? '1 cliente esperando un vendedor' : `${open.length} clientes esperando un vendedor`}
            </p>
          )}
          {calls.map((c) => {
            const isOpen = !c.attendedBy;
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-4 flex gap-3 items-start bg-slate-900 ${
                  isOpen ? 'border-amber-400/60' : 'border-emerald-500/40'} ${highlight === c.id ? 'ring-2 ring-blue-400/60' : ''}`}
              >
                <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${isOpen ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  <BellRing size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isOpen ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {isOpen ? 'Cliente en el tótem pide un vendedor' : c.attendedBy?.mine ? 'Vas tú' : `Lo atiende ${c.attendedBy?.name}`}
                  </p>
                  {c.asked.length > 0 ? (
                    <p className="mt-0.5 text-sm text-slate-200">Preguntó: “{c.asked.join(' · ')}”</p>
                  ) : (
                    <p className="mt-0.5 text-sm text-slate-400">Acércate a la pantalla de Clover.</p>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">{minutesAgo(c.escalatedAt)}</p>
                  {isOpen ? (
                    <button
                      onClick={() => attend(c.id)}
                      disabled={busy === c.id}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
                    >
                      <Hand size={16} /> {busy === c.id ? 'Marcando…' : 'Voy yo'}
                    </button>
                  ) : c.attendedBy?.mine ? (
                    <p className="mt-1 text-sm text-emerald-300">Clover le dijo al cliente que ya vas.</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
