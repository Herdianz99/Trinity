# Checklist de pruebas — Retenciones de IVA en ventas + Auditoría de libros

> Entorno local: Web http://localhost:3000 · API http://localhost:4000
> Login: admin@trinity.com / Admin1234! (o cajera1@trinity.com / Cajera1234!)
> Caja con sesión abierta: **Fiscal 2** · Tasa de hoy cargada · Series fiscales: VF, VTA

---

## PARTE 1 — Probar lo nuevo (módulo de retenciones de clientes)

### A. Toggle "Contribuyente especial" en el POS
- [ ] Ir a POS, seleccionar un cliente (NO el cliente por defecto)
- [ ] Aparece el chip "Contribuyente?" junto al nombre → al hacer click queda morado "✓ Contribuyente especial"
- [ ] Recargar la página y volver a seleccionar el mismo cliente → el chip sigue activado (se guardó en la BD)
- [ ] Seleccionar el cliente POR DEFECTO de la factura → el chip NO debe aparecer

### B. Caso crédito (cliente conocido) — el flujo principal
- [ ] Con el cliente marcado como especial, hacer una factura **a crédito** por una caja con serie fiscal y productos con IVA
- [ ] Ir a **Ventas → Retenciones clientes**: debe aparecer la retención auto-creada (RVC-xxxx), 75% del IVA, estado "Pendiente comprobante", con días = 0
- [ ] Ir a **CxC → Recibos de cobro → Nuevo**, seleccionar ese cliente: deben aparecer la factura (CxC, verde +) y la retención (morada, −)
- [ ] Cruzar ambas → el total a cobrar debe ser la factura MENOS la retención
- [ ] Procesar el cobro por el neto → la CxC queda pagada y la retención desaparece de pendientes de cruzar
- [ ] En "Retenciones clientes" la retención ahora está "Cobrada — exigir comprobante"

### C. Registrar el comprobante (días después)
- [ ] En "Retenciones clientes", botón verde "Registrar comprobante" sobre una retención sin comprobante
- [ ] Probar número de MENOS de 14 dígitos → debe rechazar
- [ ] Poner 14 dígitos (ej: 20260600000001) + fecha + monto → registra OK y pasa a "Con comprobante"
- [ ] Ir a **Fiscal → Libro de ventas**: la línea de retención debe aparecer (morada) con el número de comprobante en "Comp. de Retención" y el monto en "IVA Retenido", en el período de la FECHA DEL COMPROBANTE

### D. Caso reintegro (cliente pagó la factura completa)
- [ ] Hacer una factura fiscal **de contado** con IVA, cobrarla completa
- [ ] En "Retenciones clientes" → botón "Nueva retención (reintegro)"
- [ ] Buscar la factura por número → seleccionarla (muestra cliente, total e IVA)
- [ ] Poner % 75, monto, y el número + fecha del comprobante → crear
- [ ] Verificar que aparece directo en "Con comprobante" y la línea ya está en el libro de ventas
- [ ] Ir a **Recibos de cobro → Nuevo**, seleccionar el cliente → cruzar SOLO la retención (−)
- [ ] El total debe quedar NEGATIVO, con la nota "salida de dinero (reintegro al cliente)"
- [ ] Procesar con una sesión de caja seleccionada → confirmar que en **Caja → Sesiones** (la sesión usada) aparece un egreso "Reintegro recibo RCB-xxxx"

### E. Validaciones y casos límite
- [ ] Intentar crear retención (reintegro) sobre una factura de serie NO fiscal → debe rechazar
- [ ] Al registrar comprobante, poner un monto que se desvíe MÁS de 1 Bs del cálculo teórico → debe rechazar (tolerancia ±1 Bs)
- [ ] Anular una retención NO aplicada (botón rojo) → desaparece de activas; si tenía línea en el libro, se borra
- [ ] Intentar anular una retención YA aplicada en un recibo → debe rechazar (pedir anular el recibo primero)

### F. Alerta de comprobantes pendientes
- [ ] En "Retenciones clientes", tab "Pendientes de comprobante" → banner ámbar con el contador
- [ ] Una retención con más de 7 días sin comprobante → la columna "Días" en ROJO

### G. Totales del libro de ventas (que la retención NO los infle)
- [ ] En el libro de ventas, anotar el total de "IVA / Débito fiscal" del período
- [ ] Confirmar que ese total NO incluye el monto de las líneas de retención (la fila se ve, pero no suma al débito fiscal)

### H. Fix de fechas en reporte Z (recién corregido)
- [ ] En el libro de ventas (vista reportes Z), imprimir/exportar el reporte
- [ ] Una línea con fecha 02/06/2026 debe salir como 02/06/2026 (antes salía 01/06/2026)

---

## PARTE 2 — Verificar hallazgos de auditoría (marcar CONFIRMADO / NO APLICA)

> El objetivo es ver si estos "faltantes" de verdad afectan cómo trabajan. Probar y decidir.

### 🔴 Alta prioridad
- [ ] **NCC/NDC de compras y el libro de compras**: hacer una nota de crédito de compra (NCC) sobre una factura de compra ya en el libro. Luego ir a **Fiscal → Libro de compras** y revisar si el crédito fiscal del período BAJÓ por esa nota. → Si NO baja = CONFIRMADO el gap.
- [ ] **NCV/NDV de forma libre**: ¿usan alguna serie fiscal que NO sea de máquina fiscal (forma libre)? Si SÍ, emitir una NCV sobre una de esas facturas y ver si aparece como línea en el libro de ventas. Si TODO sale por máquina fiscal → NO APLICA.
- [ ] **Facturas anuladas en el libro**: anular o devolver una factura fiscal y revisar si en el libro de ventas queda registro (marca "ANULADA" o monto 0) o si simplemente desaparece/queda igual.

### 🟡 Media prioridad
- [ ] **Alícuotas distintas a 16%**: ¿venden o compran algo a 8% (reducida) o 16%+15% (lujo)? Si solo manejan 16% + exentos → NO APLICA por ahora. Si manejan otras, ver cómo las muestra el libro (hoy las mezcla en una sola base "16%").
- [ ] **TXT de retenciones para el portal SENIAT**: ¿la empresa es contribuyente especial y debe subir el TXT quincenal de retenciones al portal? Si sí, confirmar que hoy no se genera (habría que construirlo).

### 🟢 Baja prioridad
- [ ] **Importaciones**: ¿hacen compras de importación directa (con DUA/planilla de aduana)? Si no → NO APLICA.
- [ ] **Compras sin derecho a crédito fiscal**: ¿reciben facturas que no dan derecho a crédito y deben ir en columna aparte de las exentas?
- [ ] **ISLR en el libro de compras**: ¿necesitan poder ocultar las líneas de ISLR al imprimir el libro "legal" de IVA para una fiscalización?

---

## Notas
- Para detener el sistema al terminar: liberar puertos con `npx kill-port 4000 3000`
- Anotar junto a cada hallazgo de la Parte 2: **[CONFIRMADO]** o **[NO APLICA]** + cualquier detalle
- Lo que quede CONFIRMADO se programa después con su propio plan
