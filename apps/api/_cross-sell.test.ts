import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTerm, ruleKey, extractMeasures, sharesMeasure, firstSignificantWord, wasOffered, countPairs, selectSuggestions,
} from './src/modules/chatbot/cross-sell-utils';

test('normalizeTerm: minusculas, sin acentos, espacios simples', () => {
  assert.equal(normalizeTerm('  Disco  de CORTE '), 'disco de corte');
  assert.equal(normalizeTerm('Pintura Esmálte'), 'pintura esmalte');
});

test('ruleKey: trigger + ofertas ordenadas y sin repetir', () => {
  assert.equal(ruleKey('Esmeril', ['Disco de desbaste', 'disco de corte']), 'esmeril|disco de corte|disco de desbaste');
  assert.equal(ruleKey('taladro', ['mecha', 'Mecha']), 'taladro|mecha');
});

test('extractMeasures: fracciones mixtas, simples y milimetros', () => {
  assert.deepEqual([...extractMeasures('ESMERIL ANGULAR 4-1/2" DEWALT')].sort(), ['4-1/2']);
  assert.deepEqual([...extractMeasures('DISCO DE CORTE 4 1/2 X 1/16 NORTON')].sort(), ['1/16', '4-1/2']);
  assert.deepEqual([...extractMeasures('BARRA CON RESALTE 10MM')], ['10mm']);
  assert.deepEqual([...extractMeasures('MARTILLO UÑA')], []);
});

test('sharesMeasure', () => {
  assert.equal(sharesMeasure(extractMeasures('ESMERIL 4-1/2'), extractMeasures('DISCO 4 1/2 CORTE')), true);
  assert.equal(sharesMeasure(extractMeasures('ESMERIL 7"'), extractMeasures('DISCO 4-1/2')), false);
  assert.equal(sharesMeasure(new Set(), extractMeasures('DISCO 4-1/2')), false);
});

test('firstSignificantWord: salta medidas, numeros y palabras vacias', () => {
  assert.equal(firstSignificantWord('ESMERIL ANGULAR 4-1/2 DEWALT'), 'esmeril');
  assert.equal(firstSignificantWord('1/2 TUBO PVC'), 'tubo');
  assert.equal(firstSignificantWord('DE CEMENTO GRIS'), 'cemento');
  assert.equal(firstSignificantWord('X 10 2'), null);
});

test('wasOffered: el texto menciona la mayoria de las palabras del producto', () => {
  const name = 'DISCO DE CORTE 4-1/2" X 1/16 NORTON';
  assert.equal(wasOffered(name, 'Para usarlo también tenemos Disco de corte 4½" Norton a 1,20$ bcv.'), true);
  assert.equal(wasOffered(name, 'El esmeril está en 85$ bcv. ¿Buscas algo más?'), false);
  // caso real: el bot acorta 'BROCHA 1-1/2" M/PLASTICO AZUL EXXEL' a 'brocha de 1-1/2" Exxel' (2 de 4 palabras)
  assert.equal(wasOffered('BROCHA 1-1/2" M/PLASTICO AZUL EXXEL', 'también tenemos la brocha de 1-1/2" Exxel a 1.04$ bcv'), true);
});

test('countPairs: cuenta facturas por grupo y por par (sin orden)', () => {
  const c = countPairs([
    new Set(['esmeril', 'disco']),
    new Set(['esmeril', 'disco', 'cemento']),
    new Set(['cemento']),
    new Set(['esmeril']),
  ]);
  assert.equal(c.total, 4);
  assert.equal(c.single.get('esmeril'), 3);
  assert.equal(c.single.get('cemento'), 2);
  assert.equal(c.pair.get('disco|esmeril'), 2);
  assert.equal(c.pair.get('cemento|esmeril'), 1);
});

test('selectSuggestions: aplica base, % y lift; max por trigger; ordena por lift', () => {
  // 100 facturas: 40 con esmeril, 20 de ellas con disco; disco aparece en 25 en total.
  // cemento aparece en 80 (en 30 de las de esmeril): % alto pero lift < 2 -> no se sugiere.
  const sets: Set<string>[] = [];
  for (let i = 0; i < 100; i++) {
    const s = new Set<string>();
    if (i < 40) s.add('esmeril');
    if (i < 20 || i >= 95) s.add('disco'); // disco en 25 facturas -> lift = 50% / 25% = 2.0
    if (i >= 10 && i < 90) s.add('cemento');
    sets.push(s);
  }
  const out = selectSuggestions(countPairs(sets), { minBase: 20, minPct: 15, minLift: 2, maxPerTrigger: 3 });
  const esm = out.filter((s) => s.trigger === 'esmeril');
  assert.deepEqual(esm.map((s) => s.offer), ['disco']);
  assert.equal(esm[0].base, 40);
  assert.equal(esm[0].pct, 50);
  assert.equal(esm[0].lift, 2);
  // cemento: 30 de 40 facturas con esmeril (75%) pero esta en 80 de 100 -> lift 0.94 -> no se sugiere
  assert.ok(!esm.some((s) => s.offer === 'cemento'));
});
