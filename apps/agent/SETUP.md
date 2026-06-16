# Trinity Agent - Manual de instalacion en produccion

## Que es

El agente es un servidor local (.exe) que corre en cada PC (caja y cada despacho).
Recibe tickets y comandas desde la web app y los envia a la impresora termica con
formato ESC/POS (bold, centrado, texto grande, corte de papel automatico).

Version actual: **1.1.1**.

## Arquitectura (importante)

**1 PC = 1 zona = 1 agente = 1 impresora.**

- Tanto el **ticket 80mm de caja** como las **comandas de despacho** usan el MISMO agente
  (`http://localhost:8765`, endpoint `POST /print-ticket`).
- El agente imprime a UNA sola impresora (`thermalPrinterName`). NO reparte a varias
  impresoras por zona. Para Despacho Interno y Despacho Externo se necesita **una PC por
  despacho**, cada una con su agente y su impresora, y cada una configurada a su zona en
  la web (Configuracion -> "Area de Impresion de esta PC").
- Si el agente NO esta corriendo, la web cae a `window.print()` (dialogo del navegador,
  no silencioso). Por eso el agente debe estar SIEMPRE corriendo.

## Archivos necesarios

En cada PC, en la misma carpeta:

```
C:\Trinity\
  trinity-agent.exe
  config.json
  iniciar-agente.vbs   (lanzador sin ventana, ver "Inicio automatico")
```

## Generar el .exe

Desde la maquina de desarrollo:

```bash
cd apps/agent
npm run build
npm run package
```

Esto genera `trinity-agent.exe` (con `pkg`). Copiarlo a la PC destino.

## config.json

```json
{
  "port": 8765,
  "thermalEnabled": true,
  "thermalPrinterName": "POS-80"
}
```

### Campos (estos son los UNICOS que soporta el agente v1.1.0)

| Campo | Requerido | Descripcion |
|---|---|---|
| `port` | Si | Puerto del servidor local (siempre 8765) |
| `thermalEnabled` | Si | true para activar impresion |
| `thermalPrinterName` | Si | Nombre EXACTO de la impresora en Windows (ver abajo) |

> NOTA: versiones viejas de este manual mencionaban `comandaPrinterName` y `debugEscPos`.
> Esos campos NO existen en el codigo actual y se ignoran. No los uses.

### Como obtener el nombre exacto de la impresora

En la PC destino, abrir PowerShell y ejecutar:

```powershell
Get-Printer | Select-Object Name
```

Copiar el nombre exacto (ejemplo: `POS-80`, `EPSON TM-T20III`) y pegarlo en
`thermalPrinterName`. Para una impresora compartida de red usar el nombre UNC,
ej: `\\PC-CAJA\TicketCocina`.

## Inicio automatico SIN ventana de consola

El `.exe` es una app de consola: si se abre directo, deja una ventana negra (cmd) abierta
que, si se cierra, apaga el agente. Para arrancarlo **oculto** y que el usuario no vea nada:

1. Crear un archivo `iniciar-agente.vbs` en `C:\Trinity\` con este contenido:

```vbs
CreateObject("WScript.Shell").Run """C:\Trinity\trinity-agent.exe""", 0, False
```

   (el `0` = ventana oculta)

2. Poner el lanzador en el arranque de Windows:
   - `Win + R` -> escribir `shell:startup` -> Enter
   - Crear ahi un acceso directo de **`iniciar-agente.vbs`** (NO del .exe directo)

Al encender la PC, el agente arranca solo, en segundo plano y sin ventanas.

> Alternativa mas robusta (opcional): correr el agente como servicio Windows con NSSM
> (revive solo si se cae y sobrevive al cierre de sesion). Requiere instalar NSSM.

## Verificar que esta corriendo

Desde cualquier navegador en la misma PC:

```
http://localhost:8765/health
```

Debe responder algo como:

```json
{
  "status": "ok",
  "version": "1.1.1",
  "thermalEnabled": true,
  "printerName": "POS-80"
}
```

> El `config.json` va junto al .exe (lo lee desde la carpeta del ejecutable).
> Se puede editar con el Bloc de notas; tolera que se guarde como UTF-8 con BOM.

## Troubleshooting

**El agente no arranca:**
- Verificar que `config.json` existe junto al .exe
- Verificar que el JSON es valido (sin comas extra, comillas correctas)

**Imprime pero sin formato (texto plano):**
- Verificar que la impresora soporta ESC/POS (la mayoria de termicas POS lo soportan).
  Si el destino es "Microsoft Print to PDF" u otra no-termica, el ESC/POS RAW falla.

**No imprime nada:**
- Verificar nombre de impresora con `Get-Printer` en PowerShell
- Verificar que la impresora esta encendida y conectada
- Revisar la consola del agente (lanzarlo temporalmente con doble clic para ver logs)

**La web no detecta el agente:**
- Verificar que el agente esta corriendo (`http://localhost:8765/health`)
- El navegador debe estar en la MISMA PC que el agente
- Con HTTPS (eltrebol.app) funciona igual: el fetch va a `http://localhost`, que es
  excepcion de mixed-content, y el CORS del agente ya permite eltrebol.app

**No salen comandas en un despacho:**
- En esa PC: Configuracion -> "Area de Impresion de esta PC" debe tener la zona correcta
  (aparece el indicador verde "Comandas: <zona>" abajo a la derecha)
- Debe haber un usuario logueado con la app abierta (el monitor solo corre dentro de la app)
- Las categorias de los productos deben tener su area asignada (el enrutado es por categoria)

## Actualizaciones

El formato del ticket/comanda lo controla la WEB mediante tags markup
(`{{BOLD}}`, `{{CENTER}}`, `{{BIG}}`, `{{LINE}}`, `{{CUT}}`, etc.). Para cambiar el layout
solo se actualiza la web en el servidor — el .exe NO cambia. Solo se regenera el .exe si
se agregan nuevos comandos ESC/POS al vocabulario del agente.
