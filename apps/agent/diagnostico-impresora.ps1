# Diagnostico del agente Trinity: reproduce paso a paso lo que hace el agente al imprimir RAW.
# Uso: clic derecho -> "Ejecutar con PowerShell", o:
#   powershell -NoProfile -ExecutionPolicy Bypass -File diagnostico-impresora.ps1
$ErrorActionPreference = 'Continue'
function Paso($n, $t) { Write-Host "`n=== PASO $n - $t ===" -ForegroundColor Cyan }

Paso 1 'Agente corriendo (/health)'
try {
  $h = Invoke-RestMethod -Uri 'http://localhost:8765/health' -TimeoutSec 3
  Write-Host "Version: $($h.version) | Impresora en config: '$($h.printerName)' | thermalEnabled: $($h.thermalEnabled)"
  $printer = $h.printerName
} catch {
  Write-Host "El agente NO responde en :8765 -> $($_.Exception.Message)" -ForegroundColor Red
  $printer = Read-Host 'Escribe el nombre EXACTO de la impresora termica'
}

Paso 2 'Impresoras instaladas en Windows'
Get-Printer | Format-Table Name, DriverName, PortName, PrinterStatus -AutoSize
if (-not (Get-Printer -Name $printer -ErrorAction SilentlyContinue)) {
  Write-Host "NO existe una impresora llamada '$printer' (revisa mayusculas/espacios en config.json)" -ForegroundColor Red
}

Paso 3 'Modo de lenguaje de PowerShell'
Write-Host "LanguageMode: $($ExecutionContext.SessionState.LanguageMode)  (debe ser FullLanguage)"
Get-ExecutionPolicy -List | Format-Table -AutoSize

Paso 4 'Compilar el codigo C# (Add-Type) que usa el agente'
try {
  Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterDiag {
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
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr hPrinter);
    public static string Send(string printerName, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printerName, out h, IntPtr.Zero)) return "OpenPrinter fallo, error " + Marshal.GetLastWin32Error();
        try {
            var di = new DOCINFOW { pDocName = "TrinityDiag", pOutputFile = null, pDatatype = "RAW" };
            if (!StartDocPrinter(h, 1, ref di)) return "StartDocPrinter fallo, error " + Marshal.GetLastWin32Error();
            try {
                if (!StartPagePrinter(h)) return "StartPagePrinter fallo, error " + Marshal.GetLastWin32Error();
                IntPtr p = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, p, data.Length);
                    int w;
                    if (!WritePrinter(h, p, data.Length, out w)) return "WritePrinter fallo, error " + Marshal.GetLastWin32Error();
                } finally { Marshal.FreeCoTaskMem(p); }
                EndPagePrinter(h);
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
        return "OK";
    }
}
'@
  Write-Host 'Add-Type OK' -ForegroundColor Green
} catch {
  Write-Host "Add-Type FALLO -> $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Causa probable: antivirus/politica bloquea csc.exe o .NET Framework danado.'
  Read-Host 'Enter para salir'; exit
}

Paso 5 'Enviar ticket de prueba RAW (negrita + linea + corte)'
$enc = [System.Text.Encoding]::ASCII
$bytes = [byte[]](@(0x1b,0x40, 0x1b,0x45,0x01) + $enc.GetBytes("PRUEBA TRINITY NEGRITA`n") +
                  @(0x1b,0x45,0x00) + $enc.GetBytes(('-' * 48) + "`nTexto normal`n") +
                  @(0x1b,0x64,0x04, 0x1d,0x56,0x01))
$r = [RawPrinterDiag]::Send($printer, $bytes)
if ($r -eq 'OK') {
  Write-Host 'RAW enviado OK. Si salio en negrita y corto el papel, el RAW funciona.' -ForegroundColor Green
  Write-Host 'Si salieron simbolos raros en vez de negrita: el driver/puerto no es ESC/POS (ver Paso 2: DriverName).'
} else {
  Write-Host "RAW FALLO -> $r" -ForegroundColor Red
  Write-Host 'Errores comunes: 1801 = nombre de impresora invalido | 5 = acceso denegado | 1804 = el driver no acepta RAW'
}

Paso 6 'Carpeta temporal (el agente escribe ahi .bin y .ps1)'
$t = [System.IO.Path]::GetTempPath(); Write-Host "TEMP: $t"
try { $f = Join-Path $t 'trinity-diag.ps1'; 'Write-Output OK' | Out-File $f; $o = powershell -NoProfile -ExecutionPolicy Bypass -File $f; Remove-Item $f; Write-Host "Ejecutar .ps1 desde TEMP: $o" -ForegroundColor Green }
catch { Write-Host "No se pudo ejecutar un .ps1 desde TEMP -> $($_.Exception.Message)" -ForegroundColor Red }

Read-Host "`nListo. Toma foto/copia de esta ventana y Enter para salir"
