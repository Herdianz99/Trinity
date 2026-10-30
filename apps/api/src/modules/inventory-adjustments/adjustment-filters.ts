import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

export interface AdjustmentListFilters {
  status?: string;
  warehouseId?: string;
  type?: string;
  search?: string;
  from?: string;
  to?: string;
}

// WHERE compartido por el listado (/inventory/adjustments), el PDF y el Excel agrupados, para que
// los tres muestren exactamente los mismos ajustes con los mismos filtros.
export function buildAdjustmentWhere(filters?: AdjustmentListFilters): any {
  const where: any = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
  if (filters?.type) where.type = filters.type;

  // Rango de fechas sobre createdAt (TIMESTAMP): límites del día-calendario Caracas.
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = caracasDayStart(filters.from);
    if (filters.to) where.createdAt.lte = caracasDayEnd(filters.to);
  }

  // Búsqueda única: correlativo (ADJ-0001), destinatario (cliente/proveedor) o descripción
  // ("san rafael" encuentra "PARA ENVIAR A SAN RAFAEL"), coincidencia parcial sin mayúsculas.
  const search = filters?.search?.trim();
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  return where;
}
