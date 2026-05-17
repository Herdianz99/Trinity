# Trinity Agent — Guía de instalación

## Requisitos
- Windows 10 o superior
- La máquina fiscal The Factory debe estar instalada y funcionando

## Instalación
1. Copia la carpeta TrinityAgent a C:/TrinityAgent/
2. Abre config.json con el Bloc de notas
3. Configura según tu PC:
   - Si tienes máquina fiscal: fiscalEnabled: true
   - Si no tienes máquina fiscal: fiscalEnabled: false
   - Si tienes impresora térmica: thermalEnabled: true y coloca el nombre exacto en thermalPrinterName
   - Para ver el nombre de tu impresora: Inicio → Dispositivos e impresoras
4. Guarda config.json
5. Ejecuta trinity-agent.exe como Administrador
6. El agente corre en segundo plano en http://localhost:8765

## Verificar que funciona
Abre el navegador y ve a: http://localhost:8765/health
Debes ver una respuesta en JSON con status: "ok"

## Si hay problemas
- Verifica que config.json está bien configurado
- Verifica que la impresora está encendida
- Verifica que C:/IntTFHKA/Status.txt existe (solo si tienes máquina fiscal)
