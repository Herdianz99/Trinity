import { UserRole } from '@prisma/client';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'cash', 'receivables', 'payables', 'fiscal', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
  CASHIER: ['dashboard', 'sales', 'quotations', 'cash', 'receivables', 'RETURN_INVOICE'],
  SELLER: ['dashboard', 'sales', 'quotations', 'RETURN_INVOICE'],
  WAREHOUSE: ['dashboard', 'inventory', 'purchases', 'RETURN_PURCHASE'],
  BUYER: ['dashboard', 'catalog', 'purchases', 'payables', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
  ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'fiscal', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
  AUDITOR: ['dashboard', 'inventory'],
};
