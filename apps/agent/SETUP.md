# Trinity Agent - Manual de instalacion en produccion

## Que es

El agente es un servidor local (.exe) que corre en la PC de la caja. Recibe tickets
desde la web app y los envia a la impresora termica con formato ESC/POS (bold, centrado,
texto grande, corte de papel automatico).

## Archivos necesarios

En la PC de la caja solo necesitas 2 archivos en la misma carpeta:

```
C:\Trinity\
  trinity-agent.exe
  config.json
```

## Generar el .exe

Desde la maquina de desarrollo:

```bash
cd apps/agent
npm run build
npm run package
```

Esto genera `trinity-agent.exe`. Copiarlo a la PC destino.

## config.json

```json
{
  "port": 8765,
  "thermalEnabled": true,
  "thermalPrinterName": "POS-80",
  "debugEscPos": false
}
```

### Campos

| Campo | Requerido | Descripcion |
|---|---|---|
| `port` | Si | Puerto del servidor local (siempre 8765) |
| `thermalEnabled` | Si | true para activar impresion |
| `thermalPrinterName` | Si | Nombre exacto de la impresora en Windows (ver abajo) |
| `comandaPrinterName` | No | Impresora de cocina. Si no se pone, usa la misma de tickets |
| `debugEscPos` | No | true = no imprime, solo loguea los comandos. Para pruebas sin impresora |

### Como obtener el nombre exacto de la impresora

En la PC destino, abrir PowerShell y ejecutar:

```powershell
Get-Printer | Select-Object Name
```

Copiar el nombre exacto (ejemplo: `POS-80`, `EPSON TM-T20III`, etc.) y pegarlo
en `thermalPrinterName`.

## Inicio automatico con Windows

Para que el agente arranque solo al prender la PC:

1. Presionar `Win + R`
2. Escribir `shell:startup` y Enter
3. Se abre la carpeta de Startup
4. Crear un acceso directo de `trinity-agent.exe` ahi

Al reiniciar la PC, el agente arranca automaticamente en background.

## Verificar que esta corriendo

Desde cualquier navegador en la misma PC:

```
http://localhost:8765/health
```

Debe responder:

```json
{
  "status": "ok",
  "version": "2.0.0",
  "escposSupported": true,
  "thermalEnabled": true
}
```

## Modo debug (sin impresora)

Para probar sin impresora fisica, poner en config.json:

```json
{
  "debugEscPos": true,
  "thermalPrinterName": "Microsoft Print to PDF"
}
```

El agente decodifica los comandos ESC/POS en consola y guarda archivos .bin y .txt
en la carpeta temporal de Windows para inspeccion.

## Troubleshooting

**El agente no arranca:**
- Verificar que config.json existe junto al .exe
- Verificar que el JSON es valido (sin comas extra, comillas correctas)

**Imprime pero sin formato (texto plano):**
- Verificar que la impresora soporta ESC/POS (la mayoria de termicas POS lo soportan)
- Verificar que `debugEscPos` esta en false o no existe

**No imprime nada:**
- Verificar nombre de impresora con `Get-Printer` en PowerShell
- Verificar que la impresora esta encendida y conectada
- Probar con `debugEscPos: true` para ver si el agente recibe el contenido

**La web no detecta el agente:**
- Verificar que el agente esta corriendo (http://localhost:8765/health)
- El navegador debe estar en la misma PC que el agente
- Si usan HTTPS (eltrebol.app), el navegador puede bloquear requests a localhost HTTP.
  Esto se resuelve porque el fetch va a http://localhost que es excepcion de mixed-content.

## Actualizaciones

El agente es "install once, never update". El formato del ticket lo controla la web app
mediante tags markup ({{BOLD}}, {{CENTER}}, {{CUT}}, etc). Para cambiar el layout del
ticket solo se actualiza la web en el servidor — el .exe no cambia.

Solo se necesita actualizar el .exe si se agregan nuevos comandos ESC/POS al vocabulario.
