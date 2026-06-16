# Instalación del agente Trinity (guía para seguir en sitio)

Repetir esto en CADA PC: la caja y cada despacho.
Lo único que cambia por PC es el nombre de la impresora (y, en los despachos, la zona).

---

## Archivos que van en el USB
- `trinity-agent.exe`
- `config.json`
- `iniciar-agente.vbs`

(Los tres deben quedar SIEMPRE juntos en la misma carpeta.)

---

## Paso 1 — Copiar los archivos
1. Conectar el USB.
2. Abrir el disco **C:** y crear una carpeta llamada exactamente **Trinity** → queda `C:\Trinity`.
3. Copiar los 3 archivos del USB dentro de `C:\Trinity`.

## Paso 2 — Poner el nombre de la impresora
4. Menú **Inicio** → escribir **"Impresoras"** → abrir **"Impresoras y escáneres"**.
5. Anotar el nombre EXACTO de la impresora (ejemplo: `POS-80`).
6. En `C:\Trinity`, clic derecho en **config.json** → **Abrir con** → **Bloc de notas**.
7. Reemplazar el texto entre comillas de `thermalPrinterName` por el nombre del paso 5:
   ```
   { "port": 8765, "thermalEnabled": true, "thermalPrinterName": "POS-80" }
   ```
8. Guardar (Archivo → Guardar) y cerrar.

## Paso 3 — Que arranque solo al encender la PC
9. Presionar **tecla Windows + R**.
10. Escribir **shell:startup** y dar **Enter** (se abre la carpeta de Inicio).
11. Dejar esa carpeta abierta y abrir otra ventana en `C:\Trinity`.
12. En `C:\Trinity`, clic derecho en **iniciar-agente.vbs** → **Copiar**.
13. En la carpeta de Inicio, clic derecho en un espacio vacío → **Pegar acceso directo**.
    - Tiene que ser **"Pegar acceso directo"**, NO "Pegar".
    - Se copia el **.vbs**, NUNCA el .exe.

    Si no aparece "Pegar acceso directo": clic derecho → **Nuevo → Acceso directo** →
    escribir `C:\Trinity\iniciar-agente.vbs` → Siguiente → Finalizar.

## Paso 4 — Probar (sin reiniciar)
14. En `C:\Trinity`, doble clic en **iniciar-agente.vbs**.
    (No aparece ninguna ventana: es lo correcto, corre oculto.)
15. Abrir el navegador y entrar a: **http://localhost:8765/health**
16. Debe mostrar algo como:
    ```
    { "status": "ok", "version": "1.1.1", "thermalEnabled": true, "printerName": "POS-80" }
    ```
    Si dice **version 1.1.1** y el nombre de tu impresora → quedó bien. ✅

## Paso 5 — Elegir la zona (SOLO en las PC de despacho, NO en la caja)
17. Entrar a la app de Trinity con el usuario administrador.
18. Ir a **Configuración → "Área de Impresión de esta PC"** y elegir la zona de ese
    despacho (ejemplo: Despacho Interno).
19. Abajo a la derecha debe aparecer el indicador verde **"Comandas: Despacho Interno"**.
20. Cerrar sesión y dejar logueado al usuario de despacho con la app abierta.

---

## Si algo no funciona
- **El /health no abre o no responde:** el agente no arrancó. Verificar que los 3 archivos
  están juntos en `C:\Trinity` y volver a dar doble clic al `iniciar-agente.vbs`.
- **Dice version 1.1.0 (no 1.1.1):** es el .exe viejo. Reemplazarlo por el del USB nuevo.
- **No imprime:** el nombre en `config.json` debe ser idéntico al de "Impresoras y escáneres",
  y la impresora encendida/conectada.
- **No salen comandas en un despacho:** revisar el indicador verde del Paso 19, que haya un
  usuario logueado con la app abierta, y que las categorías de los productos tengan su área.

---

## Importante
- No mover la carpeta `C:\Trinity` después de instalar (el acceso directo del arranque
  quedaría apuntando a la ruta vieja). Si se mueve, rehacer el Paso 3.
- Al reiniciar la PC, el agente arranca solo y sin ventanas.
