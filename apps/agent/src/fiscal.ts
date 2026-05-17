import * as fs from 'fs';
import { config } from './config';

export interface FiscalStatus {
  invoiceFiscalNumber: string;
  creditNoteFiscalNumber: string;
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

    // Número de factura fiscal: mid(21,8) → substring(20, 28)
    const invoiceFiscalNumber = content.substring(20, 28).trim();

    // Número de nota de crédito fiscal: mid(47,8) → substring(46, 54)
    const creditNoteFiscalNumber = content.substring(46, 54).trim();

    // Serial de máquina: mid(92,10) → substring(91, 101)
    const machineSerial = content.substring(91, 101).trim();

    console.log(`[FISCAL] Leído → invoiceFiscalNumber: ${invoiceFiscalNumber}, creditNoteFiscalNumber: ${creditNoteFiscalNumber}, machineSerial: ${machineSerial}`);

    return { invoiceFiscalNumber, creditNoteFiscalNumber, machineSerial };
  } catch (err) {
    console.error(`[FISCAL] Error al leer ${filePath}: ${(err as Error).message}`);
    return null;
  }
}
