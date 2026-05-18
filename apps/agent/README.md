# Trinity Agent — Guía de instalación

## Requisitos
- Windows 10 o superior
- Google Chrome o Microsoft Edge (para la impresora fiscal via Web Serial)

## Instalación
1. Copia la carpeta TrinityAgent a C:/TrinityAgent/
2. Abre config.json con el Bloc de notas
3. Configura según tu PC:
   - Si tienes impresora térmica: thermalEnabled: true y coloca el nombre exacto en thermalPrinterName
   - Para ver el nombre de tu impresora: Inicio → Dispositivos e impresoras
4. Guarda config.json
5. Ejecuta trinity-agent.exe como Administrador
6. El agente corre en segundo plano en http://localhost:8765

## Impresora fiscal
La comunicación con la impresora fiscal The Factory HKA se hace directamente
desde el navegador usando Web Serial API. No se necesita el archivo Status.txt
ni el programa IntTFHKA.exe. Solo asegúrate de usar Chrome o Edge.

## Verificar que funciona
Abre el navegador y ve a: http://localhost:8765/health
Debes ver una respuesta en JSON con status: "ok"

## Si hay problemas
- Verifica que config.json está bien configurado
- Verifica que la impresora térmica está encendida y conectada
