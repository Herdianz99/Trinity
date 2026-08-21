'use client';

import CatalogManager from '../CatalogManager';

export default function BancosPage() {
  return (
    <CatalogManager
      endpoint="banks"
      dimensionParam="bankId"
      titleSingular="Banco / Ubicación"
      titlePlural="Bancos / Ubicaciones"
      subtitle="Bancos y ubicaciones del módulo de divisas. Toca uno para ver sus movimientos y saldo."
    />
  );
}
