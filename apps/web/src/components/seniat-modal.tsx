'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Search, RefreshCw } from 'lucide-react';

interface SeniatResult {
  name: string;
  documentType: string;
  documentNumber: string;
  error?: string;
}

interface SeniatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (data: SeniatResult) => void;
  /** Pre-fill the RIF field with existing value */
  initialRif?: string;
}

export default function SeniatModal({ isOpen, onClose, onResult, initialRif }: SeniatModalProps) {
  const [sessionId, setSessionId] = useState('');
  const [captchaBase64, setCaptchaBase64] = useState('');
  const [rif, setRif] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const captchaInputRef = useRef<HTMLInputElement>(null);
  const rifInputRef = useRef<HTMLInputElement>(null);

  // Fetch captcha when modal opens
  useEffect(() => {
    if (isOpen) {
      setRif(initialRif || '');
      setCaptcha('');
      setError('');
      fetchCaptcha();
    } else {
      setSessionId('');
      setCaptchaBase64('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function fetchCaptcha() {
    setLoading(true);
    setError('');
    setCaptchaBase64('');
    setSessionId('');
    setCaptcha('');
    try {
      const res = await fetch('/api/proxy/customers/seniat-captcha');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al obtener captcha');
      }
      const data = await res.json();
      setSessionId(data.sessionId);
      setCaptchaBase64(data.captchaBase64);
      // Focus RIF field if empty, otherwise focus captcha
      setTimeout(() => {
        if (!rif && rifInputRef.current) rifInputRef.current.focus();
        else if (captchaInputRef.current) captchaInputRef.current.focus();
      }, 100);
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar con el SENIAT');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!rif.trim() || !captcha.trim() || !sessionId) return;

    setSearching(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/customers/seniat-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, rif: rif.trim().toUpperCase(), captcha: captcha.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Error en la consulta');
      }
      if (data.error) {
        setError(data.error);
        // Refresh captcha for retry
        fetchCaptcha();
        return;
      }
      if (data.name) {
        onResult(data);
        onClose();
      } else {
        setError('No se encontraron datos. Verifique el RIF y el captcha.');
        fetchCaptcha();
      }
    } catch (err: any) {
      setError(err.message || 'Error al consultar');
      fetchCaptcha();
    } finally {
      setSearching(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-white">Consulta SENIAT</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="p-4 space-y-3">
          {/* RIF field */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">RIF (ej: V123456789)</label>
            <input
              ref={rifInputRef}
              type="text"
              value={rif}
              onChange={e => setRif(e.target.value.toUpperCase())}
              maxLength={10}
              className="input-field !py-2 text-sm w-full font-mono"
              placeholder="V123456789"
              disabled={searching}
            />
          </div>

          {/* Captcha image + input */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Escriba el texto de la imagen</label>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="animate-spin text-green-500" size={24} />
                <span className="ml-2 text-sm text-slate-400">Cargando captcha...</span>
              </div>
            ) : captchaBase64 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="bg-white rounded-lg p-1 flex-1 flex items-center justify-center">
                    <img
                      src={`data:image/jpeg;base64,${captchaBase64}`}
                      alt="Captcha SENIAT"
                      className="max-h-12"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={fetchCaptcha}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Recargar captcha"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <input
                  ref={captchaInputRef}
                  type="text"
                  value={captcha}
                  onChange={e => setCaptcha(e.target.value)}
                  maxLength={10}
                  className="input-field !py-2 text-sm w-full"
                  placeholder="Escriba aqui..."
                  disabled={searching}
                />
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-red-400 mb-2">No se pudo cargar el captcha</p>
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto"
                >
                  <RefreshCw size={12} /> Reintentar
                </button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary !py-2 text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={searching || !rif.trim() || !captcha.trim() || !sessionId}
              className="btn-primary !py-2 text-xs flex items-center gap-1.5"
            >
              {searching ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
              Buscar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
