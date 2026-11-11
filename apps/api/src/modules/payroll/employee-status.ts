// Estados de empleado (Session 177). El orden es el de los filtros y reportes.
// inPayroll = sigue empleado y entra en la nomina (Employee.isActive se deriva de esto).
export const EMPLOYEE_STATUSES = {
  ACTIVE: { label: 'Activo', inPayroll: true },
  VACATION: { label: 'Vacaciones', inPayroll: true },
  MEDICAL_LEAVE: { label: 'Reposo', inPayroll: true },
  SPECIAL_LEAVE: { label: 'Permiso especial', inPayroll: true },
  INACTIVE: { label: 'Inactivo', inPayroll: false },
  VOLUNTARY_RESIGNATION: { label: 'Retiro voluntario', inPayroll: false },
  JUSTIFIED_DISMISSAL: { label: 'Despido justificado', inPayroll: false },
} as const;

export type EmployeeStatus = keyof typeof EMPLOYEE_STATUSES;
export const EMPLOYEE_STATUS_KEYS = Object.keys(EMPLOYEE_STATUSES) as EmployeeStatus[];

export const statusLabel = (s: string) => EMPLOYEE_STATUSES[s as EmployeeStatus]?.label ?? s;
export const statusInPayroll = (s: string) => EMPLOYEE_STATUSES[s as EmployeeStatus]?.inPayroll ?? false;

// Estados que siguen siendo empleados activos (isActive) pero NO se incluyen al crear/sincronizar
// corridas de nomina (/payroll/runs). Vacaciones: no entra en la corrida mientras este fuera.
export const PAYROLL_RUN_EXCLUDED_STATUSES: EmployeeStatus[] = ['VACATION'];
