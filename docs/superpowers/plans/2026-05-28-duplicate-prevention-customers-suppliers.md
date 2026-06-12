# Plan: Validacion de duplicados en Clientes/Proveedores + Filtro isActive en POS

## Problema

1. **Sin prevencion de duplicados**: Se pueden crear multiples clientes/proveedores con el mismo numero de documento (RIF/cedula). Ya existen 2 clientes con cedula `27860712`.
2. **POS muestra clientes inactivos**: La busqueda del POS no filtra por `isActive`, asi que los clientes desactivados siguen apareciendo al buscar.
3. **Proveedores tampoco tienen validacion**: El mismo problema aplica a proveedores.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/customers/customers.service.ts` | Validar RIF unico en `create()` y `update()` |
| `apps/api/src/modules/suppliers/suppliers.service.ts` | Validar RIF unico en `create()` y `update()` |
| `apps/web/src/app/(dashboard)/sales/pos/page.tsx` | Agregar `isActive=true` al search de clientes |
| `apps/web/src/app/(dashboard)/sales/customers/new/page.tsx` | Mostrar advertencia si el RIF ya existe (UX) |
| `apps/web/src/app/(dashboard)/catalog/suppliers/new/page.tsx` | Mostrar advertencia si el RIF ya existe (UX) |
| `apps/web/src/app/(dashboard)/sales/customers/[id]/page.tsx` | Mostrar advertencia si el RIF ya existe al editar (UX) |

## Pasos de implementacion

### Paso 1: Backend — Validacion de duplicados en Clientes

**Archivo:** `apps/api/src/modules/customers/customers.service.ts`

En `create()` (linea 131):
- Antes de crear, si `dto.rif` tiene valor, buscar otro Customer con el mismo `rif` y `documentType` que este activo (`isActive: true`)
- Si existe, lanzar `BadRequestException('Ya existe un cliente con este documento: {nombre del existente}')`
- Normalizar el RIF (quitar guiones, espacios) antes de comparar

En `update()` (linea 135):
- Si `dto.rif` tiene valor, buscar otro Customer (con `id != currentId`) con mismo `rif` y `documentType` activo
- Si existe, lanzar `BadRequestException`

### Paso 2: Backend — Validacion de duplicados en Proveedores

**Archivo:** `apps/api/src/modules/suppliers/suppliers.service.ts`

Misma logica que clientes:
- En `create()`: verificar que no exista otro proveedor activo con el mismo RIF
- En `update()`: verificar excluyendo el proveedor actual

### Paso 3: POS — Filtrar clientes inactivos

**Archivo:** `apps/web/src/app/(dashboard)/sales/pos/page.tsx` (linea 368)

Cambiar:
```
/api/proxy/customers?search=${encodeURIComponent(customerSearch)}&limit=5
```
A:
```
/api/proxy/customers?search=${encodeURIComponent(customerSearch)}&limit=5&isActive=true
```

Esto usa el filtro `isActive` que ya existe en `customers.service.ts:68-70`.

### Paso 4: Frontend — Advertencia en formulario de nuevo cliente

**Archivo:** `apps/web/src/app/(dashboard)/sales/customers/new/page.tsx`

- Agregar un debounce que al cambiar el campo RIF (con al menos 5 digitos), haga una busqueda al API: `/api/proxy/customers?search={rif}&limit=1`
- Si encuentra un cliente con el mismo RIF, mostrar un warning amarillo: "Ya existe un cliente con este documento: {nombre}"
- Esto es solo informativo en frontend; la proteccion real esta en el backend

### Paso 5: Frontend — Advertencia en formulario de nuevo proveedor

**Archivo:** `apps/web/src/app/(dashboard)/catalog/suppliers/new/page.tsx`

- Misma logica de advertencia con debounce al escribir el RIF

### Paso 6: Frontend — Advertencia en edicion de cliente

**Archivo:** `apps/web/src/app/(dashboard)/sales/customers/[id]/page.tsx`

- Al editar RIF, verificar si otro cliente ya tiene ese documento (excluyendo el actual)

## Notas de diseno

- **Normalizacion de RIF**: Se quitaran guiones y espacios para comparar (`27860712` == `27-860-712`). La combinacion `documentType + rif_normalizado` es la clave de unicidad.
- **Solo activos**: La validacion compara contra clientes/proveedores activos (`isActive: true`). Si uno esta desactivado, se permite reusar su documento (el desactivado es basicamente un registro muerto).
- **No se agrega constraint unico en BD**: Dado que ya existen duplicados y el campo es opcional/nullable, un `@@unique` en Prisma causaria problemas con los datos existentes y con registros sin RIF. La validacion a nivel de servicio es suficiente.
- **Datos duplicados existentes**: El usuario debera fusionar/limpiar manualmente los 2 registros con cedula `27860712` desde la interfaz (desactivar uno y mantener el otro).
