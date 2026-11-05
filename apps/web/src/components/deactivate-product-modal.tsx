'use client';

import { useEffect, useRef, useState } from 'react';
import { PackageX, Loader2 } from 'lucide-react';

export const MIN_DEACTIVATION_REASON = 5;

interface Props {
  open: boolean;
  productLabel?: string;
  /** Recibe el motivo ya validado. Si devuelve un string, se muestra como error y el modal sigue abierto. */
  onConfirm: (reason: string) => Promise<string | void> | string | void;
  onCancel: () => void;
}

/** Pide el motivo (obligatorio) antes de desactivar un producto. */
export default function DeactivateProductModal({ open, productLabel, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_DEACTIVATION_REASON;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onConfirm(trimmed);
      if (typeof err === 'string' && err) setError(err);
    } catch (e: any) {
      setError(e?.message || 'Error al desactivar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div className="card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <PackageX className="text-red-400" size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Desactivar producto</h2>
            {productLabel && <p className="text-sm text-slate-400 truncate">{productLabel}</p>}
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-400 mb-1">
          Motivo de la desactivación <span className="text-red-400">*</span>
        </label>
        <textarea
          ref={ref}
          value={reason}
          onChange={e => setReason(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
          rows={3}
          maxLength={500}
          placeholder="Ej: descontinuado por el proveedor, código duplicado, ya no se trabaja..."
          className="input-field text-sm resize-none"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>{valid ? 'Se guardará con la fecha y el usuario.' : `Mínimo ${MIN_DEACTIVATION_REASON} caracteres`}</span>
          <span className="tabular-nums">{reason.length}/500</span>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Desactivar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Texto "Desactivado el dd/mm/aaaa por X: motivo" para mostrar en listados/detalle. */
export function formatDeactivation(p: { deactivatedAt?: string | null; deactivationReason?: string | null; deactivatedBy?: { name: string } | null }) {
  const date = p.deactivatedAt ? new Date(p.deactivatedAt).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
  const parts = [date ? `Desactivado el ${date}` : 'Desactivado', p.deactivatedBy?.name ? `por ${p.deactivatedBy.name}` : null].filter(Boolean).join(' ');
  return p.deactivationReason ? `${parts}: ${p.deactivationReason}` : `${parts} (sin motivo registrado)`;
}
