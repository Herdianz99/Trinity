/**
 * Sends raw ESC/POS bytes to a Windows printer using PowerShell + winspool.drv.
 * Uses P/Invoke (OpenPrinter → StartDocPrinter RAW → WritePrinter → close)
 * to bypass the printer driver and send native ESC/POS commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

// C# class that P/Invokes winspool.drv for RAW printing
const CSHARP_RAW_PRINTER = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static bool SendBytes(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            Console.Error.WriteLine("OpenPrinter failed: " + Marshal.GetLastWin32Error());
            return false;
        }
        try {
            var di = new DOCINFOW { pDocName = "TrinityTicket", pOutputFile = null, pDatatype = "RAW" };
            if (!StartDocPrinter(hPrinter, 1, ref di)) {
                Console.Error.WriteLine("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
                return false;
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    Console.Error.WriteLine("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
                    return false;
                }
                IntPtr pUnmanaged = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, pUnmanaged, data.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pUnmanaged, data.Length, out written)) {
                        Console.Error.WriteLine("WritePrinter failed: " + Marshal.GetLastWin32Error());
                        return false;
                    }
                } finally {
                    Marshal.FreeCoTaskMem(pUnmanaged);
                }
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
        return true;
    }
}
`.trim();

function buildPowerShellScript(binPath: string, printerName: string): string {
  // Escape backslashes and quotes for the C# string
  const escapedBinPath = binPath.replace(/\\/g, '\\\\');
  const escapedPrinter = printerName.replace(/'/g, "''");

  return `
Add-Type -TypeDefinition @'
${CSHARP_RAW_PRINTER}
'@
$bytes = [System.IO.File]::ReadAllBytes("${escapedBinPath}")
$result = [RawPrinter]::SendBytes('${escapedPrinter}', $bytes)
if ($result) { Write-Output "OK" } else { Write-Error "PRINT_FAILED"; exit 1 }
`.trim();
}

// ESC/POS command names for debug decode
const CMD_NAMES: Record<string, string> = {
  '1b40': 'INIT',
  '1b7402': 'SET_CP850',
  '1b6100': 'ALIGN_LEFT',
  '1b6101': 'ALIGN_CENTER',
  '1b6102': 'ALIGN_RIGHT',
  '1b4501': 'BOLD_ON',
  '1b4500': 'BOLD_OFF',
  '1d2100': 'SIZE_NORMAL',
  '1d2111': 'SIZE_BIG',
  '1d2110': 'SIZE_WIDE',
  '1d2101': 'SIZE_TALL',
  '1d5601': 'PARTIAL_CUT',
  '1b700019': 'OPEN_DRAWER',
};

function decodeEscPosForDebug(data: Buffer): string {
  const lines: string[] = [];
  let i = 0;
  let textBuf = '';

  const flushText = () => {
    if (textBuf.length > 0) {
      lines.push(`  TEXT: "${textBuf}"`);
      textBuf = '';
    }
  };

  while (i < data.length) {
    const b = data[i];

    if (b === 0x1b || b === 0x1d) {
      flushText();
      // Try to match known commands (2-5 byte sequences)
      let matched = false;
      for (let len = 5; len >= 2; len--) {
        if (i + len > data.length) continue;
        const hex = data.subarray(i, i + len).toString('hex');
        if (CMD_NAMES[hex]) {
          lines.push(`  CMD: [${hex}] ${CMD_NAMES[hex]}`);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // ESC d n (feed n lines)
        if (b === 0x1b && i + 2 < data.length && data[i + 1] === 0x64) {
          lines.push(`  CMD: FEED ${data[i + 2]} lines`);
          i += 3;
        } else {
          lines.push(`  CMD: [${data[i].toString(16).padStart(2, '0')} ${data[i + 1]?.toString(16).padStart(2, '0') || '??'}] (unknown)`);
          i += 2;
        }
      }
    } else if (b === 0x0a) {
      flushText();
      lines.push('  NEWLINE');
      i++;
    } else {
      // Printable or CP850 character
      textBuf += (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : `[0x${b.toString(16)}]`;
      i++;
    }
  }
  flushText();
  return lines.join('\n');
}

export function sendRawToPrinter(data: Buffer, printerName: string, debug = false): Promise<boolean> {
  return new Promise((resolve) => {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const binFile = path.join(tempDir, `trinity-escpos-${timestamp}.bin`);

    if (debug) {
      // Debug mode: save files and decode, don't send to printer
      const debugBin = path.join(tempDir, `trinity-debug-${timestamp}.bin`);
      const debugTxt = path.join(tempDir, `trinity-debug-${timestamp}.txt`);
      try {
        fs.writeFileSync(debugBin, data);
        const decoded = decodeEscPosForDebug(data);
        const header = `ESC/POS Debug Dump - ${new Date().toISOString()}\nTarget: "${printerName}" | ${data.length} bytes\n${'='.repeat(50)}\n`;
        fs.writeFileSync(debugTxt, header + decoded, 'utf-8');
        console.log(`[RAW-PRINT] DEBUG MODE - ${data.length} bytes decoded`);
        console.log(`[RAW-PRINT]   .bin → ${debugBin}`);
        console.log(`[RAW-PRINT]   .txt → ${debugTxt}`);
        console.log('[RAW-PRINT] --- Decoded output ---');
        console.log(decoded);
        console.log('[RAW-PRINT] --- End ---');
      } catch (err) {
        console.error(`[RAW-PRINT] Debug write error: ${(err as Error).message}`);
      }
      resolve(true);
      return;
    }

    try {
      fs.writeFileSync(binFile, data);
    } catch (err) {
      console.error(`[RAW-PRINT] Error writing temp file: ${(err as Error).message}`);
      resolve(false);
      return;
    }

    const psScript = buildPowerShellScript(binFile, printerName);

    // Encode as Base64 UTF-16LE for -EncodedCommand (avoids quoting issues)
    const utf16le = Buffer.from(psScript, 'utf16le');
    const b64 = utf16le.toString('base64');

    const command = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`;

    console.log(`[RAW-PRINT] Sending ${data.length} bytes to "${printerName}"`);

    exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
      // Clean up temp file
      try {
        if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
      } catch {}

      if (error) {
        console.error(`[RAW-PRINT] Error: ${error.message}`);
        if (stderr) console.error(`[RAW-PRINT] stderr: ${stderr}`);
        resolve(false);
        return;
      }

      if (stdout.trim().includes('OK')) {
        console.log('[RAW-PRINT] Sent successfully');
        resolve(true);
      } else {
        console.error(`[RAW-PRINT] Unexpected output: ${stdout}`);
        resolve(false);
      }
    });
  });
}
