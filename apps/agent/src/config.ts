import * as fs from 'fs';
import * as path from 'path';

export interface AgentConfig {
  port: number;
  thermalEnabled: boolean;
  thermalPrinterName: string;
}

const REQUIRED_FIELDS: (keyof AgentConfig)[] = [
  'port',
  'thermalEnabled',
  'thermalPrinterName',
];

export function loadConfig(): AgentConfig {
  // Empaquetado con pkg, __dirname apunta al snapshot virtual (C:\snapshot\...),
  // por eso el config.json debe resolverse junto al .exe REAL (process.execPath).
  // En desarrollo (ts-node) se usa la ruta del proyecto.
  const baseDir = (process as any).pkg
    ? path.dirname(process.execPath)
    : path.resolve(__dirname, '..');
  const configPath = path.join(baseDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error(`[ERROR] No se encontró config.json en: ${configPath}`);
    console.error('Crea el archivo config.json junto al ejecutable.');
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
    // El Bloc de notas puede guardar UTF-8 con BOM (U+FEFF) y romper JSON.parse
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  } catch (err) {
    console.error(`[ERROR] No se pudo leer config.json: ${(err as Error).message}`);
    process.exit(1);
  }

  let config: any;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error(`[ERROR] config.json tiene un formato JSON inválido: ${(err as Error).message}`);
    process.exit(1);
  }

  for (const field of REQUIRED_FIELDS) {
    if (config[field] === undefined || config[field] === null) {
      console.error(`[ERROR] Falta el campo requerido "${field}" en config.json`);
      process.exit(1);
    }
  }

  return config as AgentConfig;
}

export const config = loadConfig();
