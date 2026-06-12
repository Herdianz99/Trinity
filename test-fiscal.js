/**
 * TEST FISCAL — Diagnóstico y recuperación de estado
 */
const { SerialPort } = require('./apps/agent/node_modules/serialport');

const COM_PORT = 'COM3';
const STX = 0x02;
const ETX = 0x03;
const ENQ = 0x05;
const ACK = 0x06;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const port = new SerialPort({
    path: COM_PORT, baudRate: 9600, dataBits: 8,
    parity: 'even', stopBits: 1, rtscts: true, autoOpen: false,
  });

  const buf = [];
  await new Promise((res, rej) => port.open(e => e ? rej(e) : res()));
  port.on('data', chunk => { for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]); });

  const write = async (data) => { port.write(data); await new Promise(r => port.drain(r)); };

  const enq = async () => {
    buf.length = 0;
    await write(Buffer.from([ENQ]));
    await sleep(800);
    if (buf.length < 5) return null;
    return { sts1: buf[1], sts2: buf[2] };
  };

  const sendCmd = async (cmd) => {
    buf.length = 0;
    const dataBytes = Buffer.from(cmd, 'ascii');
    let lrc = 0;
    for (let i = 0; i < dataBytes.length; i++) lrc ^= dataBytes[i];
    lrc ^= ETX;
    const frame = Buffer.alloc(dataBytes.length + 3);
    frame[0] = STX;
    dataBytes.copy(frame, 1);
    frame[dataBytes.length + 1] = ETX;
    frame[dataBytes.length + 2] = lrc;
    await write(frame);
    await sleep(1500);
    if (buf.length === 1 && buf[0] === ACK) return 'ACK';
    if (buf.length === 1 && buf[0] === 0x15) return 'NAK';
    if (buf.length >= 5 && buf[0] === STX) return `STATUS(sts1=0x${buf[1].toString(16)},sts2=0x${buf[2].toString(16)})`;
    return `UNKNOWN(${buf.length}b: ${Buffer.from(buf).toString('hex')})`;
  };

  try {
    console.log('=== DIAGNÓSTICO IMPRESORA ===\n');

    // Estado actual
    let st = await enq();
    if (!st) { console.log('Sin respuesta'); return; }

    const decode = (s1) => {
      const states = {
        0x40: 'ENTRENAMIENTO - En espera',
        0x42: 'ENTRENAMIENTO - Doc no fiscal abierto',
        0x44: 'ENTRENAMIENTO - Doc fiscal abierto',
        0x60: 'FISCAL - En espera',
        0x61: 'FISCAL - Esperando items (doc fiscal iniciado)',
        0x62: 'FISCAL - Doc no fiscal abierto',
        0x64: 'FISCAL - Doc fiscal con items',
        0x66: 'FISCAL - Doc fiscal y no fiscal abiertos',
        0x68: 'FISCAL - Memoria casi llena',
      };
      return states[s1] || `DESCONOCIDO (0x${s1.toString(16)})`;
    };

    console.log(`Estado: STS1=0x${st.sts1.toString(16)} → ${decode(st.sts1)}`);
    console.log(`Errores: STS2=0x${st.sts2.toString(16)} → ${st.sts2 === 0x40 ? 'Ninguno' : '¡HAY ERROR!'}\n`);

    if (st.sts1 === 0x60) {
      console.log('Impresora ya está en espera. No hay nada que recuperar.');
      return;
    }

    // Intentar recuperar
    console.log('=== INTENTANDO RECUPERAR ===\n');

    // Intento 1: Enviar un ítem exento de 0.01 Bs + subtotal + pago para cerrar el documento
    console.log('Paso 1: Enviando ítem mínimo (0.01 Bs exento)...');
    let resp = await sendCmd(' 000000000100001000Anulado');
    console.log(`  Resp: ${resp}`);

    st = await enq();
    console.log(`  Estado: 0x${st?.sts1.toString(16)} → ${decode(st?.sts1)}\n`);

    console.log('Paso 2: Subtotal...');
    resp = await sendCmd('3');
    console.log(`  Resp: ${resp}`);

    st = await enq();
    console.log(`  Estado: 0x${st?.sts1.toString(16)} → ${decode(st?.sts1)}\n`);

    console.log('Paso 3: Pago (cerrar documento)...');
    resp = await sendCmd('101');
    console.log(`  Resp: ${resp}`);

    await sleep(2000);

    st = await enq();
    console.log(`  Estado: 0x${st?.sts1.toString(16)} → ${decode(st?.sts1)}\n`);

    if (st?.sts1 === 0x60) {
      console.log('¡RECUPERADA! Impresora en espera.');
    } else {
      console.log(`Aún no en espera (0x${st?.sts1.toString(16)}). Puede necesitar intervención manual.`);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    try { await new Promise(r => port.close(() => r())); } catch {}
  }
}

main().catch(console.error);
