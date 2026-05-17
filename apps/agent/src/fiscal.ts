import * as fs from 'fs';
import { config } from './config';

export interface FiscalStatus {
  fiscalNumber: string;
  machineSerial: string;
}

export function readFiscalStatus(): FiscalStatus | null {
  if (!config.fiscalEnabled) {
    console.log('[FISCAL] Módulo fiscal desactivado en config.json');
    return null;
  }

  const filePath = config.fiscalStatusPath;

  if (!fs.existsSync(filePath)) {
    console.log(`[FISCAL] No se encontró el archivo: ${filePath}`);
    console.log('[FISCAL] Verifica que la ruta fiscalStatusPath en config.json sea correcta.');
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Número de factura fiscal: posición 21, longitud 8 (índice 20 a 28 en JS)
    const fiscalNumber = content.substring(20, 28).trim();

    // Serial de máquina: posición 92, longitud 10 (índice 91 a 101 en JS)
    const machineSerial = content.substring(91, 101).trim();

    console.log(`[FISCAL] Leído → fiscalNumber: ${fiscalNumber}, machineSerial: ${machineSerial}`);

    return { fiscalNumber, machineSerial };
  } catch (err) {
    console.error(`[FISCAL] Error al leer ${filePath}: ${(err as Error).message}`);
    return null;
  }
}
