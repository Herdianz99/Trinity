'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Truck, Loader2 } from 'lucide-react';

const defaultForm = {
  name: '', rif: '', phone: '', email: '', address: '', contactName: '',
  isRetentionAgent: false, isActive: true,
};

export default function NewSupplierPage() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const res = await fetch('/api/proxy/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        router.push(`/catalog/suppliers/${created.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/catalog/suppliers')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Truck className="text-blue-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo Proveedor</h1>
          <p className="text-slate-400 text-sm">Completa los datos del proveedor</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">RIF</label>
            <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm" placeholder="J-12345678-9" />
          </div>
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
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={form.isRetentionAgent} onChange={e => setForm(f => ({ ...f, isRetentionAgent: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
            Agente de retencion
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
          <button type="button" onClick={() => router.push('/catalog/suppliers')} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {saving && <Loader2 className="animate-spin" size={16} />}
            Crear proveedor
          </button>
        </div>
      </form>
    </div>
  );
}
