'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Truck, Loader2, Search } from 'lucide-react';
import SeniatModal from '@/components/seniat-modal';

const defaultForm = {
  name: '', rif: '', phone: '', email: '', address: '', contactName: '',
  creditDays: 0, isRetentionAgent: false, isActive: true,
};

export default function NewSupplierPage() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rifWarning, setRifWarning] = useState('');
  const [seniatOpen, setSeniatOpen] = useState(false);

  function handleSeniatResult(data: { name: string; documentType: string; documentNumber: string }) {
    setForm(f => ({
      ...f,
      name: data.name,
      rif: data.documentNumber ? `${data.documentType || ''}${data.documentNumber}`.replace(/^-+/, '') : f.rif,
    }));
    setMessage({ type: 'success', text: 'Datos importados del SENIAT correctamente' });
  }

  useEffect(() => { document.title = 'Nuevo Proveedor | Trinity ERP'; }, []);

  // Check for duplicate RIF
  useEffect(() => {
    const rif = form.rif?.replace(/[-\s]/g, '') || '';
    if (rif.length < 5) { setRifWarning(''); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/proxy/suppliers`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        const match = list.find((s: any) =>
          s.rif && s.rif.replace(/[-\s]/g, '').toUpperCase() === rif.toUpperCase() && s.isActive !== false
        );
        setRifWarning(match ? `Ya existe un proveedor con este RIF: ${match.name}` : '');
      } catch { setRifWarning(''); }
    }, 500);
    return () => clearTimeout(t);
  }, [form.rif]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const body = {
        name: form.name, rif: form.rif || undefined, phone: form.phone || undefined,
        email: form.email || undefined, address: form.address || undefined,
        contactName: form.contactName || undefined,
        creditDays: Number(form.creditDays) || 0,
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
            <div className="flex gap-2">
              <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm flex-1" placeholder="J-12345678-9" />
              <button
                type="button"
                onClick={() => setSeniatOpen(true)}
                className="btn-secondary !py-2 text-xs flex items-center gap-1.5 whitespace-nowrap"
                title="Consultar SENIAT"
              >
                <Search size={14} />
                SENIAT
              </button>
            </div>
          </div>
          {rifWarning && (
            <div className="md:col-span-2 p-2.5 rounded-lg border text-xs bg-amber-500/10 border-amber-500/20 text-amber-400">
              {rifWarning}
            </div>
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
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Dias de credito</label>
            <input type="number" min="0" step="1" value={form.creditDays || ''} onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} className="input-field !py-2 text-sm" placeholder="0" />
            <p className="text-[10px] text-slate-500 mt-1">Al cargar una compra, si es &gt; 0 se marca credito y se autorellenan los dias.</p>
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

      <SeniatModal
        isOpen={seniatOpen}
        onClose={() => setSeniatOpen(false)}
        onResult={handleSeniatResult}
        initialRif={form.rif ? form.rif.replace(/\D/g, '') : ''}
      />
    </div>
  );
}
