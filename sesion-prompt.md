Lee el PROJECT.md actualizado. Hay cambios importantes en cómo se maneja la tasa de cambio que deben aplicarse antes de continuar.
Migración:

Crea migración add_exchange_rate_table
Agrega modelo ExchangeRate al schema según el PROJECT.md
Elimina campos exchangeRate y exchangeRateUpdatedAt de CompanyConfig

Backend:

Crea ExchangeRateModule con:

GET /exchange-rate/today — retorna la tasa del día actual o null si no existe
GET /exchange-rate?from&to — historial de tasas por rango de fechas
POST /exchange-rate — registrar tasa del día (solo ADMIN), con source BCV o MANUAL
GET /exchange-rate/by-date?date= — obtener tasa de una fecha específica (para compras con fecha pasada)
Scraping de bcv.org.ve igual que RestaurantOS: selector #dolar con cheerio y node-fetch



Frontend:

En el layout principal del ERP, al cargar verificar si existe tasa para hoy
Si no existe → mostrar banner amarillo prominente en la parte superior: "⚠️ No hay tasa BCV registrada para hoy. Sin tasa no se puede facturar." con botón "Registrar tasa" que abre un modal con campo de monto y botón "Obtener del BCV"
El modal muestra la última tasa registrada como referencia
En /settings agregar sección "Tasas de cambio" con historial y opción de registrar manualmente

Verificar que PurchaseOrders ya funcione con la nueva estructura:

Al crear/editar una orden de compra, si la fecha es hoy → usar tasa del día
Si la fecha es pasada → llamar a GET /exchange-rate/by-date?date= y usar esa tasa
Si no hay tasa para esa fecha → mostrar aviso en el formulario

Haz commit con el mensaje feat: Session 4b - exchange rate table with BCV scraping and daily validation
Haz push a GitHub y actualiza el PROGRESS.md