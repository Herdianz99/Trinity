'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserCheck, Loader2, Search } from 'lucide-react';

const SENIAT_URL = 'http://contribuyente.seniat.gob.ve/BuscaRif/BuscaRif.jsp';

const defaultForm = {
  name: '', documentType: 'V', rif: '', phone: '', email: '', address: '',
  creditLimit: 0, creditDays: 0,
};

export default function NewCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [seniatLoading, setSeniatLoading] = useState(false);
  const seniatPollRef = useRef<any>(null);

  function openSeniat() {
    setSeniatLoading(true);
    localStorage.removeItem('seniat_result');
    window.open(SENIAT_URL, 'seniat_window', 'width=900,height=700,scrollbars=yes');

    // Poll localStorage for result
    seniatPollRef.current = setInterval(async () => {
      const result = localStorage.getItem('seniat_result');
      if (result) {
        clearInterval(seniatPollRef.current);
        localStorage.removeItem('seniat_result');
        setSeniatLoading(false);
        try {
          const res = await fetch('/api/proxy/customers/seniat-parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: result }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.name) {
              setForm(f => ({
                ...f,
                name: data.name,
                documentType: data.documentType || f.documentType,
                rif: data.documentNumber || f.rif,
              }));
              setMessage({ type: 'success', text: 'Datos importados del SENIAT correctamente' });
            } else {
              setMessage({ type: 'error', text: 'No se encontraron datos en la respuesta del SENIAT' });
            }
          }
        } catch {
          setMessage({ type: 'error', text: 'Error al procesar datos del SENIAT' });
        }
      }
    }, 500);

    // Auto-stop polling after 5 minutes
    setTimeout(() => {
      if (seniatPollRef.current) {
        clearInterval(seniatPollRef.current);
        setSeniatLoading(false);
      }
    }, 300000);
  }

  useEffect(() => {
    return () => { if (seniatPollRef.current) clearInterval(seniatPollRef.current); };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const res = await fetch('/api/proxy/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, creditLimit: Number(form.creditLimit), creditDays: Number(form.creditDays) }),
      });
      if (res.ok) {
        const created = await res.json();
        router.push(`/sales/customers/${created.id}`);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) { setMessage({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/sales/customers')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
          <UserCheck className="text-green-400" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Nuevo Cliente</h1>
          <p className="text-slate-400 text-sm">Completa los datos del cliente</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">RIF / Documento</label>
            <div className="flex gap-2">
              <input type="text" value={form.rif} onChange={e => setForm(f => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm flex-1" placeholder="J-12345678-9" />
              <button
                type="button"
                onClick={openSeniat}
                disabled={seniatLoading}
                className="btn-secondary !py-2 text-xs flex items-center gap-1.5 whitespace-nowrap"
                title="Consultar SENIAT"
              >
                {seniatLoading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                SENIAT
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tipo Doc.</label>
            <select value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value }))} className="input-field !py-2 text-sm">
              {['V', 'E', 'J', 'G', 'C', 'P'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Telefono</label>
            <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Direccion</label>
          <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Limite de Credito USD</label>
            <input type="number" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" step="0.01" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Dias de Credito</label>
            <input type="number" value={form.creditDays} onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
          <button type="button" onClick={() => router.push('/sales/customers')} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
            {saving && <Loader2 className="animate-spin" size={16} />}
            Crear cliente
          </button>
        </div>
      </form>
    </div>
  );
}
