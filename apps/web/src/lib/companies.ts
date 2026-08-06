// Directorio de empresas del grupo — HARDCODEADO a propósito (sin endpoint) para poder
// mostrar el nombre de la empresa en el login (página sin auth) y armar el menú de salto
// entre empresas, sin exponer superficie de seguridad. Solo contiene datos públicos
// (nombre + subdominio); cada empresa sigue 100% aislada (BD/sesión propias).
//
// Para agregar/renombrar una empresa: editar esta lista y desplegar.

export interface Company {
  key: string;
  name: string; // nombre amigable que ve el usuario
  host: string; // hostname exacto del subdominio (para detectar la empresa actual)
  url: string;  // URL a abrir al saltar a esa empresa
}

export const COMPANIES: Company[] = [
  { key: 'inversiones', name: 'Inversiones El Trébol',      host: 'inversiones.eltrebol.app', url: 'https://inversiones.eltrebol.app' },
  { key: 'eltrebol',    name: 'Ferreconstrucciones El Trébol', host: 'eltrebol.app',         url: 'https://eltrebol.app' },
  { key: 'total',       name: 'Total Tools',                 host: 'total.eltrebol.app',       url: 'https://total.eltrebol.app' },
  { key: 'totalturen',  name: 'Total Tools Turén',           host: 'totalturen.eltrebol.app',  url: 'https://totalturen.eltrebol.app' },
  { key: 'aceros',      name: 'Aceros Portuguesa',           host: 'aceros.eltrebol.app',      url: 'https://aceros.eltrebol.app' },
  { key: 'acerosmayor', name: 'Aceros Mayor',                host: 'acerosmayor.eltrebol.app', url: 'https://acerosmayor.eltrebol.app' },
];

// Empresa actual según el hostname del navegador (undefined en localhost/host desconocido).
export function findCompanyByHost(hostname: string): Company | undefined {
  const h = (hostname || '').toLowerCase();
  return COMPANIES.find((c) => c.host === h);
}
