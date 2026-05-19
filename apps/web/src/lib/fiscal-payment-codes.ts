/**
 * Standard fiscal payment positions for HKA printers.
 * These map to positions 01-20 programmable via the PE command.
 */
export const FISCAL_PAYMENT_POSITIONS: { code: string; name: string }[] = [
  { code: '01', name: 'Efectivo' },
  { code: '02', name: 'Punto de venta' },
  { code: '03', name: 'Transferencia' },
  { code: '04', name: 'Pago movil' },
  { code: '05', name: 'Biopago' },
  { code: '07', name: 'Saldo a favor' },
  { code: '08', name: 'Cashea' },
  { code: '09', name: 'Crediagro' },
  { code: '10', name: 'Credito' },
  { code: '11', name: 'Divisa' },
  { code: '20', name: 'Divisa' },
];
