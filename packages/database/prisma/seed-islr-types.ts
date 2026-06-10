/**
 * Seed script for ISLR Retention Types (Decreto 1808)
 * Run: npx ts-node packages/database/prisma/seed-islr-types.ts
 *
 * 86 tipos de retención ISLR de Venezuela.
 * Cada tipo tiene:
 * - codigo: número único del concepto
 * - descripcion: texto del concepto según Decreto 1808
 * - baseImponiblePct: % de la base imponible que se toma (100% salvo excepciones)
 * - retentionPct: % de retención sobre la base ajustada
 * - sustraendoUt: unidades tributarias del sustraendo (solo aplica a persona natural residente)
 * - forPersonaJuridica / forPersonaResidente: a quién aplica
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface IslrType {
  codigo: number;
  descripcion: string;
  baseImponiblePct: number;
  retentionPct: number;
  sustraendoUt: number;
  forPersonaJuridica: boolean;
  forPersonaResidente: boolean;
}

const tipos: IslrType[] = [
  // ─── Honorarios profesionales ───────────────────────────────────────
  { codigo: 1, descripcion: 'Honorarios profesionales - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 2, descripcion: 'Honorarios profesionales - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 3, descripcion: 'Honorarios profesionales - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Comisiones ─────────────────────────────────────────────────────
  { codigo: 4, descripcion: 'Comisiones mercantiles - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 5, descripcion: 'Comisiones mercantiles - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 6, descripcion: 'Comisiones mercantiles - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Intereses préstamos ────────────────────────────────────────────
  { codigo: 7, descripcion: 'Intereses sobre préstamos - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 8, descripcion: 'Intereses sobre préstamos - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 9, descripcion: 'Intereses sobre préstamos - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Alquileres de inmuebles ────────────────────────────────────────
  { codigo: 10, descripcion: 'Alquiler de inmuebles - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 11, descripcion: 'Alquiler de inmuebles - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 12, descripcion: 'Alquiler de inmuebles - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Alquileres bienes muebles ─────────────────────────────────────
  { codigo: 13, descripcion: 'Alquiler de bienes muebles - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 14, descripcion: 'Alquiler de bienes muebles - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 15, descripcion: 'Alquiler de bienes muebles - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Fletes ─────────────────────────────────────────────────────────
  { codigo: 16, descripcion: 'Fletes - PJ', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 17, descripcion: 'Fletes - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 18, descripcion: 'Fletes - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de publicidad y propaganda ──────────────────────────
  { codigo: 19, descripcion: 'Publicidad y propaganda - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 20, descripcion: 'Publicidad y propaganda - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 21, descripcion: 'Publicidad y propaganda - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios técnicos ─────────────────────────────────────────────
  { codigo: 22, descripcion: 'Servicios tecnológicos - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 23, descripcion: 'Servicios tecnológicos - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 24, descripcion: 'Servicios tecnológicos - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Asistencia técnica ────────────────────────────────────────────
  { codigo: 25, descripcion: 'Asistencia técnica - PJ', baseImponiblePct: 50, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 26, descripcion: 'Asistencia técnica - PNR', baseImponiblePct: 50, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 27, descripcion: 'Asistencia técnica - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Regalías/Licencias ────────────────────────────────────────────
  { codigo: 28, descripcion: 'Regalías y demás participaciones - PJ', baseImponiblePct: 90, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 29, descripcion: 'Regalías y demás participaciones - PNR', baseImponiblePct: 90, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 30, descripcion: 'Regalías y demás participaciones - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de transporte ───────────────────────────────────────
  { codigo: 31, descripcion: 'Transporte internacional - PJ', baseImponiblePct: 50, retentionPct: 3, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 32, descripcion: 'Transporte internacional - PNR', baseImponiblePct: 50, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 33, descripcion: 'Transporte internacional - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Seguros/Reaseguros ───────────────────────────────────────────
  { codigo: 34, descripcion: 'Primas de seguro y reaseguro - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 35, descripcion: 'Primas de seguro y reaseguro - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 36, descripcion: 'Primas de seguro y reaseguro - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Ganancias fortuitas (loterías) ───────────────────────────────
  { codigo: 37, descripcion: 'Ganancias fortuitas (loterías, hipódromos) - PJ', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 38, descripcion: 'Ganancias fortuitas (loterías, hipódromos) - PNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 39, descripcion: 'Ganancias fortuitas (loterías, hipódromos) - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Pagos por servicios de empresas contratistas ──────────────────
  { codigo: 40, descripcion: 'Empresas contratistas - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 41, descripcion: 'Empresas contratistas - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 42, descripcion: 'Empresas contratistas - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Empresas sub-contratistas ────────────────────────────────────
  { codigo: 43, descripcion: 'Empresas sub-contratistas - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 44, descripcion: 'Empresas sub-contratistas - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 45, descripcion: 'Empresas sub-contratistas - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de telecomunicaciones ──────────────────────────────
  { codigo: 46, descripcion: 'Servicios de telecomunicaciones - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 47, descripcion: 'Servicios de telecomunicaciones - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 48, descripcion: 'Servicios de telecomunicaciones - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Actividades de enseñanza ─────────────────────────────────────
  { codigo: 49, descripcion: 'Actividades de enseñanza - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 50, descripcion: 'Actividades de enseñanza - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 51, descripcion: 'Actividades de enseñanza - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de salud ───────────────────────────────────────────
  { codigo: 52, descripcion: 'Servicios de salud - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 53, descripcion: 'Servicios de salud - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 54, descripcion: 'Servicios de salud - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Venta de fondos de comercio ──────────────────────────────────
  { codigo: 55, descripcion: 'Venta de fondos de comercio - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 56, descripcion: 'Venta de fondos de comercio - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 57, descripcion: 'Venta de fondos de comercio - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Venta de bienes inmuebles ────────────────────────────────────
  { codigo: 58, descripcion: 'Venta de bienes inmuebles - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 59, descripcion: 'Venta de bienes inmuebles - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 60, descripcion: 'Venta de bienes inmuebles - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Enajenación de acciones ──────────────────────────────────────
  { codigo: 61, descripcion: 'Enajenación de acciones - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 62, descripcion: 'Enajenación de acciones - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 63, descripcion: 'Enajenación de acciones - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de mantenimiento y reparación ──────────────────────
  { codigo: 64, descripcion: 'Mantenimiento y reparación - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 65, descripcion: 'Mantenimiento y reparación - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 66, descripcion: 'Mantenimiento y reparación - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Compra de bienes muebles ─────────────────────────────────────
  { codigo: 67, descripcion: 'Compra de bienes muebles - PJ (>25 UT)', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 68, descripcion: 'Compra de bienes muebles - PNR (>25 UT)', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 69, descripcion: 'Compra de bienes muebles - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de vigilancia ──────────────────────────────────────
  { codigo: 70, descripcion: 'Servicios de vigilancia - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 71, descripcion: 'Servicios de vigilancia - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 72, descripcion: 'Servicios de vigilancia - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de limpieza ────────────────────────────────────────
  { codigo: 73, descripcion: 'Servicios de limpieza - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 74, descripcion: 'Servicios de limpieza - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 75, descripcion: 'Servicios de limpieza - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de consultoría ─────────────────────────────────────
  { codigo: 76, descripcion: 'Servicios de consultoría - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 77, descripcion: 'Servicios de consultoría - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 78, descripcion: 'Servicios de consultoría - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Servicios de administración ──────────────────────────────────
  { codigo: 79, descripcion: 'Servicios de administración - PJ', baseImponiblePct: 100, retentionPct: 5, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 80, descripcion: 'Servicios de administración - PNR', baseImponiblePct: 100, retentionPct: 3, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 81, descripcion: 'Servicios de administración - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Otros servicios no contemplados ──────────────────────────────
  { codigo: 82, descripcion: 'Otros servicios - PJ', baseImponiblePct: 100, retentionPct: 2, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: false },
  { codigo: 83, descripcion: 'Otros servicios - PNR', baseImponiblePct: 100, retentionPct: 1, sustraendoUt: 1, forPersonaJuridica: false, forPersonaResidente: true },
  { codigo: 84, descripcion: 'Otros servicios - PNNR', baseImponiblePct: 100, retentionPct: 34, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: false },

  // ─── Sueldos y salarios ───────────────────────────────────────────
  { codigo: 85, descripcion: 'Sueldos y salarios (>1000 UT anual)', baseImponiblePct: 100, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: false, forPersonaResidente: true },

  // ─── Otros pagos no sujetos ───────────────────────────────────────
  { codigo: 86, descripcion: 'Pagos no sujetos a retención', baseImponiblePct: 100, retentionPct: 0, sustraendoUt: 0, forPersonaJuridica: true, forPersonaResidente: true },
];

async function main() {
  console.log('Seeding ISLR retention types...');

  for (const tipo of tipos) {
    await prisma.islrRetentionType.upsert({
      where: { codigo: tipo.codigo },
      update: {
        descripcion: tipo.descripcion,
        baseImponiblePct: tipo.baseImponiblePct,
        retentionPct: tipo.retentionPct,
        sustraendoUt: tipo.sustraendoUt,
        forPersonaJuridica: tipo.forPersonaJuridica,
        forPersonaResidente: tipo.forPersonaResidente,
      },
      create: {
        codigo: tipo.codigo,
        descripcion: tipo.descripcion,
        baseImponiblePct: tipo.baseImponiblePct,
        retentionPct: tipo.retentionPct,
        sustraendoUt: tipo.sustraendoUt,
        forPersonaJuridica: tipo.forPersonaJuridica,
        forPersonaResidente: tipo.forPersonaResidente,
      },
    });
  }

  console.log(`Seeded ${tipos.length} ISLR retention types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
