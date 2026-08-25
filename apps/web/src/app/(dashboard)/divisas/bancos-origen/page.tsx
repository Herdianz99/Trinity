'use client';

import CatalogManager from '../CatalogManager';

export default function BancosOrigenPage() {
  return (
    <CatalogManager
      endpoint="origin-banks"
      titleSingular="Banco de origen"
      titlePlural="Bancos de origen (Bs)"
      subtitle="Bancos en bolívares desde donde salen los pagos al comprar divisas. Se eligen al registrar un movimiento."
    />
  );
}
