import { BASES } from './segmentation';

// Plantillas originales de la campana. En la BD (WhatsappCampaignTemplate) solo se guardan las
// editadas; "Restaurar original" borra la fila y vuelve a este texto.
// Variables: {saludo} {nombre} {empresa} {area} {gracias} {producto} (las reemplaza el frontend).

// Clientes enfriandose (31-60 dias) e inactivos (>60), sin importar el rubro. La clave se llama
// CASHEA por historia (empezo como la promo Cashea del 15-20 oct 2026) y asi quedo en los envios.
export const COOLING_KEY = 'CASHEA';

const CIERRE = 'Responde este mensaje con tu lista y te la preparamos para retirar o despachar.';

const BODY: Record<string, string> = {
  CONST: '¿Tienes obra esta semana? Cemento, pego, cabillas, bloques y todo el material de construcción con disponibilidad confirmada.',
  TECHO: 'Antes de que lleguen las lluvias: zinc, acerolit y manto asfáltico. Mándanos las medidas de tu techo y te cotizamos al momento.',
  HERR: 'Tubos, ángulos, cerchas, electrodos y discos con disponibilidad confirmada, sin hacer cola.',
  ELEC: 'Cable THHN por rollo o por metro, breakers, tableros e iluminación para tu próximo trabajo.',
  PLOM: 'Tubería PVC, conexiones, tanques, bombas y sanitarios. Pide por aquí y retira sin esperar.',
  PINT: 'Pinturas, fondos, esmaltes y accesorios para tu próximo trabajo, por galón o por cuñete.',
  ACAB: 'Tenemos porcelanatos y cerámicas nuevas. Pídenos fotos y aparta tus metros.',
  AGRO: 'Desmalezadoras, fumigadoras, alambre de púas y mangueras de riego, con despacho.',
  MEC: 'Llaves de impacto, dados, gatos hidráulicos y baterías. Consulta disponibilidad por aquí.',
  OBRA: 'Para tu obra: envíanos la lista completa y te cotizamos todo en un solo pedido, con despacho.',
  EQUIP: 'Plantas eléctricas, hidrojets, compresores y herramientas eléctricas con garantía. Pregúntanos por modelos y precios.',
  HOGAR: 'Todo para los arreglos de la casa sin salir: pide por aquí y retira listo.',
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  [COOLING_KEY]:
    '{saludo} 👋, te saluda {empresa}. ¡Te extrañamos!\n\n' +
    'Hace rato no pasas por la tienda y queremos verte de nuevo. Tenemos disponibilidad confirmada en {area}, y si prefieres, llévatelo con *Cashea* y págalo en cuotas.\n\n' +
    'Responde este mensaje con lo que necesitas y te lo dejamos listo para retirar o despachar.',
  ...Object.fromEntries(Object.keys(BASES).map((k) => [k, `{saludo} 👋, te saluda {empresa}. {gracias}\n\n${BODY[k]}\n\n${CIERRE}`])),
};

export const TEMPLATE_LABELS: Record<string, string> = {
  [COOLING_KEY]: 'Enfriándose e inactivos',
  ...Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, v.label])),
};

export const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  [COOLING_KEY]: 'Se usa para TODOS los clientes enfriándose (31-60 días sin comprar) e inactivos (más de 60), sin importar el rubro.',
};
export const DEFAULT_RUBRO_DESCRIPTION = 'Se usa para los clientes activos de este rubro (de oficio y ocasionales).';
