// Motor de cálculo de nómina. Función PURA (sin I/O) para poder validarla contra el Excel de RRHH.
// Reglas verificadas en docs/superpowers/plans/2026-07-17-nomina.md. NO se redondean los intermedios
// (diario, valor-hora): solo los montos Bs finales, para reproducir el Excel al centavo.
//
// REGLA AMBIGUA (confirmar con RRHH): el Excel muestra "A cobrar" (col V) SIN las horas extra
// (las HE aparecen aparte en "Total Devengado"/"Total $"). Este motor calcula el neto correcto
// = (salario + HE) − deducciones. Confirmar si el pago neto real incluye las HE o se pagan por separado.

export interface PayrollParams {
  ivssBs: number;        // monto fijo IVSS por período
  faovBs: number;        // monto fijo FAOV por período
  incesBs: number;       // monto fijo INCES por período (0 por ahora)
  otDayFactor: number;   // 1.5
  otNightFactor: number; // 1.3
  monthDays: number;     // 30
  periodHours: number;   // 40 (semanal); 80 si quincenal
  periodsPerYear: number;// 52 (semanal) | 24 (quincenal)
}

export interface PayrollLineInput {
  salaryBaseUsd: number;
  daysWorked: number;
  daysRest: number;
  overtimeDayHours: number;
  overtimeNightHours: number;
  manualDeductionUsd: number;
  creditDeductionBs: number;
  rate: number; // tasa BCV
}

export interface PayrollLineResult {
  monthlyUsd: number; dailyUsd: number; totalDays: number; periodSalaryUsd: number;
  salaryBs: number; hourlyBs: number; otDayRateBs: number; otNightRateBs: number;
  otDayTotalBs: number; otNightTotalBs: number; overtimeBs: number;
  ivssBs: number; faovBs: number; incesBs: number; manualDeductionBs: number;
  creditDeductionBs: number; totalDeductionsBs: number;
  grossBs: number; netBs: number; netUsd: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Defaults del schema, por si el singleton de parámetros aún no existe.
export const DEFAULT_PAYROLL_PARAM = {
  ivssBs: 0, faovBs: 0, incesBs: 0,
  otDayFactor: 1.5, otNightFactor: 1.3, monthDays: 30, weeklyHours: 40,
};

// Mapea los parámetros globales a los que espera el motor, según la frecuencia.
export function buildEngineParams(type: string, p: typeof DEFAULT_PAYROLL_PARAM): PayrollParams {
  const weekly = type === 'WEEKLY';
  return {
    ivssBs: p.ivssBs, faovBs: p.faovBs, incesBs: p.incesBs,
    otDayFactor: p.otDayFactor, otNightFactor: p.otNightFactor,
    monthDays: p.monthDays,
    periodHours: weekly ? p.weeklyHours : p.weeklyHours * 2,
    periodsPerYear: weekly ? 52 : 24,
  };
}

export function computePayrollLine(input: PayrollLineInput, p: PayrollParams): PayrollLineResult {
  const monthlyUsd = (input.salaryBaseUsd * p.periodsPerYear) / 12;
  const dailyUsd = monthlyUsd / p.monthDays;
  const totalDays = input.daysWorked + input.daysRest;
  const periodSalaryUsd = totalDays * dailyUsd;
  const salaryBs = r2(periodSalaryUsd * input.rate);

  const hourlyBs = periodSalaryUsd * input.rate / p.periodHours;
  const otDayRateBs = hourlyBs * p.otDayFactor;
  const otNightRateBs = otDayRateBs * p.otNightFactor;
  const otDayTotalBs = r2(input.overtimeDayHours * otDayRateBs);
  const otNightTotalBs = r2(input.overtimeNightHours * otNightRateBs);
  const overtimeBs = r2(otDayTotalBs + otNightTotalBs);

  const worked = totalDays > 0;
  const ivssBs = worked ? p.ivssBs : 0;
  const faovBs = worked ? p.faovBs : 0;
  const incesBs = worked ? p.incesBs : 0;
  const manualDeductionBs = r2(input.manualDeductionUsd * input.rate);
  const creditDeductionBs = r2(input.creditDeductionBs);
  const totalDeductionsBs = r2(ivssBs + faovBs + incesBs + manualDeductionBs + creditDeductionBs);

  const grossBs = r2(salaryBs + overtimeBs);
  const netBs = r2(grossBs - totalDeductionsBs);
  const netUsd = input.rate > 0 ? r2(netBs / input.rate) : 0;

  return {
    monthlyUsd, dailyUsd, totalDays, periodSalaryUsd, salaryBs, hourlyBs,
    otDayRateBs, otNightRateBs, otDayTotalBs, otNightTotalBs, overtimeBs,
    ivssBs, faovBs, incesBs, manualDeductionBs, creditDeductionBs, totalDeductionsBs,
    grossBs, netBs, netUsd,
  };
}
