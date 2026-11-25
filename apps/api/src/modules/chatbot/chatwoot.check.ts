// Verificacion sin jest: node apps/api/src/modules/chatbot/chatwoot.check.ts
import assert from 'node:assert/strict';
import {
  appendWebProductLink,
  isSafeAttachmentUrl,
  isWithinHourRange,
  mapChatwootChannel,
  parseChatwootPayload,
  splitForChannel,
} from './chatwoot-helpers.ts';
import { ChatwootBurstQueue } from './chatwoot-queue.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. Mapeo de canales
assert.equal(mapChatwootChannel('Channel::WebWidget'), 'WEB');
assert.equal(mapChatwootChannel('Channel::Whatsapp'), 'WHATSAPP');
assert.equal(mapChatwootChannel('Channel::Instagram'), 'INSTAGRAM');
assert.equal(mapChatwootChannel('Channel::FacebookPage'), 'FACEBOOK');
assert.equal(mapChatwootChannel(''), 'WEB');

// 2. Parseo de webhook incoming, outgoing humano, nota privada y status_changed
const incoming = parseChatwootPayload({
  event: 'message_created',
  id: 101,
  content: '  precio cemento  ',
  message_type: 'incoming',
  private: false,
  account: { id: 1 },
  conversation: {
    id: 55,
    status: 'pending',
    channel: 'Channel::WebWidget',
    meta: { sender: { name: 'Carlos Perez', phone_number: '+584141234567' } },
  },
  attachments: [{ file_type: 'image', data_url: 'https://chat.ferreteriaeltrebol.com/rails/active_storage/blobs/x.jpg' }],
});
assert.equal(incoming.kind, 'incoming');
if (incoming.kind === 'incoming') {
  assert.equal(incoming.text, 'precio cemento');
  assert.equal(incoming.channel, 'WEB');
  assert.equal(incoming.contactName, 'Carlos Perez');
  assert.equal(incoming.attachments.length, 1);
}

const privateNote = parseChatwootPayload({
  event: 'message_created', id: 102, content: 'nota', message_type: 'outgoing', private: true,
  account: { id: 1 }, conversation: { id: 55 }, sender: { type: 'user' },
});
assert.equal(privateNote.kind, 'ignore');

const humanReply = parseChatwootPayload({
  event: 'message_created', id: 103, content: 'hola te atiendo', message_type: 'outgoing', private: false,
  account: { id: 1 }, conversation: { id: 55 }, sender: { type: 'user' },
});
assert.equal(humanReply.kind, 'human_replied');

const botEcho = parseChatwootPayload({
  event: 'message_created', id: 104, content: 'precio 10$', message_type: 'outgoing', private: false,
  account: { id: 1 }, conversation: { id: 55 }, sender: { type: 'agent_bot' },
});
assert.equal(botEcho.kind, 'ignore');

const statusEvt = parseChatwootPayload({
  event: 'conversation_status_changed', id: 55, status: 'open', account: { id: 1 },
});
assert.equal(statusEvt.kind, 'status_changed');

// 3. Proteccion SSRF en adjuntos
assert.equal(isSafeAttachmentUrl('https://chat.ferreteriaeltrebol.com/rails/blob/1.jpg', ['https://chat.ferreteriaeltrebol.com']), true);
assert.equal(isSafeAttachmentUrl('http://169.254.169.254/latest/meta-data', ['https://chat.ferreteriaeltrebol.com']), false);
assert.equal(isSafeAttachmentUrl('https://evil.example/x.jpg', ['https://chat.ferreteriaeltrebol.com']), false);

// 4. Limite 1.000 caracteres en Instagram
const longMsg = Array.from({ length: 30 }, (_, i) => `Producto ${i + 1}: Martillo carpintero 16oz en 12.50$ bcv.`).join('\n');
assert.ok(longMsg.length > 1000);
const igChunks = splitForChannel(longMsg, 'INSTAGRAM');
assert.ok(igChunks.length >= 2);
for (const c of igChunks) assert.ok(c.length <= 980);
assert.equal(splitForChannel(longMsg, 'WEB').length, 1);

// 5. Horario humano (Caracas)
assert.equal(isWithinHourRange(10, '8-17'), true);
assert.equal(isWithinHourRange(17, '8-17'), false);
assert.equal(isWithinHourRange(7, '8-17'), false);
assert.equal(isWithinHourRange(22, '20-7'), true);
assert.equal(isWithinHourRange(10, ''), false);

// 6. Enlace en web chat
const withLink = appendWebProductLink('Cemento 10$ bcv', [{ code: 'CON001', name: 'Cemento' }], 'https://ferreteriaeltrebol.com/');
assert.ok(withLink.includes('https://ferreteriaeltrebol.com/productos?q=CON001'));

// 7. Cola antirafagas: 3 mensajes seguidos -> 1 sola llamada agrupada
async function testQueue() {
  const calls: string[][] = [];
  const q1 = new ChatwootBurstQueue<string>(async (_k, batch) => {
    calls.push(batch);
  });
  q1.enqueue('1:10', 'Hola', 40);
  await sleep(15);
  q1.enqueue('1:10', 'Buenos dias', 40);
  await sleep(15);
  q1.enqueue('1:10', 'tienen carretillas?', 40);
  await sleep(80);
  assert.deepEqual(calls, [['Hola', 'Buenos dias', 'tienen carretillas?']]);

  // 8. Bloqueo serial: mensaje que llega MIENTRAS el bot responde entra en la vuelta siguiente (nunca en paralelo)
  const serial: string[][] = [];
  let active = 0;
  let maxActive = 0;
  const q2 = new ChatwootBurstQueue<string>(async (_k, batch) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(60);
    serial.push(batch);
    active--;
  });
  q2.enqueue('1:20', 'precio cemento', 25);
  await sleep(45); // ya esta corriendo el primer turno
  q2.enqueue('1:20', 'y cabillas 3/8', 25);
  await sleep(240);
  assert.equal(maxActive, 1);
  assert.deepEqual(serial, [['precio cemento'], ['y cabillas 3/8']]);

  // 9. Cancelacion por asesor: descarta pendientes y sube epoch si ya estaba corriendo
  let seenEpochMismatch = false;
  const q3 = new ChatwootBurstQueue<string>(async (key, _batch, startEpoch) => {
    await sleep(50);
    if (q3.epoch(key) !== startEpoch) seenEpochMismatch = true;
  });
  q3.enqueue('1:30', 'hola', 20);
  await sleep(35); // ya inicio
  q3.cancel('1:30'); // asesor entra a mitad de respuesta
  await sleep(60);
  assert.equal(seenEpochMismatch, true);

  console.log('chatwoot.check OK');
}

testQueue().catch((e) => {
  console.error(e);
  process.exit(1);
});
