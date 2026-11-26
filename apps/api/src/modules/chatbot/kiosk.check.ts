// Verificacion sin jest: node apps/api/src/modules/chatbot/kiosk.check.ts
import assert from 'node:assert/strict';
import { pickMentionedProducts, pickKioskProducts, adaptPromptForKiosk } from './kiosk.ts';

const search = (productos: any[]) => ({ name: 'buscar_productos', input: {}, result: { productos } });
const p = (codigo: string, nombre: string, precio = '1.00$ bcv') =>
  ({ codigo, nombre, precio_bcv: precio, disponible: true, tiene_foto: true });

// 1. Solo los productos cuyo precio aparece en la respuesta
const log = [search([p('A1', 'Cemento gris 42.5 kg', '9.80$ bcv'), p('A2', 'Cemento blanco 1 kg', '2.10$ bcv')])];
assert.deepEqual(pickMentionedProducts(log, 'El cemento gris 42.5 kg está en 9.80$ bcv. ¿Algo más?').map((x) => x.codigo), ['A1']);

// 2. Sin precios en el texto -> sin tarjetas
assert.deepEqual(pickMentionedProducts(log, 'No lo encontré, ¿buscas otra cosa?'), []);

// 3. Sin repetidos y máximo 4, en el orden en que aparecen en el texto
const many = [search([1, 2, 3, 4, 5].map((i) => p(`C${i}`, `Codo ${i}`, `${i}.00$ bcv`)))];
const text = 'Codo 5 en 5.00$ bcv, codo 1 en 1.00$ bcv, codo 2 en 2.00$ bcv, codo 3 en 3.00$ bcv, codo 4 en 4.00$ bcv, otra vez 1.00$ bcv';
assert.deepEqual(pickMentionedProducts(many, text).map((x) => x.codigo), ['C5', 'C1', 'C2', 'C3']);

// 4. Mismo precio en dos productos: desempata por palabras del nombre
const tie = [search([p('T1', 'Tubo pvc 1/2 aguas blancas', '3.00$ bcv'), p('T2', 'Codo pvc 1/2', '3.00$ bcv')])];
assert.deepEqual(pickMentionedProducts(tie, 'El codo pvc 1/2 está en 3.00$ bcv.').map((x) => x.codigo), ['T2']);

// 5. Ignora otras herramientas y resultados sin productos
assert.deepEqual(pickMentionedProducts([{ name: 'calcular_bolivares', input: {}, result: { bs: 100 } }], '1.00$ bcv'), []);

console.log('kiosk.check OK');

// 6. adaptPromptForKiosk cambia las lineas de WhatsApp y agrega las reglas de voz
const base = 'Eres Bot.\nAtiendes clientes por WhatsApp y redes sociales. Tu trabajo: x.\n- Si listas varios productos, máximo 7, uno por línea con nombre y precio.\n- Otra regla.';
const k = adaptPromptForKiosk(base);
assert.ok(!k.includes('WhatsApp y redes'));
assert.ok(!k.includes('máximo 7'));
assert.ok(k.includes('nombra máximo 3'));
assert.ok(k.includes('- Otra regla.'));
assert.ok(k.includes('MODO TÓTEM DE VOZ'));
console.log('adaptPromptForKiosk OK');

// 7. Precio con el signo delante ("$14.06 bcv"): el bot a veces escribe asi
const front = [search([p('F1', 'Cemento blanco 10 kg', '14.06$ bcv'), p('F2', 'Cemento gris x kg', '0.52$ bcv')])];
assert.deepEqual(pickMentionedProducts(front, 'Tenemos cemento blanco a $14.06 bcv y gris por kilo a $0.52 bcv.').map((x) => x.codigo), ['F1', 'F2']);
assert.deepEqual(pickMentionedProducts(front, 'Cemento blanco a $ 14,06 bcv').map((x) => x.codigo), ['F1']);
console.log('precio con $ delante OK');

// 8. pickKioskProducts: mencionados primero + resto de DISPONIBLES de las mismas busquedas (hasta 12)
const pAvail = (codigo: string, nombre: string, precio: string, disponible = true) =>
  ({ codigo, nombre, precio_bcv: precio, disponible, tiene_foto: true });
const tanks = [
  pAvail('T1', 'Tanque 500L', '85.00$ bcv', true),
  pAvail('T2', 'Tanque 1000L', '130.00$ bcv', true),
  pAvail('T3', 'Tanque 1500L', '185.00$ bcv', true),
  pAvail('T4', 'Tanque 2000L', '240.00$ bcv', false), // agotado -> no se agrega como extra
  pAvail('T5', 'Tanque 2500L', '290.00$ bcv', true),
  pAvail('T6', 'Tanque 3000L', '340.00$ bcv', true),
];
const discardedSearch = [pAvail('X1', 'Producto nada que ver', '99.00$ bcv', true)];
const kioskLog = [search(discardedSearch), search(tanks)];
const kioskText = 'Tenemos tanque de 1500L en 185.00$ bcv, de 1000L en 130.00$ bcv y de 500L en 85.00$ bcv. Te muestro más opciones en pantalla.';
assert.deepEqual(
  pickKioskProducts(kioskLog, kioskText).map((x) => x.codigo),
  ['T3', 'T2', 'T1', 'T5', 'T6'],
);
// Sin ningun precio mencionado -> 0 tarjetas (no muestra resultados al azar)
assert.deepEqual(pickKioskProducts(kioskLog, 'No encontré ese tanque, ¿buscas otra cosa?'), []);
console.log('pickKioskProducts OK');
