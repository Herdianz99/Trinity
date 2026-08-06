'use client';

import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check, ExternalLink } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { COMPANIES, findCompanyByHost } from '@/lib/companies';

// Menú para saltar entre las empresas del grupo. La empresa actual se detecta por hostname
// y se marca; las demás abren su URL en una PESTAÑA NUEVA (cada empresa es independiente,
// se entra con su propio login). `label` permite mostrar un nombre exacto (ej. el de la
// config) en el disparador; si no, usa el nombre amigable de la empresa detectada.
export default function CompanySwitcher({
  label,
  triggerClassName,
  align = 'start',
}: {
  label?: string;
  triggerClassName?: string;
  align?: 'start' | 'end' | 'center';
}) {
  const [host, setHost] = useState('');
  useEffect(() => { setHost(window.location.hostname.toLowerCase()); }, []);

  const current = findCompanyByHost(host);
  const triggerText = label || current?.name || 'Seleccionar empresa';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Cambiar de empresa"
          className={triggerClassName || 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/15 transition-colors'}
        >
          <Building2 size={14} className="flex-shrink-0" />
          <span className="truncate">{triggerText}</span>
          <ChevronDown size={13} className="flex-shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="bg-slate-800 border-slate-700 text-slate-200 min-w-[240px]">
        <DropdownMenuLabel className="text-slate-400 text-xs">Ir a otra empresa</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-700" />
        {COMPANIES.map((c) => {
          const isCurrent = c.host === host;
          return (
            <DropdownMenuItem
              key={c.key}
              disabled={isCurrent}
              onClick={() => { if (!isCurrent) window.open(c.url, '_blank', 'noopener,noreferrer'); }}
              className={`cursor-pointer gap-2 focus:bg-slate-700 focus:text-white ${isCurrent ? 'opacity-100 text-emerald-300' : 'text-slate-200'}`}
            >
              {isCurrent ? <Check size={14} className="text-emerald-400" /> : <Building2 size={14} className="text-slate-400" />}
              <span className="truncate">{c.name}</span>
              {isCurrent
                ? <span className="ml-auto text-[10px] text-slate-500">actual</span>
                : <ExternalLink size={12} className="ml-auto opacity-60" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
