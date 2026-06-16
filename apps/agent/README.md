# Trinity Agent

Servidor local (.exe) que corre en cada PC (caja y cada despacho). Recibe tickets y
comandas desde la web app y los envía a la impresora térmica con formato ESC/POS
(negrita, centrado, texto grande, corte automático). Versión actual: **1.1.1**.

## Documentación

- **`INSTALACION-CLIENTE.md`** — guía paso a paso para instalar en cada PC del cliente
  (esta es la que se sigue en sitio).
- **`SETUP.md`** — referencia técnica (config.json, arranque, troubleshooting, arquitectura).

## Resumen rápido de instalación

1. Copiar a una misma carpeta (recomendado `C:\Trinity\`) los 3 archivos:
   `trinity-agent.exe`, `config.json`, `iniciar-agente.vbs`.
2. Editar `config.json` → poner el nombre exacto de la impresora de esa PC en
   `thermalPrinterName` (verlo con `Get-Printer` en PowerShell o en "Impresoras y escáneres").
3. Poner un acceso directo de **`iniciar-agente.vbs`** (no del .exe) en `shell:startup`
   para que arranque solo y oculto al encender la PC.
4. Verificar en `http://localhost:8765/health` (debe decir `version: 1.1.1`).
5. (Solo despachos) En la app: Configuración → "Área de Impresión de esta PC" → su zona.

> NO se necesita ejecutarlo como Administrador. El `.vbs` lo lanza sin ventana de consola.

## Impresora fiscal

La comunicación con la impresora fiscal The Factory HKA se hace directamente desde el
navegador usando Web Serial API (Chrome o Edge). No usa este agente ni `Status.txt`
ni `IntTFHKA.exe`.

## Requisitos

- Windows 10 o superior.
- Chrome o Edge (solo si se usa la impresora fiscal por Web Serial).
