// node apps/web/src/lib/kiosk-speech.check.ts
import assert from 'node:assert/strict';
import { textForSpeech } from './kiosk-speech.ts';

assert.equal(textForSpeech('Está en 12.50$ bcv.'), 'Está en 12 dólares con 50 a tasa BCV.');
assert.equal(textForSpeech('Cuesta 1.00$ bcv'), 'Cuesta 1 dólar a tasa BCV');
assert.equal(textForSpeech('Cuesta 9.05$'), 'Cuesta 9 dólares con 5');
assert.equal(textForSpeech('Tubo de 1/2" y 3/4"'), 'Tubo de 1/2 pulgada y 3/4 pulgada');
assert.equal(textForSpeech('Hola 👋 *amigo*'), 'Hola amigo');
console.log('kiosk-speech.check OK');
