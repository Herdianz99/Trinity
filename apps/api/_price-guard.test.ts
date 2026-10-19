import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneyInText, parseMoney, unverifiedPrices } from './src/modules/chatbot/price-guard';

test('parseMoney: punto o coma decimal y miles con coma', () => {
  assert.equal(parseMoney('206.56'), 206.56);
  assert.equal(parseMoney('12,43'), 12.43);
  assert.equal(parseMoney('1,234.50'), 1234.5);
  assert.deepEqual(moneyInText('Está en 206.56$ bcv (185.90$ en divisas). Bs 41.304,39'), [206.56, 185.9]);
});

test('tambien con el signo antes: "$14.44 BCV, o $13.00 en divisas"', () => {
  assert.deepEqual(moneyInText('Está en $14.44 BCV, o $ 13.00 en divisas, cada una.'), [14.44, 13]);
  assert.deepEqual(unverifiedPrices('Está en $14.44 BCV o $12.43 en divisas', [14.44, 13], []), [12.43]);
  // caso real: total general con el detalle en la misma respuesta, todo con el signo antes
  const real = 'el total en divisas sería $253.32: 15 cabillas a $13.00 c/u: $195.00 / 6 sacos a $9.72 c/u: $58.32';
  assert.deepEqual(unverifiedPrices(real, [13, 9.72], [15, 6]), []);
  // un total suelto, sin sus partes en la respuesta, no se puede verificar
  assert.deepEqual(unverifiedPrices('Total: $253.32', [13, 9.72], [15, 6]), [253.32]);
});

test('caso real del piloto: precio que no salio de ninguna herramienta', () => {
  const text = 'Malla: está en 12.43$ bcv... perdón, en 206.56$ bcv (185.90$ en divisas).';
  assert.deepEqual(unverifiedPrices(text, [206.56, 185.9, 106.87], [1, 100]), [12.43]);
});

test('precios tal cual de la herramienta: pasa', () => {
  assert.deepEqual(unverifiedPrices('A 20.51$ bcv (18.46$ en divisas)', [20.51, 18.46], []), []);
});

test('cantidad x precio: pasa si la cantidad se menciono', () => {
  const text = 'Cabillas a 14.44$ bcv. Total de 10: 144.40$ bcv (130.00$ en divisas).';
  assert.deepEqual(unverifiedPrices(text, [14.44, 13], [10]), []);
  assert.deepEqual(unverifiedPrices(text, [14.44, 13], [3]), [144.4, 130]); // nadie dijo 10
});

test('total general = suma de montos validados de la respuesta', () => {
  const text = 'Total de 10: 144.40$. Total de 6: 74.58$. Todo junto: 218.98$';
  assert.deepEqual(unverifiedPrices(text, [14.44, 12.43], [10, 6]), []);
  assert.deepEqual(unverifiedPrices('Total de 10: 144.40$. Todo junto: 300.00$', [14.44], [10]), [300]);
});

test('sin montos en $: pasa', () => {
  assert.deepEqual(unverifiedPrices('No encontré ese producto. ¿Me das la medida?', [], []), []);
});
