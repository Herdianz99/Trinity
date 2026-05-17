import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { config } from './config';

export function printTicket(content: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!config.thermalEnabled) {
      console.log('[PRINTER] Módulo de impresión desactivado en config.json');
      resolve(false);
      return;
    }

    if (!content || content.trim().length === 0) {
      console.log('[PRINTER] Contenido del ticket vacío');
      resolve(false);
      return;
    }

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `trinity-ticket-${Date.now()}.txt`);

    try {
      fs.writeFileSync(tempFile, content, 'utf-8');
    } catch (err) {
      console.error(`[PRINTER] Error al escribir archivo temporal: ${(err as Error).message}`);
      resolve(false);
      return;
    }

    const printerName = config.thermalPrinterName;
    const command = `print /D:"${printerName}" "${tempFile}"`;

    console.log(`[PRINTER] Imprimiendo en: ${printerName}`);

    exec(command, (error, _stdout, stderr) => {
      // Limpiar archivo temporal
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanErr) {
        console.warn(`[PRINTER] No se pudo eliminar archivo temporal: ${(cleanErr as Error).message}`);
      }

      if (error) {
        console.error(`[PRINTER] Error al imprimir: ${error.message}`);
        if (stderr) console.error(`[PRINTER] stderr: ${stderr}`);
        resolve(false);
        return;
      }

      console.log('[PRINTER] Ticket impreso correctamente');
      resolve(true);
    });
  });
}
