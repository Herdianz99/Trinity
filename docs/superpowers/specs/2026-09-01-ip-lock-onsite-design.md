# IP-lock por usuario ("acceso solo en sitio") — Diseño

Fecha: 2026-09-01
Estado: propuesto por Diego para implementación (pendiente su revisión del spec).
Origen: PROPUESTA en PROGRESS.md (candado 1 de 2). El candado 2 (bloquear exportación masiva a Excel/PDF) es un plan aparte.

## Propósito

Restringir a **ciertos usuarios (opt-in)** a poder **entrar y operar solo desde la(s) IP(s) públicas del local** (WiFi del negocio). Mitiga la fuga de precios/stock por acceso remoto de un empleado. **Inerte por defecto:** desplegar sin configurar nada NO afecta a nadie.

## Garantía de seguridad (regla fail-safe)

El sistema **bloquea SOLO si se cumplen las 3 condiciones a la vez**:
1. El usuario tiene `restrictToOnSiteIp === true` (opt-in, default `false`), **y**
2. Hay al menos una IP/CIDR válida configurada en `CompanyConfig.allowedIps`, **y**
3. La IP real del request **no** está en esa lista.

Si falta cualquiera → **deja pasar**. Además: **el rol ADMIN nunca se bloquea** (exención dura, para no auto-encerrar al dueño/soporte). Esto cubre el caso "config a medias" (flag prendido pero sin IPs cargadas → no bloquea).

## IP real del cliente (trust proxy)

Hoy `main.ts` NO tiene `trust proxy`, así que `req.ip` daría la IP de nginx (127.0.0.1). nginx **sí** manda `X-Forwarded-For` (`deploy/nginx.conf`). Fix: `app.set('trust proxy', N)` con **N configurable** por env `TRUST_PROXY_HOPS` (default `1` = solo nginx). Si algún server queda detrás de Cloudflare u otra capa, se sube N sin recompilar. Se normaliza IPv4-mapped-IPv6 (`::ffff:a.b.c.d` → `a.b.c.d`).

**Seguridad:** usar `1` (un salto = nginx), NO `true`, para que un cliente no pueda falsificar `X-Forwarded-For`.

## Modelo de datos (2 campos, aditivo)

- `User.restrictToOnSiteIp Boolean @default(false)` — flag opt-in por usuario.
- `CompanyConfig.allowedIps String @default("")` — lista de IP/CIDR permitidas (texto: separadas por coma, espacio o salto de línea; ej. `190.10.20.30, 190.10.20.0/24`). Texto simple para encajar con el patrón actual del config.

Migración **aditiva** (`ADD COLUMN IF NOT EXISTS`, defaults inofensivos). Nada se dropea.

## Servicio de acceso por IP (`IpAccessService`) — con caché

Para no pegar a la BD en cada request:
- `getEntries()`: lee `CompanyConfig.allowedIps`, parsea a lista de entradas válidas, **cachea ~30s** (TTL). 
- `hasWhitelist()`: true si hay ≥1 entrada válida.
- `isAllowed(ip)`: normaliza la IP y la compara contra entradas exactas y **CIDR IPv4** (matcher propio, ~15 líneas, sin dependencia nueva); IPv6 solo match exacto.
- `shouldBlock(ip, { restrict, role })`: aplica la regla fail-safe completa (incluida la exención ADMIN). Único punto de verdad usado por login y por el guard.

Cache de 30s: mover/perder la IP del local saca a los usuarios restringidos en ≤30s.

## Enforcement en 2 puntos

1. **Al login** (`auth.service.login`, recibe la `ip` del request desde el controller con `@Ip()`): tras validar credenciales, si `shouldBlock` → `ForbiddenException` con `code: 'OFFSITE_BLOCKED'` y mensaje "Acceso permitido solo desde el local". Se **embebe `restrictToOnSiteIp` en el payload JWT**.
2. **En cada request** (`jwt.strategy` con `passReqToCallback: true`): si `payload.restrictToOnSiteIp` y `shouldBlock(req.ip, …)` → `UnauthorizedException` `OFFSITE_BLOCKED`. Como TODOS los endpoints usan `AuthGuard('jwt')`, esto protege todo sin tocar controllers. La **whitelist se lee live (caché 30s)**; el **flag viene del token** (cambiarlo aplica al próximo login del usuario — documentado).

**Escenario cubierto:** usuario restringido loguea en el local (token con flag=true) y luego se va → el chequeo por-request con whitelist live lo bloquea al cambiar su IP. **Límite conocido:** marcar el flag a alguien YA logueado aplica en su próximo login (o al forzar re-login / desactivarlo).

## API

- `GET /auth/my-ip` (autenticado) → `{ ip }`. Para que en `/config` se vea la **IP pública actual** del que configura (así sabe cuál cargar).
- `PATCH /users/:id` (ya existe) acepta `restrictToOnSiteIp` (se agrega a `CreateUserDto`, que `UpdateUserDto` extiende).
- `PATCH /company-config` (ya existe) acepta `allowedIps` (se agrega a `UpdateCompanyConfigDto`).

## Frontend

- **`/config`**: sección "Acceso solo en sitio (IP-lock)" con un `textarea` de IPs/CIDR permitidas + ayuda, y un recuadro **"Tu IP pública actual: X.X.X.X"** (de `GET /auth/my-ip`) con botón para agregarla. Aviso de los caveats (IP fija, WiFi vs datos).
- **`/settings/users`**: toggle **"Solo en sitio"** por usuario. **Deshabilitado/oculto para usuarios ADMIN** (con nota "los ADMIN no se restringen").

## Orden seguro de activación (operacional)

1. Deploy (inerte — nadie afectado).
2. En `/config`, ver la IP pública del local (estando en el local) y cargarla; **verificarla**.
3. Marcar "Solo en sitio" a los usuarios elegidos **de a uno**, probando cada uno.

## Caveats operacionales (repetir al jefe — NO prometer sin esto)

- 🚩 **IP fija:** si el local tiene IP dinámica, cambia sola y bloquea a todos → pedir **IP fija** al ISP o usar **DDNS + resolución periódica**. *Confirmar antes si el local tiene IP fija.*
- **WiFi sí, datos móviles no** (con 4G/5G la IP es de la operadora, no coincide).
- **CGNAT:** verificar que el local tenga IP pública propia (no compartida/rotada por el ISP).
- **Riesgo residual:** pueden sacar **foto** a la pantalla; el candado mata la fuga fácil (acceso remoto / bajar todo desde casa), no es hermético.

## Fuera de alcance (v1)

- Candado 2 (bloquear exportación masiva Excel/PDF) — plan aparte.
- CIDR IPv6 (solo match exacto de IPv6).
- Rangos horarios, geolocalización, detección de VPN, DDNS automático.
- Efecto inmediato al prender el flag a un usuario ya logueado (aplica en su próximo login).

## Riesgos / notas

- **Auto-lockout:** mitigado por exención ADMIN + regla fail-safe + "mostrar tu IP actual" en `/config`. Si alguien igual se encierra, se arregla por BD (poner la IP o `restrictToOnSiteIp=false`) — documentar el comando.
- **trust proxy mal configurado** rompería la IP → por eso es configurable por env y se prueba mostrando la IP detectada en `/config` antes de activar.
- Aislado y aditivo → **deploy seguro** (default apagado). Aplica a cualquier instancia; se activa por empresa cuando quieran.
