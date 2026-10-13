import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBotQuery, parseBotQuery, exactFractionRegex } from './src/modules/chatbot/chatbot-tools.service';

test('relleno del piloto dia 1', () => {
  assert.equal(cleanBotQuery('precio del cable nro 12'), 'cable 12');
  assert.equal(cleanBotQuery('tubos de 3 por 3'), 'tubos 3x3');
});

test('metros: se va la palabra, queda el numero (los nombres dicen "6 MTS")', () => {
  assert.equal(cleanBotQuery('tubo 2x1 6 metros'), 'tubo 2x1 6');
  assert.equal(cleanBotQuery('tubo 100 100 6 metros'), 'tubo 100 100 6');
  assert.equal(cleanBotQuery('laminas acerolic 5 metros'), 'laminas acerolic 5');
  assert.equal(cleanBotQuery('manguera 3/4 100mts'), 'manguera 3/4 100');
  assert.equal(cleanBotQuery('cable 15 mts'), 'cable 15');
  assert.equal(cleanBotQuery('6metros de tubo'), '6 tubo');
});

test('si solo queda relleno, deja la consulta como vino', () => {
  assert.equal(cleanBotQuery('metros'), 'metros');
});

// Busquedas reales del piloto (2026-10-12/13) y variantes.
const CASES: [string, string, string[]][] = [
  // media -> 1/2 exacto
  ['tee media', 'tee 1/2', ['1/2']],
  ['tee de media', 'tee 1/2', ['1/2']],
  ['adaptador media', 'adaptador 1/2', ['1/2']],
  ['adaptador 20 x media', 'adaptador 20 x 1/2', ['1/2']],
  ['llave paso media rosca', 'llave paso 1/2 rosca', ['1/2']],
  ['Llave de paso de media de rosca', 'llave paso 1/2 rosca', ['1/2']],
  ['t media garbanizada', 't 1/2 garbanizada', ['1/2']],
  ['codo media soldable', 'codo 1/2 soldable', ['1/2']],
  ['clavo media', 'clavo 1/2', ['1/2']],
  ['clavo de media pulgada', 'clavo 1/2', ['1/2']],
  ['cabilla media', 'cabilla 1/2', ['1/2']],
  ['tubo pvc media aguas blancas azul', 'tubo pvc 1/2 aguas blancas azul', ['1/2']],
  ['3 tee de media 3 adactadore de media', '3 tee 1/2 3 adactadore 1/2', ['1/2']],
  ['TEE DE MEDIA', 'tee 1/2', ['1/2']],
  // mixtas: exactas (sin esto "1-1/2" trae todo lo de 1/2")
  ['tubo de pulgada y media', 'tubo 1-1/2', ['1-1/2']],
  ['tubo de una pulgada y media', 'tubo 1-1/2', ['1-1/2']],
  ['tubo de 1 pulgada y media', 'tubo 1-1/2', ['1-1/2']],
  ['clavo de dos y media', 'clavo 2-1/2', ['2-1/2']],
  ['clavo 2 y media', 'clavo 2-1/2', ['2-1/2']],
  ['clavo de dos pulgadas y media', 'clavo 2-1/2', ['2-1/2']],
  ['tubo de pulgada y cuarto', 'tubo 1-1/4', ['1-1/4']],
  ['tubo de una y cuarto', 'tubo 1-1/4', ['1-1/4']],
  // otras fracciones
  ['manguera de tres cuartos', 'manguera 3/4', ['3/4']],
  ['codo tres cuarto', 'codo 3/4', ['3/4']],
  ['mecha de tres octavos', 'mecha 3/8', ['3/8']],
  ['cabilla tres octavos', 'cabilla 3/8', ['3/8']],
  ['cabilla de cinco octavos', 'cabilla 5/8', ['5/8']],
  ['tornillo de cuarto de pulgada', 'tornillo 1/4', ['1/4']],
  ['tornillo un cuarto de pulgada', 'tornillo 1/4', ['1/4']],
  ['tubo de media y codo de tres cuartos', 'tubo 1/2 codo 3/4', ['1/2', '3/4']],
  // escritas con marca de pulgadas: exactas
  ['tubo pvc 6"', 'tubo pvc 6', ['6"']],
  ['Tubo PVC de 6"', 'tubo pvc 6', ['6"']],
  ['tubo pvc 6 pulgadas', 'tubo pvc 6', ['6"']],
  ['tubo de 6 pulgada', 'tubo 6', ['6"']],
  ['esmeril 7”', 'esmeril 7', ['7"']],
  ["disco 4.5''", 'disco 4.5', ['4.5"']],
  ['clavo 2 pulgadas', 'clavo 2', ['2"']],
  ['tee 1/2"', 'tee 1/2', ['1/2']],
  ['tubo 1-1/2"', 'tubo 1-1/2', ['1-1/2']],
  ['disco 4.1/2"', 'disco 4-1/2', ['4-1/2']],
  ['clavo 2 pulgadas y media', 'clavo 2-1/2', ['2-1/2']],
  ['disco sierra 7 1/4"', 'disco sierra 7-1/4', ['7-1/4']],
  ['tubo 2x1 6 metros', 'tubo 2x1 6', []],
  ['cable 12', 'cable 12', []],
  // NO se tocan
  ['lima media caña', 'lima media cana', []],
  ['media docena de tornillos', 'media docena tornillos', []],
  ['media caja de clavos', 'media caja clavos', []],
  ['esmalte negro cuarto', 'esmalte negro cuarto', []],
  ['pintura un cuarto', 'pintura cuarto', []],
  ['cuarto de galon de pintura', 'cuarto galon pintura', []],
  ['spray azul medio', 'spray azul medio', []],
  ['camisa pelo medio', 'camisa pelo medio', []],
  ['lija medio pliego', 'lija medio pliego', []],
  ['medias', 'medias', []],
  ['tee 1/2', 'tee 1/2', []],
  ['tubo 1-1/2', 'tubo 1-1/2', []],
  ['tubo 1 1/2', 'tubo 1 1/2', []],
  ['remedia', 'remedia', []],
  ['multimedia', 'multimedia', []],
];

test('medidas dichas con palabras', () => {
  for (const [raw, q, exact] of CASES) {
    const r = parseBotQuery(raw);
    assert.equal(r.q, q, raw);
    assert.deepEqual(r.exact.sort(), [...exact].sort(), raw);
  }
});

test('fraccion mixta exacta: 1-1/2 si, 1/2 / 11-1/2 / 2-1/2 no', () => {
  const re = new RegExp(exactFractionRegex('1-1/2'));
  for (const s of ['TUBO RED. VENT. H.N 1-1/2 X 2.5 X 6 MTS', 'TUBO 1 1/2 GALV', 'CLAVO 1-1/2 X 14', 'TUBO RECT. H.P 3 X 1-1/2 X 0.90']) assert.ok(re.test(s), s);
  for (const s of ['TUBO PVC AF 1/2" X 6MTS', 'TUBO 11-1/2', 'CLAVO 2-1/2 X 12', 'TUBO 21 1/2']) assert.ok(!re.test(s), s);
});

test('pulgadas enteras exactas: 6 solo si, 6MTS / 60 / 6.10 / 6-1/2 / 16 no', () => {
  // En Postgres es \M (fin de palabra); en JS \b. Mismo patron.
  const re = new RegExp(exactFractionRegex('6"').replace(/\\M/g, '\\b'), 'i');
  const yes = ['TUBO PVC AN 6" X 3MTS X 3,2MM', 'CODO PVC AN 6" X 90º', 'ALICATE CORTE DIAGONAL 6" FERCO',
    'DISCO SIERRA MADERA 6 PROMAKER', 'TUBO 6 X 3MTS', 'REDUCCION 8 X 6'];
  const no = ['TUBO PVC AF 1/2" X 6MTS', 'TUBO RECT 2 X 1 X 6 MTS', 'CANDADO 60MM', 'LOSACERO 780 X 6.10',
    'MECHA 6-1/2', 'DISCO 16"', 'BROCA 6MM', 'CABLE 6 AWG', 'TUBO 3/6', 'JUEGO 6 PZAS', 'BATERIA 6V', 'TORNILLO 1/4 X 6'.replace('6', '6 MM')];
  for (const s of yes) assert.ok(re.test(s), s);
  for (const s of no) assert.ok(!re.test(s), s);
});

test('pulgadas: casos del piloto (grano, mango plastico, listas)', () => {
  const re = (f: string) => new RegExp(exactFractionRegex(f).replace(/\\M/g, '\\b'), 'i');
  for (const [f, s] of [['7"', 'FIBRO DISCO 7 GR. 120 BEST INOX BOSCH'], ['7"', 'FIBRO DISCO 7 G.120 METAL BOSCH'],
    ['12"', 'ARCO SEGUETA 12 M/PLASTICO TRUEPOWER'], ['8"', 'SET DE 3 ALICATES COMBINADO (6",7",8") INGCO'],
    ['7-1/4', 'DISCO SIERRA P/MADERA 7-1/4" 24D JADEVER'], ['7-1/4', 'DISCO P/MADERA 7.1/4X5/8 60T BOSCH']]) assert.ok(re(f).test(s), f + ' ' + s);
  for (const [f, s] of [['2"', 'TUBO PVC AN 6" X 3MTS X 3,2MM'], ['3"', 'LIJA GRANO 2000 3M (MEDIO PLIEGO)'], ['6"', 'CABLE 6M']]) assert.ok(!re(f).test(s), f + ' ' + s);
});

test('fraccion exacta: 1/2 sola si, 1-1/2 / 2 1/2 / 11/2 no', () => {
  const re = new RegExp(exactFractionRegex('1/2'));
  const yes = ['TEE PVC AF 1/2" ROSCA', 'ADAPTADOR P/RIEGO 20MM X1/2" HEMBRA', 'TEE GALVANIZADA 1" X 1/2" REDUCCION',
    'LLAVE DE PASO 1/2', '1/2 TUBO', 'BARRA 12MM 3/8, 1/2, media', 'CODO 1/2X3/4'];
  const no = ['CLAVO 1-1/2 X 14', 'CLAVO 2-1/2 X 12', 'TUBO 1 1/2 GALV', 'MECHA 11/2', 'TUBO 1-1/2" X 1-1/4"', 'CODO 1/25'];
  for (const s of yes) assert.ok(re.test(s), s);
  for (const s of no) assert.ok(!re.test(s), s);
});
