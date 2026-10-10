'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Copy, Check, UserPlus, Power, RotateCcw } from 'lucide-react';

interface PortalUser { id: string; email: string; name: string; isActive: boolean; lastLoginAt: string | null; mustChangePassword: boolean; }

// Acceso al portal de pedidos (usuario rol CLIENT) de un cliente. Solo se muestra si la
// empresa tiene el portal activo y el usuario es ADMIN/SUPERVISOR (el API responde 403 si no).
export default function CustomerPortalAccess({ customerId, defaultEmail }: { customerId: string; defaultEmail?: string | null }) {
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [email, setEmail] = useState(defaultEmail || '');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const cfg = await fetch('/api/proxy/config').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setEnabled(!!cfg?.clientPortalEnabled);
    if (!cfg?.clientPortalEnabled) return;
    const res = await fetch(`/api/proxy/customers/${customerId}/portal-access`);
    setAllowed(res.ok);
    if (res.ok) setUser((await res.json()).user);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (defaultEmail && !email) setEmail(defaultEmail); }, [defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(method: 'POST' | 'PATCH', body: object) {
    setBusy(true); setError(''); setTempPassword(null); setCopied(false);
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}/portal-access`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((Array.isArray(data.message) ? data.message[0] : data.message) || 'Error');
      setUser(data.user);
      if (data.temporaryPassword) setTempPassword(data.temporaryPassword);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (!enabled || !allowed) return null;

  return (
    <div className="card p-6 space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Acceso al portal de pedidos</h3>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {tempPassword && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
          <p className="text-emerald-300">Contraseña temporal (se muestra solo esta vez; el cliente la cambia al entrar):</p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="px-2 py-1 rounded bg-slate-900 text-white font-mono">{tempPassword}</code>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(tempPassword); setCopied(true); }}
              className="p-1.5 rounded text-slate-300 hover:bg-slate-800" aria-label="Copiar">
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      {!user ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@cliente.com"
            className="input-field !py-2 text-sm flex-1" />
          <button type="button" disabled={busy || !email.trim()} onClick={() => call('POST', { email: email.trim() })}
            className="btn-primary !py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Crear acceso
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-300">
            <p><span className="text-slate-500">Usuario:</span> {user.email}</p>
            <p><span className="text-slate-500">Estado:</span> {user.isActive ? <span className="text-emerald-400">Activo</span> : <span className="text-red-400">Desactivado</span>}
              {user.mustChangePassword && <span className="text-amber-400"> · debe cambiar la contraseña</span>}</p>
            <p><span className="text-slate-500">Último ingreso:</span> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-VE') : 'Nunca'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => call('PATCH', { isActive: !user.isActive })}
              className="btn-secondary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
              <Power size={15} /> {user.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button type="button" disabled={busy} onClick={() => call('PATCH', { resetPassword: true })}
              className="btn-secondary !py-2 text-sm flex items-center gap-2 disabled:opacity-50">
              <RotateCcw size={15} /> Reiniciar contraseña
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
