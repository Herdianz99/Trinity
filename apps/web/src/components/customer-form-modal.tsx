'use client';

import { useState, useEffect } from 'react';
import { X, User, Loader2, Search } from 'lucide-react';
import SeniatModal from '@/components/seniat-modal';

const DOC_TYPES = ['V', 'E', 'J', 'G', 'C', 'P'];

const defaultForm = {
  name: '', documentType: 'V', rif: '', phone: '', email: '', address: '',
  creditLimit: 0, creditDays: 0, creditAuthorizedBy: '',
  isSpecialTaxpayer: false, isGroupCompany: false, isActive: true,
};

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  customerId?: string | null;
  onClose: () => void;
  onSaved: (customer: any) => void;
}

export default function CustomerFormModal({ open, mode, customerId, onClose, onSaved }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);
  const [rifWarning, setRifWarning] = useState('');
  const [seniatOpen, setSeniatOpen] = useState(false);
  // Solo administracion (ADMIN o permiso MANAGE_CUSTOMER_CREDIT) puede editar el credito del cliente.
  const [canEditCredit, setCanEditCredit] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setCanEditCredit(u.role === 'ADMIN' || (u.permissions || []).includes('MANAGE_CUSTOMER_CREDIT')); })
      .catch(() => {});
  }, [open]);

  // Cargar (editar) o limpiar (crear) al abrir
  useEffect(() => {
    if (!open) return;
    setMessage(null); setRifWarning('');
    if (mode === 'edit' && customerId) {
      setLoading(true);
      fetch(`/api/proxy/customers/${customerId}`)
        .then(r => r.ok ? r.json() : null)
        .then(c => {
          if (c) setForm({
            name: c.name || '', documentType: c.documentType || 'V', rif: c.rif || '',
            phone: c.phone || '', email: c.email || '', address: c.address || '',
            creditLimit: c.creditLimit ?? 0, creditDays: c.creditDays ?? 0,
            creditAuthorizedBy: c.creditAuthorizedBy || '',
            isSpecialTaxpayer: !!c.isSpecialTaxpayer, isGroupCompany: !!c.isGroupCompany,
            isActive: c.isActive !== false,
          });
        })
        .finally(() => setLoading(false));
    } else {
      setForm(defaultForm);
    }
  }, [open, mode, customerId]);

  // Aviso de documento duplicado (solo al crear): mismo tipo + numero
  useEffect(() => {
    if (!open || mode === 'edit') { setRifWarning(''); return; }
    const rif = form.rif?.replace(/[-\s]/g, '') || '';
    if (rif.length < 5) { setRifWarning(''); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/customers?search=${encodeURIComponent(rif)}&limit=50&isActive=true`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        const match = list.find((c: any) =>
          c.rif && c.rif.replace(/[-\s]/g, '').toUpperCase() === rif.toUpperCase() && c.documentType === form.documentType
        );
        setRifWarning(match ? `Ya existe un cliente con este documento: ${match.name}` : '');
      } catch { setRifWarning(''); }
    }, 500);
    return () => clearTimeout(t);
  }, [form.rif, form.documentType, open, mode]);

  function handleSeniatResult(data: { name: string; documentType: string; documentNumber: string }) {
    setForm(f => ({
      ...f,
      name: data.name || f.name,
      documentType: DOC_TYPES.includes(data.documentType) ? data.documentType : f.documentType,
      rif: data.documentNumber || f.rif,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // Misma validacion que el formulario original (y que el backend): con cupo > 0,
    // dias y "Autorizado por" son obligatorios.
    const creditLimit = Number(form.creditLimit) || 0;
    if (creditLimit > 0) {
      if (!Number(form.creditDays) || Number(form.creditDays) <= 0) {
        setMessage({ type: 'error', text: 'Con limite de credito, los dias de credito son obligatorios' }); return;
      }
      if (!form.creditAuthorizedBy.trim()) {
        setMessage({ type: 'error', text: 'Con limite de credito, "Autorizado por" es obligatorio' }); return;
      }
    }
    setSaving(true); setMessage(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name, documentType: form.documentType, rif: form.rif || undefined,
        phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined,
        creditLimit, creditDays: Number(form.creditDays) || 0,
        creditAuthorizedBy: form.creditAuthorizedBy || undefined,
        isSpecialTaxpayer: form.isSpecialTaxpayer, isGroupCompany: form.isGroupCompany,
      };
      if (mode === 'edit') body.isActive = form.isActive;
      const url = mode === 'edit' && customerId ? `/api/proxy/customers/${customerId}` : '/api/proxy/customers';
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
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20"><User className="text-green-400" size={18} /></div>
            <h2 className="text-lg font-semibold text-white">{mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-green-400" size={28} /></div>
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
            {message && <div className="p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/20 text-red-400">{message.text}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre / Razon social *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Documento</label>
                <div className="flex gap-2">
                  <select value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value }))} className="input-field !py-2 text-sm w-16">
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm flex-1" placeholder="12345678" />
                  <button type="button" onClick={() => setSeniatOpen(true)} className="btn-secondary !py-2 text-xs flex items-center gap-1.5 whitespace-nowrap" title="Consultar SENIAT">
                    <Search size={14} /> SENIAT
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Telefono</label>
                <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              {rifWarning && (
                <div className="md:col-span-2 p-2.5 rounded-lg border text-xs bg-amber-500/10 border-amber-500/20 text-amber-400">{rifWarning}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Direccion</label>
                <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cupo de credito (USD)</label>
                <input type="number" min="0" step="0.01" value={form.creditLimit || ''} disabled={!canEditCredit} onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} className="input-field !py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Dias de credito {form.creditLimit > 0 && <span className="text-red-400">*</span>}</label>
                <input type="number" min="0" step="1" value={form.creditDays || ''} disabled={!canEditCredit} onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} className="input-field !py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed" placeholder="0" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Autorizado por {form.creditLimit > 0 && <span className="text-red-400">*</span>}</label>
                <input type="text" value={form.creditAuthorizedBy} disabled={!canEditCredit} onChange={e => setForm(f => ({ ...f, creditAuthorizedBy: e.target.value }))} className="input-field !py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed" placeholder="Quien aprobo la linea de credito" />
              </div>
              {!canEditCredit && (
                <p className="md:col-span-2 text-xs text-amber-400">Solo administracion puede editar el credito del cliente.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.isSpecialTaxpayer} onChange={e => setForm(f => ({ ...f, isSpecialTaxpayer: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                Contribuyente especial
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.isGroupCompany} onChange={e => setForm(f => ({ ...f, isGroupCompany: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                Empresa del grupo
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving && <Loader2 className="animate-spin" size={16} />}
                {mode === 'edit' ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        )}
      </div>

      <SeniatModal isOpen={seniatOpen} onClose={() => setSeniatOpen(false)} onResult={handleSeniatResult} initialRif={form.rif ? form.rif.replace(/\D/g, '') : ''} />
    </div>
  );
}
