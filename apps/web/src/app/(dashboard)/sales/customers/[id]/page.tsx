'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, UserCheck, Save, Loader2, ChevronLeft, ChevronRight,
  ExternalLink, DollarSign, X, Search, LogOut,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Customer {
  id: string; name: string; documentType: string; rif: string | null;
  phone: string | null; email: string | null; address: string | null;
  creditLimit: number; creditDays: number; isActive: boolean;
  pendingDebt: number; availableCredit: number;
  invoices: { id: string; number: string; status: string; totalUsd: number; totalBs: number; createdAt: string }[];
}
interface Receivable {
  id: string; amountUsd: number; balanceUsd: number; dueDate: string | null;
  status: string; invoice: { id: string; number: string };
}
interface CxCData {
  totalDebt: number; totalOverdue: number; availableCredit: number;
  receivables: Receivable[];
}

const SENIAT_URL = 'http://contribuyente.seniat.gob.ve/BuscaRif/BuscaRif.jsp';

const INV_BADGES: Record<string, string> = {
  PENDING: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  PAID: 'text-green-400 border-green-500/30 bg-green-500/10',
  PARTIAL_RETURN: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  RETURNED: 'text-red-400 border-red-500/30 bg-red-500/10',
  CANCELLED: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const INV_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  PARTIAL_RETURN: 'Dev. Parcial',
  RETURNED: 'Devuelta',
  CANCELLED: 'Cancelada',
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cxc, setCxc] = useState<CxCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active tab + lazy loading
  const [activeTab, setActiveTab] = useState('info');

  // Form
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invoices pagination (server-side)
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(0);
  const [invLoading, setInvLoading] = useState(false);

  // CxC pagination (client-side)
  const [cxcPage, setCxcPage] = useState(1);
  const [cxcLoading, setCxcLoading] = useState(false);

  // SENIAT lookup
  const [seniatLoading, setSeniatLoading] = useState(false);
  const seniatPollRef = useRef<any>(null);

  function openSeniat() {
    setSeniatLoading(true);
    localStorage.removeItem('seniat_result');
    window.open(SENIAT_URL, 'seniat_window', 'width=900,height=700,scrollbars=yes');
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
              setForm((f: any) => ({
                ...f,
                name: data.name,
                documentType: data.documentType || f.documentType,
                rif: data.documentNumber || f.rif,
              }));
              setSaveMsg({ type: 'success', text: 'Datos importados del SENIAT correctamente' });
            } else {
              setSaveMsg({ type: 'error', text: 'No se encontraron datos en la respuesta del SENIAT' });
            }
          }
        } catch {
          setSaveMsg({ type: 'error', text: 'Error al procesar datos del SENIAT' });
        }
      }
    }, 500);
    setTimeout(() => {
      if (seniatPollRef.current) { clearInterval(seniatPollRef.current); setSeniatLoading(false); }
    }, 300000);
  }

  useEffect(() => {
    return () => { if (seniatPollRef.current) clearInterval(seniatPollRef.current); };
  }, []);

  // Pay receivable
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('TRANSFERENCIA');
  const [payRef, setPayRef] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/customers/${id}`);
      if (!res.ok) throw new Error('Cliente no encontrado');
      const data = await res.json();
      setCustomer(data);
      setForm({
        name: data.name, documentType: data.documentType || 'V',
        rif: data.rif || '', phone: data.phone || '', email: data.email || '',
        address: data.address || '', creditLimit: data.creditLimit, creditDays: data.creditDays,
      });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [id]);

  const fetchInvoices = useCallback(async () => {
    setInvLoading(true);
    try {
      const res = await fetch(`/api/proxy/invoices?customerId=${id}&page=${invPage}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.data || []);
        setInvTotalPages(data.totalPages || Math.ceil((data.total || 0) / 20));
      }
    } catch { /* ignore */ } finally { setInvLoading(false); }
  }, [id, invPage]);

  const fetchCxc = useCallback(async () => {
    setCxcLoading(true);
    try {
      const res = await fetch(`/api/proxy/receivables/customer/${id}`);
      if (res.ok) setCxc(await res.json());
    } catch { /* ignore */ } finally { setCxcLoading(false); }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // Lazy load: invoices when sales tab is active
  useEffect(() => {
    if (activeTab === 'sales') fetchInvoices();
  }, [activeTab, invPage, fetchInvoices]);

  // Lazy load: CxC when cxc tab is active
  useEffect(() => {
    if (activeTab === 'cxc') fetchCxc();
  }, [activeTab, fetchCxc]);

  async function handleSave(e?: React.FormEvent): Promise<boolean> {
    if (e) e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/proxy/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, creditLimit: Number(form.creditLimit), creditDays: Number(form.creditDays) }),
      });
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Cliente actualizado' });
        fetchCustomer();
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
    } catch (err: any) { setSaveMsg({ type: 'error', text: err.message }); return false; } finally { setSaving(false); }
  }

  async function handleSaveAndExit() {
    const ok = await handleSave();
    if (ok) router.push('/sales/customers');
  }

  async function handlePay() {
    if (!payingId) return;
    setProcessingPay(true);
    try {
      const res = await fetch(`/api/proxy/receivables/${payingId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: parseFloat(payAmount), method: payMethod, reference: payRef || undefined }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Error'); }
      setPayingId(null);
      setSaveMsg({ type: 'success', text: 'Cobro registrado' });
      fetchCxc();
    } catch (err: any) { setSaveMsg({ type: 'error', text: err.message }); } finally { setProcessingPay(false); }
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-500" size={32} /></div>;
  if (error || !customer) return (
    <div className="text-center py-20">
      <p className="text-red-400 mb-4">{error || 'Cliente no encontrado'}</p>
      <button onClick={() => router.push('/sales/customers')} className="btn-secondary">Volver a clientes</button>
    </div>
  );

  // CxC client-side pagination
  const cxcPerPage = 20;
  const cxcFiltered = cxc?.receivables?.filter(r => r.status !== 'PAID') || [];
  const cxcTotalPages = Math.ceil(cxcFiltered.length / cxcPerPage);
  const pagedCxc = cxcFiltered.slice((cxcPage - 1) * cxcPerPage, cxcPage * cxcPerPage);

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
          <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
          <p className="text-slate-400 text-sm">{customer.documentType}-{customer.rif || '—'}</p>
        </div>
      </div>

      {saveMsg && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${saveMsg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {saveMsg.text}
        </div>
      )}

      <Tabs defaultValue="info" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Informacion General</TabsTrigger>
          <TabsTrigger value="sales">Ventas</TabsTrigger>
          <TabsTrigger value="cxc">Cuentas por cobrar</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Info ═══ */}
        <TabsContent value="info">
          <form onSubmit={handleSave} className="card p-6 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre *</label>
              <input type="text" value={form.name || ''} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-field !py-2 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">RIF / Documento</label>
                <div className="flex gap-2">
                  <input type="text" value={form.rif || ''} onChange={e => setForm((f: any) => ({ ...f, rif: e.target.value }))} className="input-field !py-2 text-sm flex-1" placeholder="J-12345678-9" />
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
                <select value={form.documentType || 'V'} onChange={e => setForm((f: any) => ({ ...f, documentType: e.target.value }))} className="input-field !py-2 text-sm">
                  {['V', 'E', 'J', 'G', 'C', 'P'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Telefono</label>
                <input type="text" value={form.phone || ''} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email</label>
                <input type="email" value={form.email || ''} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} className="input-field !py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Direccion</label>
              <input type="text" value={form.address || ''} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} className="input-field !py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Limite de Credito USD</label>
                <input type="number" value={form.creditLimit ?? 0} onChange={e => setForm((f: any) => ({ ...f, creditLimit: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" step="0.01" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Dias de Credito</label>
                <input type="number" value={form.creditDays ?? 0} onChange={e => setForm((f: any) => ({ ...f, creditDays: Number(e.target.value) }))} className="input-field !py-2 text-sm" min="0" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAndExit}
                className="btn-secondary !py-2.5 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
                Guardar y salir
              </button>
              <button type="submit" disabled={saving} className="btn-primary !py-2.5 text-sm flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </form>
        </TabsContent>

        {/* ═══ TAB: Ventas ═══ */}
        <TabsContent value="sales">
          <div className="card overflow-hidden">
            {invLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Numero</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Fecha</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Total USD</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Total Bs</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin facturas registradas</td></tr>
                    ) : invoices.map((inv: any) => (
                      <tr key={inv.id} className="border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-green-400">{inv.number}</td>
                        <td className="px-4 py-3 text-slate-300">{fmtDate(inv.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${inv.totalUsd?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300 hidden md:table-cell">{inv.totalBs ? `Bs ${inv.totalBs.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${INV_BADGES[inv.status] || INV_BADGES.PENDING}`}>
                            {INV_STATUS_LABELS[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => router.push(`/sales/invoices/${inv.id}`)} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 mx-auto">
                            Ver factura <ExternalLink size={10} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {invTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                    <span className="text-sm text-slate-400">Pagina {invPage} de {invTotalPages}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setInvPage(p => Math.max(1, p - 1))} disabled={invPage <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setInvPage(p => Math.min(invTotalPages, p + 1))} disabled={invPage >= invTotalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB: CxC ═══ */}
        <TabsContent value="cxc">
          {cxcLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-green-500" size={24} /></div>
          ) : cxc ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Deuda Total</p>
                  <p className="text-lg font-bold text-amber-400 font-mono">${cxc.totalDebt?.toFixed(2)}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Total Vencido</p>
                  <p className="text-lg font-bold text-red-400 font-mono">${cxc.totalOverdue?.toFixed(2)}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500">Credito Disponible</p>
                  <p className={`text-lg font-bold font-mono ${cxc.availableCredit > 0 ? 'text-green-400' : 'text-red-400'}`}>${cxc.availableCredit?.toFixed(2)}</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Factura</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Monto</th>
                      <th className="text-right px-4 py-3 text-slate-400 font-medium">Saldo</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium hidden md:table-cell">Vencimiento</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                      <th className="text-center px-4 py-3 text-slate-400 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCxc.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">Sin cuentas pendientes</td></tr>
                    ) : pagedCxc.map(r => (
                      <tr key={r.id} className="border-b border-slate-700/30">
                        <td className="px-4 py-3 font-mono text-green-400 text-xs">{r.invoice.number}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">${r.amountUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">${r.balanceUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            r.status === 'OVERDUE' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                            r.status === 'PARTIAL' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                            'text-amber-400 border-amber-500/30 bg-amber-500/10'
                          }`}>{r.status === 'OVERDUE' ? 'Vencido' : r.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {payingId === r.id ? (
                            <div className="flex items-center gap-1">
                              <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
                              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="bg-slate-900 border border-slate-600 rounded px-1 py-1 text-xs text-slate-200">
                                <option value="TRANSFERENCIA">Transf.</option>
                                <option value="CASH_USD">USD</option>
                                <option value="CASH_BS">Bs</option>
                                <option value="PAGO_MOVIL">PM</option>
                                <option value="ZELLE">Zelle</option>
                              </select>
                              <button onClick={handlePay} disabled={processingPay} className="px-2 py-1 rounded bg-green-600 text-white text-xs">{processingPay ? '...' : 'OK'}</button>
                              <button onClick={() => setPayingId(null)} className="text-slate-400"><X size={12} /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setPayingId(r.id); setPayAmount(r.balanceUsd.toFixed(2)); setPayMethod('TRANSFERENCIA'); setPayRef(''); }} className="p-1 rounded text-green-400 hover:bg-green-500/10" title="Cobrar">
                              <DollarSign size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cxcTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                    <span className="text-sm text-slate-400">Pagina {cxcPage} de {cxcTotalPages}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCxcPage(p => Math.max(1, p - 1))} disabled={cxcPage <= 1} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCxcPage(p => Math.min(cxcTotalPages, p + 1))} disabled={cxcPage >= cxcTotalPages} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
