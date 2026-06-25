'use client';

import { useState, useEffect } from 'react';
import { X, Truck, Loader2, Search } from 'lucide-react';
import SeniatModal from '@/components/seniat-modal';

const defaultForm = {
  name: '', rif: '', phone: '', email: '', address: '', contactName: '',
  isRetentionAgent: false, isActive: true,
};

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  supplierId?: string | null;
  onClose: () => void;
  onSaved: (supplier: any) => void;
}

export default function SupplierFormModal({ open, mode, supplierId, onClose, onSaved }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);
  const [rifWarning, setRifWarning] = useState('');
  const [seniatOpen, setSeniatOpen] = useState(false);

  // Cargar (editar) o limpiar (crear) al abrir
  useEffect(() => {
    if (!open) return;
    setMessage(null); setRifWarning('');
    if (mode === 'edit' && supplierId) {
      setLoading(true);
      fetch(`/api/proxy/suppliers/${supplierId}`)
        .then(r => r.ok ? r.json() : null)
        .then(s => {
          if (s) setForm({
            name: s.name || '', rif: s.rif || '', phone: s.phone || '', email: s.email || '',
            address: s.address || '', contactName: s.contactName || '',
            isRetentionAgent: !!s.isRetentionAgent, isActive: s.isActive !== false,
          });
        })
        .finally(() => setLoading(false));
    } else {
      setForm(defaultForm);
    }
  }, [open, mode, supplierId]);

  // Aviso de RIF duplicado (solo al crear)
  useEffect(() => {
    if (!open || mode === 'edit') { setRifWarning(''); return; }
    const rif = form.rif?.replace(/[-\s]/g, '') || '';
    if (rif.length < 5) { setRifWarning(''); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/proxy/suppliers');
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        const match = list.find((s: any) =>
          s.rif && s.rif.replace(/[-\s]/g, '').toUpperCase() === rif.toUpperCase() && s.isActive !== false
        );
        setRifWarning(match ? `Ya existe un proveedor con este RIF: ${match.name}` : '');
      } catch { setRifWarning(''); }
    }, 500);
    return () => clearTimeout(t);
  }, [form.rif, open, mode]);

  function handleSeniatResult(data: { name: string; documentType: string; documentNumber: string }) {
    setForm(f => ({
      ...f,
      name: data.name,
      rif: data.documentNumber ? `${data.documentType || ''}${data.documentNumber}`.replace(/^-+/, '') : f.rif,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const body = {
        name: form.name, rif: form.rif || undefined, phone: form.phone || undefined,
        email: form.email || undefined, address: form.address || undefined,
        contactName: form.contactName || undefined,
        isRetentionAgent: form.isRetentionAgent, isActive: form.isActive,
      };
      const url = mode === 'edit' && supplierId ? `/api/proxy/suppliers/${supplierId}` : '/api/proxy/suppliers';
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error'); }
      const saved = await res.json();
      onSaved(saved);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar' });
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"><Truck className="text-blue-400" size={18} /></div>
            <h2 className="text-lg font-semibold text-white">{mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-blue-400" size={28} /></div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
            {message && <div className="p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{message.text}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">RIF</label>
                <div className="flex gap-2">
                  <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm flex-1" placeholder="J-12345678-9" />
                  <button type="button" onClick={() => setSeniatOpen(true)} className="btn-secondary !py-2 text-xs flex items-center gap-1.5 whitespace-nowrap" title="Consultar SENIAT">
                    <Search size={14} /> SENIAT
                  </button>
                </div>
              </div>
              {rifWarning && (
                <div className="md:col-span-2 p-2.5 rounded-lg border text-xs bg-amber-500/10 border-amber-500/20 text-amber-400">{rifWarning}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Telefono</label>
                <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Persona de contacto</label>
                <input type="text" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Direccion</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={form.isRetentionAgent} onChange={e => setForm(f => ({ ...f, isRetentionAgent: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
              Agente de retencion
            </label>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving && <Loader2 className="animate-spin" size={16} />}
                {mode === 'edit' ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        )}
      </div>

      <SeniatModal isOpen={seniatOpen} onClose={() => setSeniatOpen(false)} onResult={handleSeniatResult} initialRif={form.rif ? form.rif.replace(/\D/g, '') : ''} />
    </div>
  );
}
