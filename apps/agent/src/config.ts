import * as fs from 'fs';
import * as path from 'path';

export interface AgentConfig {
  port: number;
  fiscalEnabled: boolean;
  fiscalStatusPath: string;
  thermalEnabled: boolean;
  thermalPrinterName: string;
}

const REQUIRED_FIELDS: (keyof AgentConfig)[] = [
  'port',
  'fiscalEnabled',
  'fiscalStatusPath',
  'thermalEnabled',
  'thermalPrinterName',
];

export function loadConfig(): AgentConfig {
  const configPath = path.resolve(__dirname, '..', 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error(`[ERROR] No se encontró config.json en: ${configPath}`);
    console.error('Crea el archivo config.json junto al ejecutable.');
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
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
