' Lanza el Trinity Agent en segundo plano, SIN ventana de consola.
'
' Instalacion en la PC del cliente:
'   1. Copiar este archivo junto al .exe en  C:\Trinity\
'   2. Poner un acceso directo de ESTE archivo (no del .exe) en shell:startup
'      (Win+R -> shell:startup)
'
' El "0" = ventana oculta. Si la ruta del .exe cambia, ajustarla abajo.
CreateObject("WScript.Shell").Run """C:\Trinity\trinity-agent.exe""", 0, False
