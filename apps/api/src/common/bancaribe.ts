// Reglas de la plantilla oficial "Generador de TXT Bancaribe" (macros VBA CodigoCuenta,
// rif y Caracteres), portadas 1:1 para que Trinity rechace antes lo que el banco rechazaria.

const onlyDigits = (s: string) => s.replace(/\D/g, '');

// Digitos verificadores (posiciones 9 y 10) de una cuenta venezolana de 20 digitos.
// Macro Modulo11: suma8 = primeros 8 x [3,2,7,6,5,4,3,2]; suma10 = ultimos 10 x
// [5,4,3,2,7,6,5,4,3,2] + digitos 5..8 x [3,2,7,6]. DV = 11 - resto (10->0, 11->1).
export function isValidVeAccount(raw: string | null | undefined): boolean {
  const a = onlyDigits(String(raw ?? ''));
  if (a.length !== 20) return false;
  const d = [...a].map(Number);
  const F8 = [3, 2, 7, 6, 5, 4, 3, 2];
  const F10 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const AG = [3, 2, 7, 6];
  let s8 = 0;
  for (let i = 0; i < 8; i++) s8 += d[i] * F8[i];
  let s10 = 0;
  for (let i = 0; i < 10; i++) s10 += d[10 + i] * F10[i];
  for (let i = 0; i < 4; i++) s10 += d[4 + i] * AG[i];
  const dv = (s: number) => {
    const r = 11 - (s % 11);
    return r === 10 ? 0 : r === 11 ? 1 : r;
  };
  return d[8] === dv(s8) && d[9] === dv(s10);
}

// Digito verificador del RIF (macro Modulo11Rif). Acepta guiones/espacios.
export function isValidRif(raw: string | null | undefined): boolean {
  let r = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[VEJGPC]\d{1,9}$/.test(r)) return false;
  r = r[0] + r.slice(1).padStart(9, '0');
  const factor: Record<string, number> = { V: 1, E: 2, J: 3, C: 3, P: 4, G: 5 };
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  let s = factor[r[0]] * 4;
  for (let i = 0; i < 8; i++) s += Number(r[1 + i]) * w[i];
  let v = 11 - (s % 11);
  if (v >= 10 || v < 1) v = 0;
  return Number(r[9]) === v;
}

const stripAccents = (s: string) =>
  s.toUpperCase().replace(/Ñ/g, 'N').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nombre del beneficiario (macro FormatoDataNombre): mayusculas, sin acentos, & -> Y,
// cualquier simbolo -> espacio, maximo 64.
export function cleanBankName(name: string): string {
  return stripAccents(name).replace(/&/g, ' Y ').replace(/[^A-Z0-9]+/g, ' ').trim().slice(0, 64);
}

// Referencia (macro FormatoDataGenerico): mayusculas, sin acentos ni simbolos.
export function cleanBankRef(ref: string): string {
  return stripAccents(ref).replace(/[^A-Z0-9]/g, '');
}

// Documento tal como lo espera la plantilla: letra + numero, sin guiones.
// Pasaporte: la macro antepone "P".
export function bankDocument(rif: string, docType: string): string {
  const doc = String(rif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return docType === 'P' ? `P${doc}` : doc;
}

// Motivos por los que un proveedor NO se puede exportar (vacio = listo).
export function supplierBankIssues(s: {
  bankAccount: string | null;
  bankDocType: string | null;
  rif: string | null;
}): string[] {
  const issues: string[] = [];
  if (!s.bankAccount) issues.push('Sin cuenta bancaria');
  else if (!isValidVeAccount(s.bankAccount)) issues.push('Cuenta bancaria inválida');
  if (!s.bankDocType) issues.push('Sin tipo de documento');
  if (!s.rif) issues.push('Sin RIF/cédula');
  else if (s.bankDocType === 'R' && !isValidRif(s.rif)) issues.push('RIF inválido');
  else if (s.bankDocType === 'C' && !/^[VE]\d{1,9}$/.test(bankDocument(s.rif, 'C'))) issues.push('Cédula inválida');
  return issues;
}
