'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Users, BarChart3 } from 'lucide-react';
import { api, TemplatesResponse, WhatsAppIcon } from './shared';
import ClientesTab from './clientes';
import ResultadosTab from './resultados';

// Campana de WhatsApp: mensajes personalizados por rubro / estado del cliente, enviados a mano
// por WhatsApp Web o la app (sin API paga). Reemplaza la pagina local Desktop/campana-whatsapp.
export default function CampanaWhatsappPage() {
  const [view, setView] = useState<'clientes' | 'resultados'>('clientes');
  const [cfg, setCfg] = useState<TemplatesResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Campaña WhatsApp | Trinity ERP'; }, []);

  const loadCfg = useCallback(async () => {
    try {
      setCfg(await api<TemplatesResponse>('/plantillas'));
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { loadCfg(); }, [loadCfg]);

  return (
    <div className="max-w-[1280px] mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400"><WhatsAppIcon size={20} /></span>
            Campaña de WhatsApp
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Mensajes personalizados por rubro y estado del cliente. WhatsApp se abre con el texto listo; tú le das enviar.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-800/70 border border-slate-700/60 p-1 self-start">
          {([['clientes', 'Clientes', Users], ['resultados', 'Resultados', BarChart3]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
                view === k ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">{error}</div>}

      {!cfg && !error && (
        <div className="py-20 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
      )}

      {cfg && (view === 'clientes' ? <ClientesTab cfg={cfg} reloadCfg={loadCfg} /> : <ResultadosTab />)}
    </div>
  );
}
