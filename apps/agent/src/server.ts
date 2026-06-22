import express from 'express';
import cors from 'cors';
import { config } from './config';
import { printTicket } from './printer';

const app = express();

// Private Network Access (Chrome): cuando una pagina HTTPS publica (eltrebol.app)
// hace fetch a una direccion local (localhost:8765), Chrome manda un preflight con
// 'Access-Control-Request-Private-Network: true' y BLOQUEA la respuesta si el agente
// no contesta con 'Access-Control-Allow-Private-Network: true'. Sin esto, isAgentRunning()
// del navegador falla aunque el agente este corriendo, y la comanda cae a window.print().
// Se setea antes del middleware de cors para que viaje tambien en la respuesta del preflight.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

// CORS: permitir localhost:3000, eltrebol.app y cualquier origen local
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'https://localhost:3000',
      'https://eltrebol.app',
      'http://eltrebol.app',
    ];
    if (
      allowed.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json());

// GET /health
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.3',
    thermalEnabled: config.thermalEnabled,
    printerName: config.thermalPrinterName,
  });
});

// POST /print-ticket
app.post('/print-ticket', async (req, res) => {
  if (!config.thermalEnabled) {
    return res.status(503).json({
      error: 'Módulo de impresión desactivado en config.json',
    });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({
      error: 'Contenido del ticket vacío',
    });
  }

  const success = await printTicket(content);

  if (success) {
    return res.json({ success: true });
  }

  return res.status(500).json({
    error: 'Error al imprimir. Verifica que la impresora esté encendida y conectada.',
  });
});

// Iniciar servidor
app.listen(config.port, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       TRINITY AGENT v1.1.3              ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Puerto: ${config.port}                          ║`);
  console.log(`║  Impresora: ${config.thermalEnabled ? 'ACTIVA' : 'DESACTIVADA'}                  ║`);
  if (config.thermalEnabled) {
    console.log(`║  Nombre: ${config.thermalPrinterName}`);
  }
  console.log('║  Fiscal: via Web Serial (navegador)     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nServidor corriendo en http://localhost:${config.port}`);
  console.log('Presiona Ctrl+C para detener.\n');
});
