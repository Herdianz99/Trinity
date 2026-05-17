'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, Eye, EyeOff, X } from 'lucide-react';

interface DynamicKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorized: () => void;
  permission: string;
  title?: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  action: string;
}

export default function DynamicKeyModal({
  isOpen,
  onClose,
  onAuthorized,
  permission,
  title = 'Esta accion requiere autorizacion',
  description = 'Ingresa la clave de supervisor para continuar',
  entityType,
  entityId,
  action,
}: DynamicKeyModalProps) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/proxy/dynamic-keys/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          permission,
          entityType,
          entityId,
          action,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Clave incorrecta o sin permisos para esta accion');
      }

      setKey('');
      setError('');
      onClose();
      onAuthorized();
    } catch (err: any) {
      setError(err.message || 'Clave incorrecta o sin permisos para esta accion');
      setKey('');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setKey('');
    setError('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <ShieldAlert className="text-amber-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Ingresa la clave de autorizacion..."
              className="input-field !py-3 !pr-12 text-sm w-full"
              autoFocus
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 btn-secondary !py-2.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="flex-1 btn-primary !py-2.5 text-sm flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <ShieldAlert size={16} />}
              Autorizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
