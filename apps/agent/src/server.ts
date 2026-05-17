import express from 'express';
import cors from 'cors';
import { config } from './config';
import { readFiscalStatus } from './fiscal';
import { printTicket } from './printer';

const app = express();

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
    version: '1.0.0',
    fiscalEnabled: config.fiscalEnabled,
    thermalEnabled: config.thermalEnabled,
    printerName: config.thermalPrinterName,
  });
});

// GET /status
app.get('/status', (_req, res) => {
  if (!config.fiscalEnabled) {
    return res.status(503).json({
      error: 'Módulo fiscal desactivado en config.json',
    });
  }

  const result = readFiscalStatus();

  if (!result) {
    return res.status(404).json({
      error: 'No se pudo leer Status.txt. Verifica que la ruta sea correcta.',
    });
  }

  return res.json(result);
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
  console.log('║       TRINITY AGENT v1.0.0              ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Puerto: ${config.port}                          ║`);
  console.log(`║  Fiscal: ${config.fiscalEnabled ? 'ACTIVO' : 'DESACTIVADO'}                     ║`);
  console.log(`║  Impresora: ${config.thermalEnabled ? 'ACTIVA' : 'DESACTIVADA'}                  ║`);
  if (config.thermalEnabled) {
    console.log(`║  Nombre: ${config.thermalPrinterName}`);
  }
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nServidor corriendo en http://localhost:${config.port}`);
  console.log('Presiona Ctrl+C para detener.\n');
});
