import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickComplements, storeMeasures, type ComplementProduct, type ComplementRule } from './src/modules/store-export/store-complements';

const P = (code: string, name: string, sold90 = 0, available = true): ComplementProduct => ({ code, name, sold90, available });
const C = (pairs: Record<string, number>) => new Map(Object.entries(pairs));

const products = [
  P('E1', 'ESMERIL ANGULAR 750W 4-1/2" 11000 RPM'),
  P('E3', 'ESMERIL ANGULAR 7" 2400W'),
  P('E4', 'ESMERIL ANGULAR 5/8 X 11'),
  P('D1', 'DISCO DE CORTE METAL 4-1/2" X 1/16', 50),
  P('D2', 'DISCO DE CORTE METAL 4 1/2 X 7/8', 80),
  P('D3', 'DISCO DE CORTE METAL 7" X 1/8', 90),
  P('D4', 'DISCO DE CORTE 4-1/2 (ROTO)', 999),
  P('D5', 'DISCO DE CORTE 4-1/2" ULTRAFINO', 70, false),
  P('D6', 'DISCO DE CORTE 5/8', 1),
  P('F1', 'DISCO FLAP 4-1/2" GRANO 60', 10),
  P('F2', 'DISCO FLAP 4-1/2" GRANO 80', 20),
  P('F3', 'DISCO FLAP 4-1/2" GRANO 120', 5),
];
const esmeril: ComplementRule = {
  useMeasure: true,
  triggerCodes: new Set(['E1', 'E3', 'E4']),
  offers: [
    { term: 'disco de corte', candidates: C({ D1: 30, D2: 12, D3: 40, D4: 99, D5: 50, D6: 3 }) },
    { term: 'disco flap', candidates: C({ F1: 9, F2: 4, F3: 6 }) },
  ],
};

test('misma medida, primero lo que mas se vende JUNTO, 2 por termino, sin variantes ni agotados', () => {
  assert.deepEqual(pickComplements(products, [esmeril]).get('E1'), ['D1', 'D2', 'F1', 'F3']);
});

test('con medida y sin complementos de esa medida: no se ofrece de otra medida', () => {
  assert.deepEqual(pickComplements(products, [esmeril]).get('E4'), ['D6']); // 5/8: ningun flap
});

test('pulgadas enteras: al esmeril de 7" solo el disco de 7"', () => {
  assert.deepEqual(pickComplements(products, [esmeril]).get('E3'), ['D3']);
});

test('storeMeasures: pulgadas enteras sin confundir la fraccion', () => {
  assert.deepEqual([...storeMeasures('ESMERIL ANGULAR 9" 2400W')], ['9"']);
  assert.deepEqual([...storeMeasures('ESMERIL ANGULAR 4-1/2" 710W')], ['4-1/2']);
  assert.deepEqual([...storeMeasures('DISCO 7 X1/8 X7/8')].sort(), ['1/8', '7/8']);
});

test('lo que casi no se vende junto (< 2 facturas) no se muestra aunque cumpla las palabras', () => {
  const ps = [P('K1', 'CERAMICA 36X36 ARENA'), P('G1', 'PEGA PVC 1/32 GL', 500), P('G2', 'PEGAMIX GRIS 10KG', 40)];
  const rule: ComplementRule = { useMeasure: false, triggerCodes: new Set(['K1']), offers: [{ term: 'pego', candidates: C({ G1: 1, G2: 25 }) }] };
  assert.deepEqual(pickComplements(ps, [rule]).get('K1'), ['G2']);
  const none: ComplementRule = { ...rule, offers: [{ term: 'pego', candidates: C({ G1: 1 }) }] };
  assert.equal(pickComplements(ps, [none]).has('K1'), false);
});

test('varias reglas suman sin repetir y con tope de 4', () => {
  const ps = [P('R1', 'RODILLO 9"'), P('B1', 'BROCHA 2"'), P('B2', 'BROCHA 3"'), P('B3', 'BROCHA 4"'), P('C1', 'BANDEJA')];
  const rules: ComplementRule[] = [
    { useMeasure: false, triggerCodes: new Set(['R1']), offers: [{ term: 'brocha', candidates: C({ B1: 5, B2: 9, B3: 2 }) }] },
    { useMeasure: false, triggerCodes: new Set(['R1']), offers: [{ term: 'brocha', candidates: C({ B2: 9 }) }, { term: 'bandeja', candidates: C({ C1: 4 }) }] },
    { useMeasure: false, triggerCodes: new Set(['R1']), offers: [{ term: 'brocha', candidates: C({ B3: 2 }) }] },
  ];
  assert.deepEqual(pickComplements(ps, rules).get('R1'), ['B2', 'B1', 'C1', 'B3']);
});

test('nunca se ofrece a si mismo', () => {
  const ps = [P('G1', 'GUANTES NITRILO'), P('G2', 'GUANTES LATEX')];
  const out = pickComplements(ps, [{ useMeasure: false, triggerCodes: new Set(['G1', 'G2']), offers: [{ term: 'guantes', candidates: C({ G1: 3, G2: 3 }) }] }]);
  assert.deepEqual(out.get('G1'), ['G2']);
  assert.deepEqual(out.get('G2'), ['G1']);
});
