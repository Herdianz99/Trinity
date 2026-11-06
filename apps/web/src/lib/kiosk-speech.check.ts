// node apps/web/src/lib/kiosk-speech.check.ts
import assert from 'node:assert/strict';
import { textForSpeech } from './kiosk-speech.ts';

assert.equal(textForSpeech('Está en 12.50$ bcv.'), 'Está en 12 dólares con 50 a tasa BCV.');
assert.equal(textForSpeech('Cuesta 1.00$ bcv'), 'Cuesta 1 dólar a tasa BCV');
assert.equal(textForSpeech('Cuesta 9.05$'), 'Cuesta 9 dólares con 5');
assert.equal(textForSpeech('Tubo de 1/2" y 3/4"'), 'Tubo de 1/2 pulgada y 3/4 pulgada');
assert.equal(textForSpeech('Hola 👋 *amigo*'), 'Hola amigo');
console.log('kiosk-speech.check OK');

// mergeTranscripts: Chrome en PC manda trozos nuevos; Chrome en Android repite el acumulado en cada resultado.
import { mergeTranscripts } from './kiosk-speech.ts';
assert.equal(mergeTranscripts(['cuánto cuesta', ' el cemento gris']), 'cuánto cuesta el cemento gris');
assert.equal(mergeTranscripts(['cemento', 'cemento gris', 'cemento gris de 42']), 'cemento gris de 42');
assert.equal(mergeTranscripts(['Cemento', 'cemento gris']), 'cemento gris');
assert.equal(mergeTranscripts(['tienen codos', 'tienen codos', 'de media']), 'tienen codos de media');
assert.equal(mergeTranscripts(['', '  ', 'hola']), 'hola');
assert.equal(mergeTranscripts([]), '');
console.log('mergeTranscripts OK');

// rankVoices: primero las naturales/en linea, luego Google, prefiriendo español latino y voz masculina (Clover)
import { rankVoices } from './kiosk-speech.ts';
const V = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name });
const ranked = rankVoices([
  V('Microsoft Helena - Spanish (Spain)', 'es-ES'),
  V('English US', 'en-US'),
  V('Google español de Estados Unidos', 'es-US', false),
  V('Microsoft Paola Online (Natural) - Spanish (Venezuela)', 'es-VE', false),
  V('Microsoft Sebastian Online (Natural) - Spanish (Venezuela)', 'es-VE', false),
  V('Spanish Mexico', 'es_MX'),
]).map((v) => v.name);
assert.equal(ranked[0], 'Microsoft Sebastian Online (Natural) - Spanish (Venezuela)');
assert.equal(ranked[1], 'Microsoft Paola Online (Natural) - Spanish (Venezuela)');
assert.equal(ranked[2], 'Google español de Estados Unidos');
assert.ok(!ranked.includes('English US'));
assert.equal(ranked.length, 5);
console.log('rankVoices OK');
