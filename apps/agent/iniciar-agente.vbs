' Lanza el Trinity Agent en segundo plano, SIN ventana de consola.
'
' Ejecuta el trinity-agent.exe que este en la MISMA carpeta que este .vbs,
' asi funciona sin importar donde quede la carpeta (C:\Trinity u otra).
'
' Instalacion en la PC del cliente:
'   1. Copiar este .vbs junto al .exe y al config.json (ej. en C:\Trinity\)
'   2. Poner un acceso directo de ESTE .vbs (no del .exe) en shell:startup
'      (Win+R -> shell:startup)

Dim fso, shell, carpeta, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
exe = fso.BuildPath(carpeta, "trinity-agent.exe")
shell.CurrentDirectory = carpeta
shell.Run """" & exe & """", 0, False
