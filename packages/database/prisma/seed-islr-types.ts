/**
 * Seed de Tipos de Retención ISLR (Venezuela — Decreto 1808).
 * 86 conceptos oficiales. Se usa en el seed principal (`seed.ts`) para que cada
 * empresa nueva arranque con la tabla completa, y también es ejecutable standalone:
 *   pnpm --filter @trinity/database exec tsx prisma/seed-islr-types.ts
 *
 * Campos:
 * - codigo: nº del concepto (1..86)
 * - descripcion: texto del concepto
 * - baseImponiblePct: % de la base imponible (100 salvo excepciones)
 * - retentionPct: % de retención
 * - sustraendoUt: sustraendo en UT (solo aplica a persona natural residente)
 * - forPersonaJuridica / forPersonaResidente: a quién aplica
 */

import { PrismaClient } from '@prisma/client';

export interface IslrType {
  codigo: number;
  descripcion: string;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
  forPersonaJuridica: boolean;
  forPersonaResidente: boolean;
}

// PJ = Persona Jurídica, PR = Persona Residente (según columnas del SENIAT)
export const ISLR_TYPES: IslrType[] = [
  { codigo: 1, descripcion: 'SUELDO Y SALARIOS', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 0.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 2, descripcion: 'HONORARIOS PROFESIONALES PERSONA NATURAL RESIDENTE', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 3, descripcion: 'HONORARIOS PROFESIONALES PERSONA NATURAL NO RESIDENTE', baseImponiblePct: 90, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 4, descripcion: 'HONORARIOS PROFESIONALES PERSONA JURIDICA DOMICILIADA', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 5, descripcion: 'HONORARIOS PROFESIONALES PERSONA JURIDICA NO DOMICILIADA', baseImponiblePct: 90, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 6, descripcion: 'HONORARIOS PROFESIONALES MANCOMUNADOS NO MERCANTILES(PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 7, descripcion: 'HONORARIOS PROFESIONALES MANCOMUNADOS NO MERCANTILES(PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 8, descripcion: 'HONORARIOS PROFESIONALES MANCOMUNADOS NO MERCANTILES(PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 9, descripcion: 'HONORARIOS PROFESIONALES MANCOMUNADOS NO MERCANTILES(PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 10, descripcion: 'HONORARIOS PROFESIONALES PAGADOS A JINETES, VET, PREP. O ENTR. (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 11, descripcion: 'HONORARIOS PROFESIONALES PAGADOS A JINETES, VET, PREP. O ENTR. (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 12, descripcion: 'HONORARIOS PROF. PAG. POR CLINICAS, HOSP. COLEG. PROF. (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 13, descripcion: 'HONORARIOS PROF. PAG. POR CLINICAS, HOSP. COLEG. PROF. PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 14, descripcion: 'COMISIONES A PERSONAS NATURALES RESIDENTES', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 15, descripcion: 'COMISIONES A PERSONAS NATURALES NO RESIDENTES', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 16, descripcion: 'COMISIONES A PERSONAS JURIDICAS DOMICILIADAS', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 17, descripcion: 'COMISIONES A PERSONAS JURIDICAS NO DOMICILIADAS', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 18, descripcion: 'CUALQUIER OTRA COMISIÓN DISTINTAS A LOS SUELDOS, SALARIOS (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 19, descripcion: 'CUALQUIER OTRA COMISIÓN DISTINTAS A LOS SUELDOS, SALARIOS (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 20, descripcion: 'CUALQUIER OTRA COMISIÓN DISTINTAS A LOS SUELDOS, SALARIOS (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 21, descripcion: 'CUALQUIER OTRA COMISIÓN DISTINTAS A LOS SUELDOS, SALARIOS (PJND)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 22, descripcion: 'INTERESES DE CAPITALES (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 23, descripcion: 'INTERESES DE CAPITALES (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 24, descripcion: 'INTERESES PROVENIENTES DE PRÉSTAMOS(PJND)', baseImponiblePct: 100, retentionPct: 495, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 25, descripcion: 'INTERESES PROVENIENTES DE PRÉSTAMOS(PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 26, descripcion: 'INTERESES PAGADOS POR LAS PERSONAS JURÍDICAS O COMUNIDADES(PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 27, descripcion: 'INTERESES PAGADOS POR LAS PERSONAS JURÍDICAS O COMUNIDADES(PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 28, descripcion: 'INTERESES PAGADOS POR LAS PERSONAS JURÍDICAS O COMUNIDADES(PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 29, descripcion: 'ENRIQUECIMIENTOS NETOS DE LAS AGENCIAS INTERNACIONALES (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 30, descripcion: 'ENRIQUECIMIENTOS NETOS DE GASTOS DE TRANSPORTE (PNNR)', baseImponiblePct: 100, retentionPct: 10, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 31, descripcion: 'ENRIQUECIMIENTOS NETOS DE GASTOS DE TRANSPORTE (PJND)', baseImponiblePct: 100, retentionPct: 10, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 32, descripcion: 'ENRIQUECIMIENTOS NETOS DE EXHIBICIÓN DE PELÍCULAS,CINE (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 33, descripcion: 'ENRIQUECIMIENTOS NETOS DE EXHIBICIÓN DE PELÍCULAS,CINE (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 34, descripcion: 'ENRIQUECIMIENTOS NETOS DE EXHIBICIÓN DE PELÍCULAS,CINE (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 35, descripcion: 'ENRIQUECIMIENTOS NETOS DE EXHIBICIÓN DE PELÍCULAS,CINE (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 36, descripcion: 'ENRIQUECIMIENTOS POR HONORARIO, PAGO ANÁLOGO POR ASIST. TÉCNICA(PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 37, descripcion: 'ENRIQUECIMIENTOS POR HONORARIO, PAGO ANÁLOGO POR ASIST. TÉCNICA(PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 38, descripcion: 'ENRIQUECIMIENTOS POR SERVICIOS TECNOLÓGICOS (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 39, descripcion: 'ENRIQUECIMIENTOS POR SERVICIOS TECNOLÓGICOS (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 40, descripcion: 'ENRIQUECIMIENTOS NETOS DERIVADOS DE LAS PRIMAS DE SEGUROS (PJND)', baseImponiblePct: 100, retentionPct: 10, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 41, descripcion: 'GANANCIAS OBTENIDAS POR JUEGOS Y APUESTAS (PNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 11.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 42, descripcion: 'GANANCIAS OBTENIDAS POR JUEGOS Y APUESTAS (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 43, descripcion: 'GANANCIAS OBTENIDAS POR JUEGOS Y APUESTAS (PJD)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 44, descripcion: 'GANANCIAS OBTENIDAS POR JUEGOS Y APUESTAS (PJND)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 45, descripcion: 'GANANCIAS OBTENIDAS POR PREMIOS DE LOTERÍAS Y DE HIPÓDROMOS (PNR)', baseImponiblePct: 100, retentionPct: 16, sustraendoUt: 5.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 46, descripcion: 'GANANCIAS OBTENIDAS POR PREMIOS DE LOTERÍAS Y DE HIPÓDROMOS (PNNR)', baseImponiblePct: 100, retentionPct: 16, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 47, descripcion: 'GANANCIAS OBTENIDAS POR PREMIOS DE LOTERÍAS Y DE HIPÓDROMOS (PJD)', baseImponiblePct: 100, retentionPct: 16, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 48, descripcion: 'GANANCIAS OBTENIDAS POR PREMIOS DE LOTERÍAS Y DE HIPÓDROMOS (PJND)', baseImponiblePct: 100, retentionPct: 16, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 49, descripcion: 'PAGOS A PROPIETARIOS DE ANIMALES DE CARRERA POR PREMIOS (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 50, descripcion: 'PAGOS A PROPIETARIOS DE ANIMALES DE CARRERA POR PREMIOS (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 51, descripcion: 'PAGOS A PROPIETARIOS DE ANIMALES DE CARRERA POR PREMIOS (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 52, descripcion: 'PAGOS A PROPIETARIOS DE ANIMALES DE CARRERA POR PREMIOS (PJND)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 53, descripcion: 'PAGO A EMPRESAS CONTRATISTAS PERSONAS NATURALES RESIDENTES', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 0.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 54, descripcion: 'PAGO A EMPRESAS CONTRATISTAS PERSONAS NATURALES NO RESIDENTES', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 55, descripcion: 'PAGO A EMPRESAS CONTRATISTAS PERSONAS JURIDICAS DOMICILIADAS', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 56, descripcion: 'PAGO A EMPRESAS CONTRATISTAS PERSONAS NATURALES NO DOMICILIADAS', baseImponiblePct: 100, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 57, descripcion: 'PAGOS DE LOS ADMINISTRADORES DE BIENES INMUEBLES (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 58, descripcion: 'PAGOS DE LOS ADMINISTRADORES DE BIENES INMUEBLES (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 59, descripcion: 'PAGOS DE LOS ADMINISTRADORES DE BIENES INMUEBLES (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 60, descripcion: 'PAGOS DE LOS ADMINISTRADORES DE BIENES INMUEBLES (PJND)', baseImponiblePct: 100, retentionPct: 15, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 61, descripcion: 'ARRENDAMIENTOS CON ARRENDADORES PERSONAS NATURALES RESIDENTES', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 62, descripcion: 'ARRENDAMIENTOS CON ARRENDADORES PERSONAS NATURALES NO RESIDENTES', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 63, descripcion: 'ARRENDAMIENTOS CON ARRENDADORES PERSONAS JURIDICAS DOMICILIADAS', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 64, descripcion: 'ARRENDAMIENTOS CON ARRENDADORES PERSONAS JURIDICAS NO DOMICILIADAS', baseImponiblePct: 100, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 65, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO O CONSUMO (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 66, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO O CONSUMO (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 11.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 67, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO O CONSUMO (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 68, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO O CONSUMO (PJND)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 69, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO (PNR)', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 0.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 70, descripcion: 'PAGOS DE LAS EMPRESAS EMISORAS DE TARJETAS DE CRÉDITO (PJD)', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 71, descripcion: 'PAGOS POR GASTOS DE TRANSPORTE CONFORMADOS POR FLETES (PNR)', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 0.33, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 72, descripcion: 'PAGOS POR GASTOS DE TRANSPORTE CONFORMADOS POR FLETES (PJD)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 73, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGURO (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 74, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGURO (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 75, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGURO A SUS CONTRATISTAS(PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 76, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGURO A SUS CONTRATISTAS(PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 77, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGUROS A CLÍNICAS (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 78, descripcion: 'PAGOS DE LAS EMPRESAS DE SEGUROS A CLÍNICAS (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 79, descripcion: 'CANTIDADES QUE SE PAGUEN POR ADQUISICIÓN DE FONDOS DE COMERCIO (PNR)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 80, descripcion: 'CANTIDADES QUE SE PAGUEN POR ADQUISICIÓN DE FONDOS DE COMERCIO (PNNR)', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },
  { codigo: 81, descripcion: 'CANTIDADES QUE SE PAGUEN POR ADQUISICIÓN DE FONDOS DE COMERCIO (PJD)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 82, descripcion: 'CANTIDADES QUE SE PAGUEN POR ADQUISICIÓN DE FONDOS DE COMERCIO (PJND)', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 83, descripcion: 'SERVICIO DE PUBLICIDAD PAGADO A PERSONAS NATURALES RESIDENTES', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 84, descripcion: 'SERVICIO DE PUBLICIDAD PAGADO A PERSONAS JURIDICAS DOMICILIADAS', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
  { codigo: 85, descripcion: 'SERVICIO DE PUBLICIDAD PAGADO A PERSONAS JURIDICAS NO DOMICILIADAS', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 86, descripcion: 'SERVICIO DE PUBLICIDAD EMISORA DE RADIO PERSONAS JURIDICAS DOMICILIADA', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
];

/** Upsert (por codigo) de los 86 tipos ISLR. Idempotente. */
export async function seedIslrTypes(prisma: PrismaClient): Promise<number> {
  for (const t of ISLR_TYPES) {
    await prisma.islrRetentionType.upsert({
      where: { codigo: t.codigo },
      update: {
        descripcion: t.descripcion,
        baseImponiblePct: t.baseImponiblePct,
        retentionPct: t.retentionPct,
        sustraendoUt: t.sustraendoUt,
        forPersonaJuridica: t.forPersonaJuridica,
        forPersonaResidente: t.forPersonaResidente,
      },
      create: { ...t, isActive: true },
    });
  }
  return ISLR_TYPES.length;
}

// Ejecutable standalone
if (require.main === module) {
  const prisma = new PrismaClient();
  seedIslrTypes(prisma)
    .then((n) => console.log(`✓ ${n} tipos de retención ISLR sembrados`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
