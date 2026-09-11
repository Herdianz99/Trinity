'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Plus, Loader2, X, ExternalLink } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string | null;
  accountType: string;
  currency: string;
  openingBalance: number;
  openingDate: string | null;
  isActive: boolean;
  paymentMethods: { id: string; name: string }[];
}

const ACCOUNT_TYPES = ['CORRIENTE', 'AHORRO', 'CUSTODIA', 'ZELLE', 'OTRO'];
const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Convierte texto de monto (acepta coma o punto, permite vacío) a número.
const parseNum = (s: string): number => {
  const n = parseFloat(String(s).replace(/\./g, s.includes(',') ? '' : '.').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
// Solo deja dígitos, un separador (coma/punto) y signo negativo mientras se escribe.
const sanitizeNum = (s: string): string => s.replace(/[^0-9.,-]/g, '');

const emptyForm = {
  name: '',
  bankName: '',
  accountNumber: '',
  accountType: 'CORRIENTE',
  currency: 'VES',
  openingBalance: '',
  exchangeRate: '',
  openingDate: '',
};

export default function CuentasBancariasPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    document.title = 'Cuentas bancarias | Trinity ERP';
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/bancos/accounts');
      setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!form.name.trim() || !form.bankName.trim()) {
      setError('Nombre y banco son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/bancos/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          bankName: form.bankName.trim(),
          accountNumber: form.accountNumber.trim() || undefined,
          accountType: form.accountType,
          currency: form.currency,
          openingBalance: parseNum(form.openingBalance),
          exchangeRate: parseNum(form.exchangeRate),
          openingDate: form.openingDate || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || 'Error al crear la cuenta');
      }
      setModalOpen(false);
      setForm({ ...emptyForm });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/bancos" className="text-slate-400 hover:text-white text-sm">← Bancos</Link>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Landmark className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cuentas bancarias</h1>
            <p className="text-slate-400 text-sm">Catálogo de cuentas y su saldo inicial.</p>
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva cuenta
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Cargando…</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30 text-slate-400">
                <th className="text-left px-4 py-3 font-medium">Cuenta</th>
                <th className="text-left px-4 py-3 font-medium">Banco</th>
                <th className="text-left px-4 py-3 font-medium">N°</th>
                <th className="text-center px-4 py-3 font-medium">Tipo</th>
                <th className="text-center px-4 py-3 font-medium">Moneda</th>
                <th className="text-right px-4 py-3 font-medium">Saldo inicial</th>
                <th className="text-left px-4 py-3 font-medium">Métodos</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/bancos/${a.id}`} className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                      {a.name} <ExternalLink size={12} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.bankName}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono">{a.accountNumber || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{a.accountType}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{a.currency}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {a.currency === 'USD' ? '$ ' : 'Bs '}
                    {fmt(a.openingBalance)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {a.paymentMethods.length ? a.paymentMethods.map((m) => m.name).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {a.isActive ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">Activa</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">Inactiva</span>
                    )}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    No hay cuentas. Crea la primera con “Nueva cuenta”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Nueva cuenta bancaria</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            {error && <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm">
                <span className="text-slate-400">Nombre / alias</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Banesco Corriente Principal" />
              </label>
              <label className="text-sm">
                <span className="text-slate-400">Banco</span>
                <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" placeholder="Banesco" />
              </label>
              <label className="text-sm">
                <span className="text-slate-400">N° de cuenta</span>
                <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" placeholder="0134…" />
              </label>
              <label className="text-sm">
                <span className="text-slate-400">Tipo</span>
                <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-400">Moneda</span>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200">
                  <option value="VES">VES (Bs)</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-400">Saldo inicial</span>
                <input type="text" inputMode="decimal" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: sanitizeNum(e.target.value) })}
                  placeholder="0,00"
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
              </label>
              {form.currency === 'USD' && (
                <label className="text-sm">
                  <span className="text-slate-400">Tasa (para equiv. Bs)</span>
                  <input type="text" inputMode="decimal" value={form.exchangeRate} onChange={(e) => setForm({ ...form, exchangeRate: sanitizeNum(e.target.value) })}
                    placeholder="0,00"
                    className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono" />
                </label>
              )}
              <label className="text-sm">
                <span className="text-slate-400">Fecha de corte</span>
                <input type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
