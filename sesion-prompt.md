Perfecto, ahora entiendo el flujo del SENIAT. No es scraping automático — es abrir la página del SENIAT en un iframe o ventana emergente, el usuario completa el captcha manualmente, y cuando el SENIAT retorna el resultado el sistema extrae los datos automáticamente con el parser que me pasaste.
Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar tres funcionalidades: nuevo rol Auditor, scraping BCV y consulta SENIAT.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Nuevo rol AUDITOR y nombres en español
Actualizar el enum UserRole en Prisma:
prismaenum UserRole {
  ADMIN
  SUPERVISOR
  CASHIER
  SELLER
  WAREHOUSE
  BUYER
  ACCOUNTANT
  AUDITOR
}
Corre migración con nombre add_auditor_role.
En role-permissions.ts agregar:
typescriptAUDITOR: ['dashboard', 'inventory']
En toda la interfaz donde se muestren roles usar estos nombres en español:
typescriptexport const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
  SELLER: 'Vendedor',
  WAREHOUSE: 'Almacenista',
  BUYER: 'Comprador',
  ACCOUNTANT: 'Contador',
  AUDITOR: 'Auditor',
}
Aplicar ROLE_LABELS en:

Tabla de usuarios /settings/users
Modal de crear/editar usuario (selector de rol)
Página de permisos por rol /settings/role-permissions
Badge de rol en el header del sistema
Cualquier otro lugar donde se muestre el rol

PARTE 2 — Scraping BCV
El BCV publica la tasa en https://www.bcv.org.ve/ — el selector CSS del dólar es #dolar strong o similar.
En ExchangeRateModule agregar:

GET /exchange-rate/fetch-bcv — hace scraping de bcv.org.ve:

Usar node-fetch + cheerio (ya instalados en el proyecto de RestaurantOS, verificar si están en Trinity)
Si no están instalados: pnpm add node-fetch cheerio en el paquete de la API
Selector: buscar el valor del dólar en la página
Retorna: { rate: number, source: 'BCV', date: today }
Si falla el scraping retornar error descriptivo
NO guarda automáticamente — solo retorna el valor para que el usuario confirme



En el frontend, en la página de configuración /settings sección de tasa de cambio:

Botón "Obtener del BCV" → llama a GET /exchange-rate/fetch-bcv
Muestra el valor obtenido en un campo editable con mensaje "Tasa obtenida del BCV: Bs X.XX — ¿Confirmar?"
Botón "Confirmar y guardar" → llama a POST /exchange-rate con el valor
Si el scraping falla → mostrar mensaje de error con opción de ingresar manualmente

También agregar el botón "Obtener del BCV" en el banner que aparece cuando no hay tasa del día.
PARTE 3 — Consulta SENIAT
El flujo es: abrir la página del SENIAT en un iframe dentro de un modal → usuario completa el formulario y el captcha → cuando el SENIAT retorna el resultado → extraer los datos automáticamente con un parser.
URL del SENIAT: https://contribuyentes.seniat.gob.ve/getContribuyente/GetInfoContribuyente
Backend — Nuevo endpoint en CustomersModule:

POST /customers/seniat-parse — recibe el HTML de respuesta del SENIAT y extrae los datos:

Body: { html: string }
Parsear usando la misma lógica del código JS proporcionado:

Extraer nombre completo
Extraer tipo de documento (V/E/J/G/C/P) y número
Extraer nombre comercial y nombre fiscal si existen (formato "NOMBRE COMERCIAL (NOMBRE FISCAL)")


Retornar: { documentType, documentNumber, name, commercialName?, fiscalName? }



Frontend — Botón "Consultar SENIAT" en formulario de cliente:
En la página de crear cliente /sales/customers/new y editar /sales/customers/[id], agregar botón "Consultar SENIAT" al lado del campo RIF/documento.
Al hacer clic:

Abrir un modal grande (90% de la pantalla) con un <iframe> que carga la URL del SENIAT
Mostrar instrucciones: "Complete el formulario en el SENIAT y resuelva el captcha. Los datos se importarán automáticamente."
El iframe tiene un MutationObserver o polling cada 500ms que detecta cuando el SENIAT retornó resultados (cuando el contenido del iframe cambia y contiene "VISUALIZAR")
Cuando detecta el resultado → extrae el innerHTML del iframe → llama a POST /customers/seniat-parse con el HTML
Cierra el modal automáticamente
Pre-llena los campos del formulario: documentType, número de documento, nombre
Mostrar toast: "Datos importados del SENIAT correctamente"

Nota importante sobre el iframe:
El SENIAT puede bloquear iframes por headers de seguridad (X-Frame-Options). Si esto ocurre, usar window.open() para abrir en ventana nueva y usar localStorage como canal de comunicación entre la ventana del SENIAT y la aplicación:

La ventana nueva intenta leer el resultado y lo guarda en localStorage('seniat_result')
La app principal hace polling de localStorage cada 500ms esperando el resultado
Cuando aparece el resultado → procesar y limpiar localStorage

Al terminar:

Verificar que el rol AUDITOR aparece en el selector de usuarios con nombre "Auditor"
Verificar que todos los roles muestran nombres en español en toda la interfaz
Verificar que el botón BCV obtiene la tasa y permite confirmarla
Haz commit con el mensaje feat: auditor role, BCV scraping and SENIAT lookup for customers
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md