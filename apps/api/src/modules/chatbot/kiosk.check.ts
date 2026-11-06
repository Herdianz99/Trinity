// Verificacion sin jest: node apps/api/src/modules/chatbot/kiosk.check.ts
import assert from 'node:assert/strict';
import { pickMentionedProducts } from './kiosk.ts';

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
