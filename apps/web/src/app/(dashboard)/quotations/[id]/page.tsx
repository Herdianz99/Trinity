'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Printer,
  ArrowRightCircle,
  User as UserIcon,
  Phone,
  X,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-slate-300 border-slate-600 bg-slate-700/30',
  SENT: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  APPROVED: 'text-green-400 border-green-500/30 bg-green-500/10',
  REJECTED: 'text-red-400 border-red-500/30 bg-red-500/10',
  EXPIRED: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
};
const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

// Número para WhatsApp: asume Venezuela (+58). Quita símbolos, el 0 inicial y antepone 58.
// Devuelve '' si no parece un número válido (58 + 10 dígitos como mínimo).
function waPhone(raw: string | null | undefined): string {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (!d.startsWith('58')) {
    if (d.startsWith('0')) d = d.slice(1);
    d = '58' + d;
  }
  return d.length >= 12 ? d : '';
}

const money = (n: number) =>
  '$' + (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => (n || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 });

// En WhatsApp un mensaje muy largo hace que el enlace falle: más allá de esto se resume.
const WA_MAX_ITEMS = 40;

function buildWhatsAppMessage(q: any, companyName: string): string {
  const nombre = q.customer?.name?.trim();
  const lines: string[] = [nombre ? `Hola, ${nombre}. ¡Buen día!` : '¡Hola! ¡Buen día!', ''];
  const quien = q.seller?.name ? `${q.seller.name}${companyName ? ` de ${companyName}` : ''}` : companyName;
  if (quien) lines.push(`Le saluda ${quien}.`);
  lines.push(`Le envío la cotización *${q.number}*:`, '');

  const items: any[] = q.items || [];
  for (const it of items.slice(0, WA_MAX_ITEMS)) {
    lines.push(`• ${qty(it.quantity)} x ${it.productName} — ${money(it.totalUsd)}`);
  }
  if (items.length > WA_MAX_ITEMS) {
    lines.push(`• … y ${items.length - WA_MAX_ITEMS} producto(s) más (ver PDF)`);
  }

  lines.push('');
  if ((q.ivaUsd || 0) > 0) {
    lines.push(`Subtotal: ${money(q.subtotalUsd)}`, `IVA: ${money(q.ivaUsd)}`);
  }
  lines.push(`*Total: ${money(q.totalUsd)}*`);
  if (q.expiresAt) {
    lines.push('', `Válida hasta el ${new Date(q.expiresAt).toLocaleDateString('es-VE')}.`);
  }
  lines.push('', 'Le adjunto la cotización en PDF. Quedo atento(a) a cualquier duda.');
  return lines.join('\n');
}

// Logo de WhatsApp (SVG inline, sin dependencias).
function WhatsAppIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.157 5.335 5.492 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 001.599 5.339l-.999 3.648 3.889-.336zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

export default function QuotationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [quotation, setQuotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [printChoice, setPrintChoice] = useState(false);
  const [printCurrency, setPrintCurrency] = useState<'USD' | 'BS'>('USD');
  const [companyName, setCompanyName] = useState('');
  const [phoneModal, setPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savePhone, setSavePhone] = useState(true);
  const [phoneError, setPhoneError] = useState('');

  // Nombre de la empresa para el saludo del mensaje de WhatsApp
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => setCompanyName(cfg?.companyName || ''))
      .catch(() => {});
  }, []);

  const fetchQuotation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/quotations/${id}`);
      if (!res.ok) { setNotFound(true); return; }
      setQuotation(await res.json());
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchQuotation(); }, [fetchQuotation]);

  useEffect(() => {
    document.title = quotation
      ? `${quotation.number} - Cotizacion | Trinity ERP`
      : 'Cotizacion | Trinity ERP';
  }, [quotation]);

  async function handleChangeStatus(newStatus: string) {
    try {
      const res = await fetch(`/api/proxy/quotations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      setMessage({ type: 'success', text: `Estado cambiado a ${STATUS_LABELS[newStatus] || newStatus}` });
      fetchQuotation();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleConvert() {
    if (!confirm('¿Convertir esta cotizacion en factura? Se usara la tasa del dia.')) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/proxy/quotations/${id}/convert`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error');
      }
      const invoice = await res.json();
      router.push(`/sales/pos?invoiceId=${invoice.id}`);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      setConverting(false);
    }
  }

  // Mismo comportamiento que el boton Imprimir del listado (/quotations)
  async function handlePrint(hideIva = false, currency: 'USD' | 'BS' = 'USD') {
    setPrintChoice(false);
    const qp = new URLSearchParams();
    if (hideIva) qp.set('hideIva', 'true');
    if (currency === 'BS') qp.set('currency', 'BS');
    const qs = qp.toString();
    const url = `/api/proxy/quotations/${id}/pdf${qs ? `?${qs}` : ''}`;
    const number = quotation?.number || 'cotizacion';
    const filename = `Cotizacion-${number}.pdf`;

    // En desktop (o navegadores sin Web Share): abrir el PDF en pestana nueva para ver/imprimir.
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile || typeof navigator === 'undefined' || !navigator.canShare) {
      window.open(url, '_blank');
      return;
    }

    // En movil: bajar el PDF y abrir el menu nativo de compartir (WhatsApp, correo, etc.)
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename, text: `Cotizacion ${number}` });
      } else {
        // soporta compartir pero no archivos: abrir el PDF
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      }
    } catch (err: any) {
      // Si el usuario cancela el menu de compartir, no hacer nada
      if (err?.name === 'AbortError') return;
      window.open(url, '_blank'); // fallback
    }
  }

  // Abre el chat del cliente con la cotización escrita y baja el PDF para adjuntarlo.
  // window.open va primero y sin await: si no, el navegador lo bloquea como ventana emergente.
  function openWhatsApp(phone: string) {
    const text = encodeURIComponent(buildWhatsAppMessage(quotation, companyName));
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const waUrl = isMobile
      ? `https://wa.me/${phone}?text=${text}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${text}`;
    window.open(waUrl, '_blank');

    const a = document.createElement('a');
    a.href = `/api/proxy/quotations/${id}/pdf`;
    a.download = `Cotizacion-${quotation.number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMessage({ type: 'success', text: `Se descargó el PDF de ${quotation.number}: adjúntalo en el chat y dale a enviar.` });
  }

  function handleWhatsApp() {
    const phone = waPhone(quotation?.customer?.phone);
    if (phone) { openWhatsApp(phone); return; }
    setPhoneInput(quotation?.customer?.phone || '');
    setSavePhone(!!quotation?.customer?.id);
    setPhoneError('');
    setPhoneModal(true);
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phone = waPhone(phoneInput);
    if (!phone) { setPhoneError('Número inválido. Ejemplo: 0414-1234567'); return; }
    setPhoneModal(false);
    openWhatsApp(phone);

    const customerId = quotation?.customer?.id;
    if (savePhone && customerId) {
      const clean = phoneInput.trim();
      fetch(`/api/proxy/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean }),
      })
        .then((res) => {
          if (!res.ok) throw new Error();
          setQuotation((prev: any) => (prev?.customer ? { ...prev, customer: { ...prev.customer, phone: clean } } : prev));
        })
        .catch(() => setMessage({ type: 'error', text: 'Se abrió WhatsApp, pero no se pudo guardar el teléfono en la ficha del cliente.' }));
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-green-500" size={32} />
      </div>
    );
  }

  if (notFound || !quotation) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={() => router.push('/quotations')} className="btn-secondary !py-2 text-sm flex items-center gap-2 mb-4">
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="card p-8 text-center text-slate-400">Cotizacion no encontrada</div>
      </div>
    );
  }

  const canConvert = ['DRAFT', 'APPROVED'].includes(quotation.status);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
      {message && (
        <div className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/quotations')} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400" title="Volver">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white font-mono">{quotation.number}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[quotation.status] || ''}`}>
              {STATUS_LABELS[quotation.status] || quotation.status}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quotation.status === 'DRAFT' && (
            <button onClick={() => handleChangeStatus('SENT')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">Marcar Enviada</button>
          )}
          {['DRAFT', 'SENT'].includes(quotation.status) && (
            <button onClick={() => handleChangeStatus('APPROVED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20">Aprobar</button>
          )}
          {['DRAFT', 'SENT', 'APPROVED'].includes(quotation.status) && (
            <button onClick={() => handleChangeStatus('REJECTED')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">Rechazar</button>
          )}
          {canConvert && (
            <button onClick={handleConvert} disabled={converting} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center gap-1.5 disabled:opacity-40">
              {converting ? <Loader2 className="animate-spin" size={12} /> : <ArrowRightCircle size={12} />}
              Convertir a factura
            </button>
          )}
          <button onClick={() => { setPrintCurrency('USD'); setPrintChoice(true); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 flex items-center gap-1.5">
            <Printer size={12} /> Imprimir PDF
          </button>
          <button onClick={handleWhatsApp} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/25 hover:bg-[#25D366]/20 flex items-center gap-1.5">
            <WhatsAppIcon size={12} /> Enviar por WhatsApp
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="card p-3">
          <span className="text-slate-500 block text-xs mb-0.5">Cliente</span>
          <span className="text-white">{quotation.customer?.name || 'Sin cliente'}</span>
          {quotation.customer?.phone && <span className="text-slate-400 text-xs flex items-center gap-1 mt-0.5"><Phone size={11} /> {quotation.customer.phone}</span>}
        </div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Fecha</span><span className="text-white">{new Date(quotation.createdAt).toLocaleDateString('es-VE')}</span></div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Vence</span><span className="text-white">{quotation.expiresAt ? new Date(quotation.expiresAt).toLocaleDateString('es-VE') : '-'}</span></div>
        <div className="card p-3"><span className="text-slate-500 block text-xs mb-0.5">Items</span><span className="text-white">{quotation.items?.length || 0}</span></div>
      </div>

      {/* Vendedor */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <UserIcon size={13} /> Vendedor
        </h3>
        {quotation.seller ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="text-white font-medium">{quotation.seller.name}</span>
            {quotation.seller.code && <span className="text-slate-500 text-xs font-mono">{quotation.seller.code}</span>}
            {quotation.seller.phone
              ? <span className="text-slate-300 text-sm flex items-center gap-1.5"><Phone size={13} className="text-green-400" /> {quotation.seller.phone}</span>
              : <span className="text-slate-500 text-xs italic">Sin telefono registrado</span>}
          </div>
        ) : (
          <span className="text-slate-500 text-sm italic">Sin vendedor asignado</span>
        )}
      </div>

      {/* Items */}
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 text-slate-400">Codigo</th>
                <th className="text-left py-2 text-slate-400">Producto</th>
                <th className="text-right py-2 text-slate-400">Cant.</th>
                <th className="text-right py-2 text-slate-400">Precio USD</th>
                <th className="text-right py-2 text-slate-400 hidden sm:table-cell">IVA</th>
                <th className="text-right py-2 text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items?.map((item: any) => (
                <tr key={item.id} className="border-b border-slate-700/30">
                  <td className="py-2 text-slate-400 font-mono text-xs">{item.productCode}</td>
                  <td className="py-2 text-white">{item.productName}</td>
                  <td className="py-2 text-right text-slate-300">{item.quantity}</td>
                  <td className="py-2 text-right text-slate-300">${item.unitPriceUsd?.toFixed(2)}</td>
                  <td className="py-2 text-right text-slate-400 text-xs hidden sm:table-cell">{IVA_LABELS[item.ivaType] || item.ivaType}</td>
                  <td className="py-2 text-right text-white font-medium">${item.totalUsd?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="card p-4 max-w-sm ml-auto">
        <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Subtotal</span><span className="text-white">${quotation.subtotalUsd?.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">IVA</span><span className="text-white">${quotation.ivaUsd?.toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2 mt-2">
          <span className="text-slate-300">Total USD</span><span className="text-green-400">${quotation.totalUsd?.toFixed(2)}</span>
        </div>
      </div>

      {quotation.notes && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notas</h3>
          <p className="text-sm text-slate-400">{quotation.notes}</p>
        </div>
      )}

      {quotation.convertedToInvoiceId && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          Esta cotizacion fue convertida a factura.
        </div>
      )}

      {/* Modal: el cliente no tiene teléfono → registrarlo */}
      {phoneModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPhoneModal(false)} />
          <form onSubmit={handlePhoneSubmit} className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/25">
                <WhatsAppIcon size={20} className="text-[#25D366]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Teléfono del cliente</h3>
                <p className="text-sm text-slate-400">{quotation.customer?.name || 'Cotización sin cliente'}</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mt-4">
              {quotation.customer?.phone ? 'El teléfono registrado no es válido para WhatsApp.' : 'Este cliente no tiene teléfono registrado.'} Escribe su número de WhatsApp:
            </p>
            <input
              autoFocus
              type="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
              placeholder="0414-1234567"
              className="input-field w-full mt-3"
            />
            {phoneError && <p className="text-xs text-red-400 mt-1.5">{phoneError}</p>}
            {quotation.customer?.id && (
              <label className="flex items-center gap-2 mt-3 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={savePhone} onChange={(e) => setSavePhone(e.target.checked)} className="accent-green-500" />
                Guardarlo en la ficha del cliente
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPhoneModal(false)} className="btn-secondary !py-2 text-sm">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-[#25D366] text-white hover:bg-[#20bd5a] flex items-center gap-2">
                <WhatsAppIcon size={14} /> Abrir WhatsApp
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Print choice modal */}
      {printChoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPrintChoice(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
                <Printer className="text-green-400" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Imprimir / Compartir</h3>
                <p className="text-sm text-slate-400">Elige el formato del PDF</p>
              </div>
            </div>
            {/* Moneda del reporte */}
            <div className="mt-5">
              <p className="text-xs text-slate-400 mb-2">Moneda del reporte</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPrintCurrency('USD')}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${printCurrency === 'USD' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-slate-700 text-slate-400 hover:bg-slate-700/40'}`}
                >
                  Dólares (USD)
                </button>
                <button
                  onClick={() => setPrintCurrency('BS')}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${printCurrency === 'BS' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-slate-700 text-slate-400 hover:bg-slate-700/40'}`}
                >
                  Bolívares (Bs)
                </button>
              </div>
              {printCurrency === 'BS' && (
                <p className="text-[11px] text-amber-400/80 mt-2">Los precios se calculan a la tasa del día; pueden variar sin previo aviso.</p>
              )}
            </div>

            {/* Formato: con o sin IVA (genera el PDF) */}
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-400 mb-1">Formato del PDF</p>
              <button onClick={() => handlePrint(false, printCurrency)} className="w-full text-left px-4 py-3 rounded-xl border border-slate-700 hover:border-green-500/40 hover:bg-green-500/5 transition-colors">
                <p className="text-sm font-medium text-white">Con IVA</p>
                <p className="text-xs text-slate-500">Muestra el desglose del IVA y el subtotal.</p>
              </button>
              <button onClick={() => handlePrint(true, printCurrency)} className="w-full text-left px-4 py-3 rounded-xl border border-slate-700 hover:border-green-500/40 hover:bg-green-500/5 transition-colors">
                <p className="text-sm font-medium text-white">Sin IVA</p>
                <p className="text-xs text-slate-500">Solo precios y total finales, sin mostrar el impuesto.</p>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setPrintChoice(false)} className="btn-secondary !py-2 text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
