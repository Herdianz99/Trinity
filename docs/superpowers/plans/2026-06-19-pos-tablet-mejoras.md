# Mejoras del POS en móvil/tablet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (o subagent-driven-development) para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Resolver 4 fricciones del POS en tablet/móvil: (1) "Guardar pre-factura" debe volver a la vista de búsqueda; (2) permitir cantidades decimales editables (0.25, 0.50) en móvil **y** escritorio; (3) botón "+" verde para crear cliente al lado del buscador (no tapado por el teclado); (4) una "tira de agregados" fija y colapsable en la vista de búsqueda para ver/ajustar cantidades sin cambiar de pantalla.

**Architecture:** Todo es frontend en un solo archivo grande (`apps/web/src/app/(dashboard)/sales/pos/page.tsx`, ~2590 líneas). Se introduce un componente compartido `QtyInput` (a nivel de módulo, en el mismo archivo) que usan los dos inputs de cantidad (móvil y escritorio) y la nueva tira. El resto son cambios localizados de JSX y un `setMobileView`.

**Tech Stack:** Next.js 14 (App Router, React client component), Tailwind, lucide-react.

**Regla transversal — cantidades nunca 0 ni negativas:** `setQuantity` y `updateQuantity` ya hacen `Math.max(0.01, round2(...))` (líneas ~519 y ~527), así que el piso ya está garantizado. `QtyInput` además **revierte** al último valor válido si el campo queda vacío/0/inválido, y el envío (`handleSaveInvoice`) opera sobre `cart` cuyas cantidades ya están saneadas. No hace falta tocar el backend.

> **Nota TDD:** el proyecto no tiene tests automatizados de UI. La verificación es manual: levantar el web local y probar en un viewport angosto (<768px, simula la tablet 8" vertical) con Chrome DevTools (modo dispositivo).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `apps/web/src/app/(dashboard)/sales/pos/page.tsx` | POS completo (búsqueda, carrito, modales, vistas móvil/escritorio) | Modificar: +componente `QtyInput`, reemplazar 2 inputs de cantidad, `setMobileView('search')` al guardar, botón "+" cliente, tira de agregados, imports de íconos |

Todo ocurre en ese único archivo. No hay cambios de backend ni de otros archivos.

---

## Task 1: Componente `QtyInput` y reemplazo de los dos inputs de cantidad (punto 2)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — agregar `QtyInput` a nivel de módulo; reemplazar el input de cantidad móvil (~1399-1413) y el de escritorio (~2407-2421).

- [ ] **Step 1: Verificar imports de React**

`useState` y `useEffect` ya están importados en la línea 3 (`import { useState, useEffect, useCallback } from 'react';`). No hace falta cambiar imports de React.

- [ ] **Step 2: Agregar el componente `QtyInput` a nivel de módulo**

Insertar este componente **antes** de `export default function` del POS (por ejemplo justo después de los `interface`/imports superiores, a nivel de módulo, no dentro del componente de página):

```tsx
// Input de cantidad que permite borrar, escribir decimales (0.25) y el punto en móvil.
// Mantiene el texto crudo mientras se edita y confirma al salir; revierte si queda invalido/0.
function QtyInput({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (qty: number) => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera (botones +/-), refrescar el texto cuando no se esta editando.
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // permitir solo digitos y un punto
        let v = e.target.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        setText(v);
      }}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(text);
        if (!isNaN(n) && n > 0) onCommit(n);
        else setText(String(value)); // revertir: nunca queda en vacio/0/negativo
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
```

- [ ] **Step 3: Reemplazar el input de cantidad de la vista MÓVIL**

Buscar (en el carrito móvil, ~1399-1413):

```tsx
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v > 0) setQuantity(item.productId, v);
                        }}
                        onBlur={e => {
                          const v = parseFloat(e.target.value);
                          if (isNaN(v) || v <= 0) setQuantity(item.productId, 1);
                        }}
                        className="w-14 text-center text-sm font-semibold text-white bg-slate-700/60 border border-slate-600 rounded-lg px-1 py-1 focus:outline-none focus:border-green-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        step="0.01"
                        min="0.01"
                      />
```

y reemplazar por:

```tsx
                      <QtyInput
                        value={item.quantity}
                        onCommit={(q) => setQuantity(item.productId, q)}
                        className="w-14 text-center text-sm font-semibold text-white bg-slate-700/60 border border-slate-600 rounded-lg px-1 py-1 focus:outline-none focus:border-green-500/50"
                      />
```

- [ ] **Step 4: Reemplazar el input de cantidad de la vista ESCRITORIO**

Buscar (en el carrito de escritorio, ~2407-2421):

```tsx
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setQuantity(item.productId, v);
                    }}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (isNaN(v) || v <= 0) setQuantity(item.productId, 1);
                    }}
                    className="w-14 text-center text-sm text-white font-medium bg-slate-800 border border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:border-green-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    step="0.01"
                    min="0.01"
                  />
```

y reemplazar por:

```tsx
                  <QtyInput
                    value={item.quantity}
                    onCommit={(q) => setQuantity(item.productId, q)}
                    className="w-14 text-center text-sm text-white font-medium bg-slate-800 border border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:border-green-500/50"
                  />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @trinity/web exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sales/pos" | head`
Expected: sin líneas (sin errores en el POS).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 62 - POS: input de cantidad decimal editable (movil y escritorio)"
```

---

## Task 2: "Guardar pre-factura" vuelve a la vista de búsqueda (punto 1)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — `handleSaveInvoice` (~686-692).

- [ ] **Step 1: Resetear la vista a 'search' tras guardar con éxito**

Buscar (dentro de `handleSaveInvoice`, en el bloque de éxito):

```tsx
      const data = await res.json();
      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setExistingInvoiceId(null);
      setMessage({ type: 'success', text: 'Factura guardada en espera' });
      fetchPending();
```

y reemplazar por (agregando `setMobileView('search')`):

```tsx
      const data = await res.json();
      setCart([]);
      setCustomerId(null);
      setCustomerName('');
      setExistingInvoiceId(null);
      setMobileView('search'); // volver a la pantalla de busqueda para la siguiente factura
      setMessage({ type: 'success', text: 'Factura guardada en espera' });
      fetchPending();
```

> El `setMobileView('search')` no afecta la vista de escritorio (donde `mobileView` no se usa para el layout). El vendedor (`selectedSellerId`) se conserva a propósito para la siguiente factura.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @trinity/web exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sales/pos" | head`
Expected: sin líneas.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 62 - POS: guardar pre-factura vuelve a la busqueda en movil"
```

---

## Task 3: Botón "+" verde para crear cliente al lado del buscador (punto 3)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — modal de cliente móvil, campo de búsqueda (~1957-1969).

- [ ] **Step 1: Agregar el botón "+" junto al input de búsqueda de cliente**

Buscar:

```tsx
          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Buscar por nombre, RIF..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="input-field pl-9 !py-3 text-base w-full"
                autoFocus
              />
            </div>
          </div>
```

y reemplazar por (input + botón "+" verde en una fila):

```tsx
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, RIF..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="input-field pl-9 !py-3 text-base w-full"
                  autoFocus
                />
              </div>
              <button
                onClick={() => {
                  setShowCustomerSearch(false);
                  setCustomerSearch('');
                  setClientForm({ documentType: 'V', rif: '', name: '', address: '', phone: '' });
                  setShowCreateClient(true);
                }}
                title="Crear nuevo cliente"
                className="shrink-0 w-12 h-12 rounded-xl bg-green-500 text-white flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-green-500/20"
              >
                <Plus size={22} />
              </button>
            </div>
          </div>
```

> Se conserva el botón inferior "+ Crear nuevo cliente" (no estorba; sigue visible cuando el teclado está cerrado). El nuevo "+" arriba queda siempre accesible por encima del teclado. Reusa exactamente el mismo flujo (`setShowCreateClient(true)`).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @trinity/web exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sales/pos" | head`
Expected: sin líneas.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 62 - POS: boton + para crear cliente junto al buscador (movil)"
```

---

## Task 4: Tira de agregados fija y colapsable en la búsqueda móvil (punto 4)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — estado nuevo, imports de íconos, padding del contenedor de resultados (~1292), y reemplazo del botón flotante de carrito (~1468-1477) por la tira.

- [ ] **Step 1: Agregar imports de íconos `ChevronUp` / `ChevronDown`**

En el import de `lucide-react` del POS, agregar `ChevronUp` y `ChevronDown` si no están. Verificar primero:

Run: `grep -n "ChevronUp\|ChevronDown" "apps/web/src/app/(dashboard)/sales/pos/page.tsx" | head`

Si no aparecen en el bloque de import, agregarlos a la lista de íconos importados de `'lucide-react'` (junto a `ShoppingCart`, `Plus`, `Minus`, etc.).

- [ ] **Step 2: Agregar estado de colapso de la tira**

Junto a la línea `const [mobileView, setMobileView] = useState<'search' | 'cart'>('search');` (~168), agregar:

```tsx
  const [cartStripCollapsed, setCartStripCollapsed] = useState(false);
```

- [ ] **Step 3: Dar padding inferior a los resultados para que la tira no tape el último ítem**

Buscar (contenedor de resultados de la vista de búsqueda móvil, ~1291-1292):

```tsx
          {/* Product results grid */}
          <div className="flex-1 overflow-y-auto">
```

y reemplazar por (padding inferior cuando hay carrito, para no quedar tapado por la tira):

```tsx
          {/* Product results grid */}
          <div className={`flex-1 overflow-y-auto ${cart.length > 0 ? 'pb-64' : ''}`}>
```

- [ ] **Step 4: Reemplazar el botón flotante de carrito por la tira de agregados**

Buscar (~1468-1477):

```tsx
      {/* Floating cart badge (search view only) */}
      {mobileView === 'search' && cart.length > 0 && (
        <button
          onClick={() => setMobileView('cart')}
          className="fixed bottom-[72px] left-4 right-4 py-3.5 rounded-xl bg-green-500 text-white font-bold text-base flex items-center justify-center gap-2 z-30 shadow-lg shadow-green-500/20 active:scale-[0.98] transition-transform"
        >
          <ShoppingCart size={18} />
          Ver carrito ({cart.reduce((s, i) => s + i.quantity, 0)} items) — ${totalUsd.toFixed(2)}
        </button>
      )}
```

y reemplazar por la tira (cabecera colapsable + lista con `QtyInput` + botón "Ir a cobrar"):

```tsx
      {/* Tira de agregados (solo en la vista de busqueda) */}
      {mobileView === 'search' && cart.length > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50">
          {/* Cabecera / toggle */}
          <button
            onClick={() => setCartStripCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-4 py-2"
          >
            <span className="text-xs font-semibold text-slate-300">En esta factura ({cart.length})</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              ${totalUsd.toFixed(2)}
              {cartStripCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {/* Lista de items (expandida) */}
          {!cartStripCollapsed && (
            <div className="max-h-44 overflow-y-auto px-3 pb-2 space-y-1.5">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/40 rounded-lg px-2 py-1.5">
                  <span className="flex-1 min-w-0 text-xs text-white truncate" title={item.name}>{item.name}</span>
                  <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 rounded-md bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                    <Minus size={12} />
                  </button>
                  <QtyInput
                    value={item.quantity}
                    onCommit={(q) => setQuantity(item.productId, q)}
                    className="w-12 text-center text-xs font-semibold text-white bg-slate-700/60 border border-slate-600 rounded-md px-1 py-1 focus:outline-none focus:border-green-500/50"
                  />
                  <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 rounded-md bg-slate-700/60 border border-slate-600 flex items-center justify-center text-white active:scale-90">
                    <Plus size={12} />
                  </button>
                  <span className="w-14 text-right text-xs font-bold text-green-400">
                    ${(item.unitPrice * item.quantity * (1 - (item.discountPct || 0) / 100)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Ir a cobrar */}
          <div className="px-3 pb-2">
            <button
              onClick={() => setMobileView('cart')}
              className="w-full py-2.5 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <ShoppingCart size={16} /> Ir a cobrar — ${totalUsd.toFixed(2)}
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @trinity/web exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sales/pos" | head`
Expected: sin líneas.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: Session 62 - POS: tira de agregados colapsable en la busqueda (movil/tablet)"
```

---

## Task 5: Verificación local (viewport de tablet) y cierre

**Files:** ninguno (verificación manual). El deploy lo hace el usuario.

- [ ] **Step 1: Levantar el web local**

Run: `npx kill-port 3000 ; pnpm --filter @trinity/web dev` (en background).
Abrir `http://localhost:3000`, login `admin@trinity.com` / `Admin1234!`, ir al POS y abrir una caja.

- [ ] **Step 2: Simular tablet 8" vertical**

En Chrome DevTools → modo dispositivo (Toggle device toolbar) → ancho ~600–760px (menor a 768 para activar la vista móvil/tablet del POS).

- [ ] **Step 3: Verificar punto 2 (cantidad decimal)**

En el carrito: borrar la cantidad por completo y escribir `0.25`. Debe aceptarse el punto y el valor decimal; al salir del campo, si quedó vacío debe volver al valor anterior (nunca 0). Repetir en la vista de escritorio (ancho >1024).

- [ ] **Step 4: Verificar punto 4 (tira) + cantidad al agregar**

Buscar y tocar 2-3 productos → aparecen en la **tira inferior**; ajustar sus cantidades ahí mismo (incluye decimales). Colapsar/expandir con el chevron. "Ir a cobrar" lleva al carrito. Confirmar que el último resultado de búsqueda no queda tapado por la tira.

- [ ] **Step 5: Verificar punto 1 (guardar pre-factura)**

Con artículos en el carrito, ir al carrito y "Guardar pre-factura" → debe **volver a la vista de búsqueda** vacía, listo para la siguiente factura.

- [ ] **Step 6: Verificar punto 3 (botón "+" cliente)**

Abrir "Seleccionar cliente" → el botón verde "+" aparece **al lado del buscador** y abre el formulario de nuevo cliente, sin depender del botón inferior tapado por el teclado.

- [ ] **Step 7: Actualizar PROGRESS.md y avisar para deploy**

Agregar una entrada de Sesión 62 (mejoras POS tablet) en `PROGRESS.md` bajo "Pendiente de DEPLOY". El deploy lo ejecuta el usuario:
```bash
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```

---

## Self-Review

- **Cobertura:** punto 1 → Task 2; punto 2 (móvil+escritorio) → Task 1; punto 3 → Task 3; punto 4 → Task 4. Validación cantidades 0/negativo → `setQuantity`/`updateQuantity` ya clampean a 0.01 + `QtyInput` revierte si queda inválido (Task 1). ✅
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `QtyInput` usa `value: number` / `onCommit: (qty:number)=>void`; ambos reemplazos y la tira lo invocan con `value={item.quantity}` y `onCommit={(q)=>setQuantity(item.productId, q)}`. `cartStripCollapsed` se declara en Task 4 Step 2 y se usa en Step 3/4. Íconos `ChevronUp/ChevronDown` se importan en Task 4 Step 1. ✅
- **Riesgo a vigilar:** posición de la tira (`bottom-14`) respecto a la barra inferior de navegación — verificar visualmente en el Step 4 que no se solapen; si hace falta, ajustar el `bottom-*` y el `pb-64` del contenedor de resultados.
