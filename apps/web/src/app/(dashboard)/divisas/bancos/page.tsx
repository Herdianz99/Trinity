'use client';

import CatalogManager from '../CatalogManager';

export default function BancosPage() {
  return <CatalogManager endpoint="banks" titleSingular="Banco / Ubicación" titlePlural="Bancos / Ubicaciones" />;
}
