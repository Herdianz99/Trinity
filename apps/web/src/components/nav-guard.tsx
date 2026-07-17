'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, LogOut, X } from 'lucide-react';

// Guard de navegación con "cambios sin guardar". Un formulario registra un blocker
// (con su función de guardar); mientras esté activo, cualquier intento de salir
// —clic en un <a> (menú lateral, links), botón atrás propio (via requestNavigate),
// o refrescar/cerrar la pestaña— pide confirmar: Guardar / Salir sin guardar / Cancelar.

type Blocker = { onSave?: () => Promise<boolean>; what?: string } | null;
type Pending = { kind: 'href'; href: string } | { kind: 'back' } | null;

const Ctx = createContext<{
  setBlocker: (b: Blocker) => void;
  requestNavigate: (href: string) => void;
}>({ setBlocker: () => {}, requestNavigate: () => {} });

export const useNavGuard = () => useContext(Ctx);

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const blockerRef = useRef<Blocker>(null);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [saving, setSaving] = useState(false);
  const [what, setWhat] = useState('esta operación');
  const bypassRef = useRef(false);

  const setBlocker = useCallback((b: Blocker) => {
    blockerRef.current = b;
    setActive(!!b);
    setWhat(b?.what || 'esta operación');
    if (!b) setPending(null);
  }, []);

  // 1) Refrescar / cerrar pestaña
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);

  // 2) Clic en cualquier link interno (menú lateral incluido)
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(href, window.location.origin); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (!blockerRef.current) { router.push(url.pathname + url.search); return; }
      setPending({ kind: 'href', href: url.pathname + url.search });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, router]);

  // 3) Botón atrás del navegador (best-effort con centinela)
  useEffect(() => {
    if (!active) return;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      if (bypassRef.current) { bypassRef.current = false; return; }
      if (!blockerRef.current) return;
      window.history.pushState(null, '', window.location.href);
      setPending({ kind: 'back' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);

  const go = useCallback((p: Pending) => {
    if (!p) return;
    setBlocker(null);
    setTimeout(() => {
      if (p.kind === 'href') router.push(p.href);
      else { bypassRef.current = true; window.history.back(); }
    }, 0);
  }, [router, setBlocker]);

  const requestNavigate = useCallback((href: string) => {
    if (blockerRef.current) setPending({ kind: 'href', href });
    else router.push(href);
  }, [router]);

  const onGuardar = async () => {
    const b = blockerRef.current;
    const p = pending;
    if (b?.onSave) {
      setSaving(true);
      let ok = false;
      try { ok = await b.onSave(); } finally { setSaving(false); }
      if (!ok) return; // guardado falló: se queda en el modal con el error del form
    }
    setPending(null);
    go(p);
  };
  const onSalir = () => { const p = pending; setPending(null); go(p); };

  return (
    <Ctx.Provider value={{ setBlocker, requestNavigate }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setPending(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white">¿Guardar antes de salir?</h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Tienes {what} cargada sin guardar. Si sales sin guardar, se perderá.
            </p>
            <div className="mt-5 space-y-2">
              <button
                onClick={onGuardar}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar y salir
              </button>
              <button
                onClick={onSalir}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 font-medium text-sm hover:bg-red-500/20 disabled:opacity-60 transition-colors"
              >
                <LogOut size={16} /> Salir sin guardar
              </button>
              <button
                onClick={() => setPending(null)}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium text-sm hover:bg-slate-700/50 disabled:opacity-60 transition-colors"
              >
                <X size={16} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
