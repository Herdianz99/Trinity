import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { config } from './config';
import { parseMarkupToEscPos } from './escpos';
import { sendRawToPrinter } from './raw-print';

/** Returns true if the content contains ESC/POS markup tags like {{BOLD}} */
function hasMarkup(content: string): boolean {
  return /\{\{[A-Z_/]/.test(content);
}

/** Fallback: plain text print via Windows print /D: command */
function printPlainText(content: string): Promise<boolean> {
  return new Promise((resolve) => {
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

    console.log(`[PRINTER] Fallback texto plano → ${printerName}`);

    exec(command, (error, _stdout, stderr) => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (cleanErr) {
        console.warn(`[PRINTER] No se pudo eliminar archivo temporal: ${(cleanErr as Error).message}`);
      }

      if (error) {
        console.error(`[PRINTER] Error al imprimir: ${error.message}`);
        if (stderr) console.error(`[PRINTER] stderr: ${stderr}`);
        resolve(false);
        return;
      }

      console.log('[PRINTER] Ticket impreso (texto plano)');
      resolve(true);
    });
  });
}

export async function printTicket(content: string): Promise<boolean> {
  if (!config.thermalEnabled) {
    console.log('[PRINTER] Módulo de impresión desactivado en config.json');
    return false;
  }

  if (!content || content.trim().length === 0) {
    console.log('[PRINTER] Contenido del ticket vacío');
    return false;
  }

  // If content has markup tags, use ESC/POS pipeline
  if (hasMarkup(content)) {
    console.log('[PRINTER] Markup detectado — usando pipeline ESC/POS');
    try {
      const escposBytes = parseMarkupToEscPos(content);
      console.log(`[PRINTER] ${escposBytes.length} bytes ESC/POS generados`);
      const rawOk = await sendRawToPrinter(escposBytes, config.thermalPrinterName);
      if (rawOk) {
        console.log('[PRINTER] Ticket impreso (ESC/POS RAW)');
        return true;
      }
      console.warn('[PRINTER] RAW print falló — intentando fallback texto plano');
    } catch (err) {
      console.error(`[PRINTER] Error en pipeline ESC/POS: ${(err as Error).message}`);
      console.warn('[PRINTER] Intentando fallback texto plano');
    }
  }

  // No markup or ESC/POS failed — fallback to plain text
  return printPlainText(content);
}
