import { UserRole } from '@prisma/client';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'pedidos', 'cash', 'receivables', 'payables', 'expenses', 'payment-schedules', 'fiscal', 'incidents', 'bancos', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE', 'MANAGE_EXPENSES'],
  CASHIER: ['dashboard', 'sales', 'quotations', 'pedidos', 'cash', 'receivables', 'RETURN_INVOICE'],
  SELLER: ['dashboard', 'sales', 'quotations', 'pedidos', 'RETURN_INVOICE'],
  WAREHOUSE: ['dashboard', 'inventory-consult', 'almacen'],
  BUYER: ['dashboard', 'catalog', 'purchases', 'pedidos', 'payables', 'payment-schedules', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
  ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'payment-schedules', 'fiscal', 'pedidos', 'bancos', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
  AUDITOR: ['dashboard', 'inventory', 'almacen'],
  RRHH: ['dashboard', 'payroll'],
  SEGURIDAD: ['incidents'],
};
