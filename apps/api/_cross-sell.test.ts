import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTerm, ruleKey, extractMeasures, sharesMeasure, firstSignificantWord, wasOffered,
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
});
