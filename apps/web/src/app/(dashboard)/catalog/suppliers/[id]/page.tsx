'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Truck, Save, Loader2, ChevronLeft, ChevronRight, ExternalLink,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Supplier {
  id: string; name: string; rif: string | null; phone: string | null;
  email: string | null; address: string | null; contactName: string | null;
  isRetentionAgent: boolean; isActive: boolean;
}
interface PO {
  id: string; number: string; totalUsd: number; status: string; createdAt: string;
}
interface Payable {
  id: string; amountUsd: number; netPayableUsd: number; balanceUsd: number;
  dueDate: string | null; status: string;
  purchaseOrder: { id: string; number: string } | null;
}
interface AccountData {
  supplier: { name: string };
  totalDebt: number; totalOverdue: number; totalRetention: number;
  payables: Payable[];
}

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  SENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RECEIVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviada', PARTIAL: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Purchases
  const [purchases, setPurchases] = useState<PO[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poPage, setPoPage] = useState(1);
  const [poTotalPages, setPoTotalPages] = useState(0);

  // Account / CxP
  const [account, setAccount] = useState<AccountData | null>(null);
  const [accLoading, setAccLoading] = useState(false);

  const fetchSupplier = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/suppliers/${id}`);
      if (!res.ok) throw new Error('Proveedor no encontrado');
      const data = await res.json();
      setSupplier(data);
      setForm({
        name: data.name, rif: data.rif || '', phone: data.phone || '',
        email: data.email || '', address: data.address || '',
        contactName: data.contactName || '',
        isRetentionAgent: data.isRetentionAgent, isActive: data.isActive,
      });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [id]);

  const fetchPurchases = useCallback(async () => {
    setPoLoading(true);
    try {
      const res = await fetch(`/api/proxy/purchase-orders?supplierId=${id}&page=${poPage}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setPurchases(data.data.map((o: any) => ({
          id: o.id, number: o.number, totalUsd: o.totalUsd, status: o.status, createdAt: o.createdAt,
        })));
        setPoTotalPages(data.meta.totalPages);
      }
    } catch { /* ignore */ } finally { setPoLoading(false); }
  }, [id, poPage]);

  const fetchAccount = useCallback(async () => {
    setAccLoading(true);
    try {
      const res = await fetch(`/api/proxy/payables/supplier/${id}`);
      if (res.ok) setAccount(await res.json());
    } catch { /* ignore */ } finally { setAccLoading(false); }
  }, [id]);

  useEffect(() => { fetchSupplier(); }, [fetchSupplier]);
  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);
  useEffect(() => { fetchAccount(); }, [fetchAccount]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      const body = {
        name: form.name, rif: form.rif || undefined, phone: form.phone || undefined,
        email: form.email || undefined, address: form.address || undefined,
        contactName: form.contactName || undefined,
        isRetentionAgent: form.isRetentionAgent, isActive: form.isActive,
      };
      const res = await fetch(`/api/proxy/suppliers/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Proveedor actualizado' });
        fetchSupplier();
      } else { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error'); }
    } catch (err: any) { setSaveMsg({ type: 'error', text: err.message }); } finally { setSaving(false); }
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !supplier) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Proveedor no encontrado'}</p>
      <button onClick={() => router.push('/catalog/suppliers')} className="btn-secondary">Volver a proveedores</button>
    </div>
  );

  const totalPurchased = purchases.reduce((s, p) => s + p.totalUsd, 0);

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
          <h1 className="text-2xl font-bold text-white">{supplier.name}</h1>
          <p className="text-slate-400 text-sm">{supplier.rif || '—'}</p>
        </div>
      </div>

      {saveMsg && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${saveMsg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {saveMsg.text}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="cxp">Cuentas por pagar</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Info ═══ */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre *</label>
                <input type="text" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">RIF</label>
                <input type="text" value={form.rif || ''} onChange={e => setForm((f: any) => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm" placeholder="J-12345678-9" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Telefono</label>
                <input type="text" value={form.phone || ''} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                <input type="email" value={form.email || ''} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Persona de contacto</label>
                <input type="text" value={form.contactName || ''} onChange={e => setForm((f: any) => ({ ...f, contactName: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Direccion</label>
                <input type="text" value={form.address || ''} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.isRetentionAgent ?? false} onChange={e => setForm((f: any) => ({ ...f, isRetentionAgent: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                Agente de retencion
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input type="checkbox" checked={form.isActive ?? true} onChange={e => setForm((f: any) => ({ ...f, isActive: e.target.checked }))} className="rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40" />
                Activo
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </TabsContent>

        {/* ═══ TAB: Compras ═══ */}
        <TabsContent value="compras">
          <div className="card overflow-hidden">
            {poLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-500">Sin ordenes de compra</td></tr>
                    ) : purchases.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-green-400">{p.number}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtDate(p.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${p.totalUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGES[p.status] || ''}`}>
                            {STATUS_LABELS[p.status] || p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => router.push(`/purchases/${p.id}`)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto">
                            Ver orden <ExternalLink size={10} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {purchases.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-700/50">
                        <td colSpan={2} className="px-4 py-3 text-slate-400 font-medium">Total comprado</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-white">${totalPurchased.toFixed(2)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {poTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                    <span className="text-sm text-slate-400">Pagina {poPage} de {poTotalPages}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPoPage(p => Math.max(1, p - 1))} disabled={poPage <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setPoPage(p => Math.min(poTotalPages, p + 1))} disabled={poPage >= poTotalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: CxP ═══ */}
        <TabsContent value="cxp">
          {accLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
          ) : account ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Total Adeudado</p>
                  <p className="text-lg font-bold text-amber-400 font-mono">${account.totalDebt.toFixed(2)}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Total Vencido</p>
                  <p className="text-lg font-bold text-red-400 font-mono">${account.totalOverdue.toFixed(2)}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Retenciones Pendientes</p>
                  <p className="text-lg font-bold text-orange-400 font-mono">${account.totalRetention.toFixed(2)}</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Orden</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Vencimiento</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!account.payables || account.payables.length === 0) ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin cuentas por pagar</td></tr>
                    ) : account.payables.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/30">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{p.purchaseOrder?.number || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${p.netPayableUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">${p.balanceUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{p.dueDate ? fmtDate(p.dueDate) : '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            p.status === 'PENDING' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                            p.status === 'PARTIAL' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                            p.status === 'PAID' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                            'text-red-400 border-red-500/30 bg-red-500/10'
                          }`}>{p.status === 'PENDING' ? 'Pendiente' : p.status === 'PARTIAL' ? 'Parcial' : p.status === 'PAID' ? 'Pagado' : 'Vencido'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => router.push(`/payables/${p.id}`)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto">
                            Ver CxP <ExternalLink size={10} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">No se pudo cargar el estado de cuenta</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
