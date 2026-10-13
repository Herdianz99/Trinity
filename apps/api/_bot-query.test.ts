import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBotQuery } from './src/modules/chatbot/chatbot-tools.service';

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
