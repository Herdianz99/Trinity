import { UserRole } from '@prisma/client';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  SUPERVISOR: ['dashboard', 'sales', 'quotations', 'catalog', 'inventory', 'purchases', 'cash', 'receivables', 'payables', 'fiscal'],
  CASHIER: ['dashboard', 'sales', 'quotations', 'cash', 'receivables'],
  SELLER: ['dashboard', 'sales', 'quotations'],
  WAREHOUSE: ['dashboard', 'inventory', 'purchases'],
  BUYER: ['dashboard', 'catalog', 'purchases', 'payables'],
  ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'fiscal'],
  AUDITOR: ['dashboard', 'inventory'],
};
