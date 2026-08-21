'use client';

import CatalogManager from '../CatalogManager';

export default function EmpresasPage() {
  return (
    <CatalogManager
      endpoint="companies"
      dimensionParam="companyId"
      titleSingular="Empresa"
      titlePlural="Empresas"
      subtitle="Empresas del módulo de divisas. Toca una para ver sus movimientos y saldo."
    />
  );
}
