import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLongList, listLines, MAX_LIST_LINES } from './src/modules/chatbot/list-guard';

test('cuenta solo renglones con letras o numeros', () => {
  assert.equal(listLines('Hola\n\n- Cemento: 10 sacos\n-\n   \n* Cabilla 3/8\n🙏🏻🙏🏻'), 3);
  assert.equal(listLines('Tubos de 2x1\r\nLáminas 366\r\nTornillos para zin'), 3);
  assert.equal(listLines(''), 0);
});

test('caso real del piloto (21-10): 2 renglones de encabezado + 55 de materiales = lista larga', () => {
  const items = Array.from({ length: 55 }, (_, i) => `- Material ${i + 1}: ${i + 2} und`);
  const msg = ['Necesito una cotización de esta lista de materiales los que tengas a disposición ', '*Lista de Materiales:*', ...items].join('\n');
  assert.equal(listLines(msg), 57);
  assert.equal(isLongList(msg), true);
});

test('listas que el bot cotizó bien en el piloto (hasta 27 renglones) no se cortan', () => {
  const ok = Array.from({ length: 27 }, (_, i) => `PRODUCTO ${i + 1}\n`).join('\n');
  assert.equal(isLongList(ok), false);
  const borde = Array.from({ length: MAX_LIST_LINES }, (_, i) => `- item ${i}`).join('\n');
  assert.equal(isLongList(borde), false);
  assert.equal(isLongList(`${borde}\n- uno más`), true);
});
